import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, deleteDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STATE ---
let tableData, styleOptions, selection, loadedTableName, columnStyles, loadedTableId;

const defaultState = {
  tableData: [
    [
      { content: 'Header 1', colspan: 1, rowspan: 1, isHidden: false, isLabel: false },
      { content: 'Header 2', colspan: 1, rowspan: 1, isHidden: false, isLabel: false },
      { content: 'Header 3', colspan: 1, rowspan: 1, isHidden: false, isLabel: false }
    ],
    [
      { content: 'Row 1, Cell 1', colspan: 1, rowspan: 1, isHidden: false, isLabel: true },
      { content: 'Row 1, Cell 2', colspan: 1, rowspan: 1, isHidden: false, isLabel: false },
      { content: 'Row 1, Cell 3', colspan: 1, rowspan: 1, isHidden: false, isLabel: false }
    ],
    [
      { content: 'Row 2, Cell 1', colspan: 1, rowspan: 1, isHidden: false, isLabel: true },
      { content: 'Row 2, Cell 2', colspan: 1, rowspan: 1, isHidden: false, isLabel: false },
      { content: 'Row 2, Cell 3', colspan: 1, rowspan: 1, isHidden: false, isLabel: false }
    ]
  ],
  columnStyles: [
    { align: 'left' }, { align: 'left' }, { align: 'left' }
  ],
  styleOptions: {
    headerBg: '#0E7490',
    headerColor: '#FFFFFF',
    stripeColor: '#F3F4F6',
    cellTextColor: '#333333',
    labelTextColor: '#333333',
    headerFontWeight: '700',
    cellFontWeight: '400',
    labelFontWeight: '600',
    hLineWeight: 1,
    hLineColor: '#E5E7EB',
    vLineWeight: 1,
    vLineColor: '#E5E7EB'
  },
  selection: { start: null, end: null, isSelecting: false },
  loadedTableName: '',
  loadedTableId: null
};

let db;
let auth;
let tablesCollection;
let savedTablesCache = [];

// --- DOM ELEMENTS ---
const notificationArea = document.getElementById('notification-area');
const editorContainer = document.getElementById('editor-container');
const previewContainer = document.getElementById('preview-container');
const htmlOutput = document.getElementById('html-output');
const copyButton = document.getElementById('copy-button');
const addRowBtn = document.getElementById('add-row-btn');
const addColBtn = document.getElementById('add-col-btn');
const selectionControlsContainer = document.getElementById('selection-controls');
const saveNameInput = document.getElementById('save-name-input');
const saveUpdateBtn = document.getElementById('save-update-btn');
const savedTablesList = document.getElementById('saved-tables-list');
const loadedTableNameEl = document.getElementById('loaded-table-name');
const newTableBtn = document.getElementById('new-table-btn');

// Style controls
defineStyleInputs();

function defineStyleInputs() {
  window.headerBgColorInput = document.getElementById('header-bg-color');
  window.headerTextColorInput = document.getElementById('header-text-color');
  window.stripeColorInput = document.getElementById('stripe-color');
  window.cellTextColorInput = document.getElementById('cell-text-color');
  window.labelTextColorInput = document.getElementById('label-text-color');
  window.headerFontWeightSelect = document.getElementById('header-font-weight');
  window.cellFontWeightSelect = document.getElementById('cell-font-weight');
  window.labelFontWeightSelect = document.getElementById('label-font-weight');
  window.hLineWeightInput = document.getElementById('h-line-weight');
  window.hLineColorInput = document.getElementById('h-line-color');
  window.vLineWeightInput = document.getElementById('v-line-weight');
  window.vLineColorInput = document.getElementById('v-line-color');
}

// --- NOTIFICATION ---
function showNotification(message, type = 'info') {
  const colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600' };
  const notif = document.createElement('div');
  notif.className = `notification ${colors[type]} text-white text-sm font-semibold py-2 px-4 mb-2`;
  notif.textContent = message;
  notificationArea.appendChild(notif);
  setTimeout(() => notif.classList.add('show'), 10);
  setTimeout(() => {
    notif.classList.remove('show');
    notif.addEventListener('transitionend', () => notif.remove());
  }, 3000);
}

// --- RENDER FUNCTIONS (editor, preview, output) ---
function render() {
  renderEditor();
  renderPreview();
  renderHtmlOutput();
  updateSelectionControls();
  renderLoadedTableName();
}

function renderEditor() {
  const table = document.createElement('table');
  table.className = 'w-full text-sm border-collapse editor-table';

  const tbody = document.createElement('tbody');
  tableData.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((cell, colIndex) => {
      if (cell.isHidden) return;
      const td = document.createElement('td');
      td.colSpan = cell.colspan;
      td.rowSpan = cell.rowspan;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = cell.content;
      input.style.textAlign = columnStyles[colIndex].align;
      input.dataset.row = rowIndex;
      input.dataset.col = colIndex;
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  editorContainer.innerHTML = '';
  editorContainer.appendChild(table);
}

function renderPreview() {
  previewContainer.innerHTML = generateCleanHTML(true);
}

function renderHtmlOutput() {
  htmlOutput.value = generateCleanHTML(false);
}

function generateCleanHTML(isPreview) {
  if (!tableData.length) return '<p>No table data.</p>';
  let html = '<table class="w-full border-collapse">';
  tableData.forEach((row) => {
    html += '<tr>';
    row.forEach((cell, index) => {
      if (!cell.isHidden) {
        html += `<td style="text-align:${columnStyles[index].align}" colspan="${cell.colspan}" rowspan="${cell.rowspan}">${cell.content}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

// --- INPUT FIX (Fluid Typing) ---
editorContainer.addEventListener('input', (e) => {
  if (e.target.tagName === 'INPUT') {
    resetToUnsavedState(false);
    const { row, col } = e.target.dataset;
    tableData[row][col].content = e.target.value; // update data only
  }
});

editorContainer.addEventListener('blur', (e) => {
  if (e.target.tagName === 'INPUT') render(); // render after typing finishes
}, true);

// --- ADD ROW / COL ---
const newCell = () => ({ content: '', colspan: 1, rowspan: 1, isHidden: false, isLabel: false });
addRowBtn.addEventListener('click', () => {
  resetToUnsavedState();
  const colCount = tableData[0]?.length || 1;
  tableData.push(Array.from({ length: colCount }, newCell));
  render();
});
addColBtn.addEventListener('click', () => {
  resetToUnsavedState();
  columnStyles.push({ align: 'left' });
  tableData.forEach((row) => row.push(newCell()));
  render();
});

// --- COPY HTML ---
copyButton.addEventListener('click', () => {
  htmlOutput.select();
  document.execCommand('copy');
  showNotification('HTML Copied!', 'success');
});

// --- FIREBASE INIT ---
async function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyBWPIxUuxhZti7puPRIUx8btSKEqL9cqr4",
    authDomain: "webflow-tables-bce.firebaseapp.com",
    projectId: "webflow-tables-bce",
    storageBucket: "webflow-tables-bce.firebasestorage.app",
    messagingSenderId: "760897636153",
    appId: "1:760897636153:web:7f0f9583f45839003bcae8"
  };

  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    onAuthStateChanged(auth, (user) => {
      if (user) setupFirestoreListeners();
      else signInAnonymously(auth).catch((error) => showNotification(`Auth failed: ${error.message}`, 'error'));
    });
  } catch (error) {
    console.error('Firebase init failed:', error);
    showNotification(`Init error: ${error.message}`, 'error');
  }
}

function setupFirestoreListeners() {
  tablesCollection = collection(db, 'shared-tables');
  onSnapshot(tablesCollection, (snapshot) => {
    savedTablesCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  });
  showNotification('Database connected', 'success');
}

function resetToUnsavedState(clearName = true) {
  loadedTableId = null;
  loadedTableName = '';
  if (clearName) saveNameInput.value = '';
}

function resetState() {
  tableData = JSON.parse(JSON.stringify(defaultState.tableData));
  styleOptions = JSON.parse(JSON.stringify(defaultState.styleOptions));
  selection = JSON.parse(JSON.stringify(defaultState.selection));
  columnStyles = JSON.parse(JSON.stringify(defaultState.columnStyles));
  loadedTableName = defaultState.loadedTableName;
  loadedTableId = defaultState.loadedTableId;
  render();
}

resetState();
initFirebase();
