const uploadForm = document.querySelector('#upload-form');
const ownerTypeSelect = document.querySelector('#owner-type');
const employeeSearch = document.querySelector('#employee-search');
const employeeMenu = document.querySelector('#employee-menu');
const employeeFileInput = document.querySelector('#document-file');
const documentNameInput = document.querySelector('#document-name');
const dropzone = document.querySelector('#dropzone');
const fileRow = document.querySelector('#file-row');
const uploadMessage = document.querySelector('#upload-message');
const ownerChoices = { employee: [], client: [], project: [] };
let ownerType = 'employee';
let selectedOwner = null;
let selectedFile = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
function setOwner(owner) {
  selectedOwner = owner || null;
  const ownerTitle = ownerType[0].toUpperCase() + ownerType.slice(1);
  const card = document.querySelector('#selected-employee');
  const empty = document.querySelector('#employee-empty');
  card.hidden = !selectedOwner;
  empty.hidden = Boolean(selectedOwner);
  empty.textContent = `No ${ownerType} selected`;
  if (selectedOwner) {
    document.querySelector('#selected-avatar').textContent = initials(selectedOwner.name);
    document.querySelector('#selected-name').textContent = selectedOwner.name;
    const ownerCode = selectedOwner.employee_code || selectedOwner.client_code || selectedOwner.project_code || '';
    const ownerDetail = selectedOwner.designation || selectedOwner.company || selectedOwner.client_name || selectedOwner.status || '';
    document.querySelector('#selected-meta').textContent = [ownerCode, ownerDetail].filter(Boolean).join(' · ');
    document.querySelector('#summary-owner').textContent = selectedOwner.name;
    document.querySelector('#summary-mobile-owner-name').textContent = selectedOwner.name;
    document.querySelector('#summary-mobile-owner-id').textContent = ownerCode || '—';
  } else {
    document.querySelector('#summary-owner').textContent = '—';
    document.querySelector('#summary-mobile-owner-name').textContent = '—';
    document.querySelector('#summary-mobile-owner-id').textContent = '—';
  }
  document.querySelector('#summary-owner-type').textContent = ownerTitle;
  document.querySelector('#summary-mobile-name-label').textContent = ownerTitle;
  document.querySelector('#summary-mobile-id-label').textContent = `${ownerTitle} ID`;
  document.querySelector('#owner-step-heading').textContent = `Select ${ownerTitle}`;
}
function updateOwnerType() {
  ownerType = ownerTypeSelect.value;
  selectedOwner = null;
  const title = ownerType[0].toUpperCase() + ownerType.slice(1);
  const searchLabel = document.querySelector('#owner-search-label');
  searchLabel.textContent = `Search ${title}`;
  employeeSearch.placeholder = `Search ${ownerType}s by name or ID`;
  employeeSearch.setAttribute('aria-label', `Search ${title}`);
  employeeSearch.value = '';
  employeeMenu.hidden = true;
  setOwner(null);
}
function renderOwnerMenu(query = '') {
  const needle = query.trim().toLowerCase();
  const matches = ownerChoices[ownerType].filter((item) => `${item.name} ${item.employee_code || ''} ${item.client_code || ''} ${item.project_code || ''} ${item.designation || ''} ${item.company || ''} ${item.email || ''} ${item.client_name || ''}`.toLowerCase().includes(needle));
  employeeMenu.innerHTML = matches.length ? matches.map((item) => {
    const code = item.employee_code || item.client_code || item.project_code || '';
    const detail = item.designation || item.company || item.email || item.client_name || item.status || '';
    return `<button type="button" class="employee-option" data-owner-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([code, detail].filter(Boolean).join(' · '))}</small></button>`;
  }).join('') : `<div class="employee-option"><strong>No matching ${ownerType}s</strong></div>`;
  employeeMenu.hidden = false;
  employeeMenu.querySelectorAll('[data-owner-id]').forEach((option) => option.addEventListener('click', () => {
    const owner = ownerChoices[ownerType].find((item) => item.id === Number(option.dataset.ownerId));
    employeeSearch.value = owner?.name || '';
    setOwner(owner);
    employeeMenu.hidden = true;
  }));
}
async function loadOwners() {
  try {
    const [employeeResponse, clientResponse, projectResponse] = await Promise.all([fetch('/api/employees'), fetch('/api/clients'), fetch('/api/projects')]);
    if (![employeeResponse, clientResponse, projectResponse].every((response) => response.ok)) throw new Error('Could not load document owners.');
    [ownerChoices.employee, ownerChoices.client, ownerChoices.project] = await Promise.all([employeeResponse.json(), clientResponse.json(), projectResponse.json()]);
    const params = new URLSearchParams(location.search);
    const requestedType = params.get('owner_type') || (params.has('employee_id') ? 'employee' : '');
    if (['employee', 'client', 'project'].includes(requestedType)) ownerTypeSelect.value = requestedType;
    updateOwnerType();
    const requestedId = Number(params.get('owner_id') || params.get('employee_id'));
    if (requestedId && ownerChoices[ownerType].some((item) => item.id === requestedId)) {
      const record = ownerChoices[ownerType].find((item) => item.id === requestedId);
      employeeSearch.value = record.name;
      setOwner(record);
    }
  } catch (error) { uploadMessage.textContent = error.message; }
}
async function loadCategories() {
  try {
    const response = await fetch('/api/admin/categories');
    const categories = await response.json();
    if (!response.ok || !categories.length) return;
    const select = document.querySelector('#document-category');
    select.innerHTML = categories.map((category) => `<option>${escapeHtml(category.name)}</option>`).join('');
    document.querySelector('#summary-category').textContent = select.value;
  } catch { /* Keep the built-in categories if settings cannot be loaded. */ }
}
function fileSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function setFile(file) {
  uploadMessage.textContent = '';
  if (!file) {
    selectedFile = null; employeeFileInput.value = ''; fileRow.hidden = true;
    document.querySelector('#summary-size').textContent = '—'; documentNameInput.value = ''; return;
  }
  if (!/\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(file.name)) {
    setFile(null); uploadMessage.textContent = 'Choose a PDF, DOC, DOCX, JPG, or PNG file.'; return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setFile(null); uploadMessage.textContent = 'Files must be 20 MB or smaller.'; return;
  }
  selectedFile = file;
  document.querySelector('#file-name').textContent = file.name;
  document.querySelector('#summary-size').textContent = fileSize(file.size);
  documentNameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  employeeFileInput.value = '';
  fileRow.hidden = false;
}

ownerTypeSelect.addEventListener('change', updateOwnerType);
employeeSearch.addEventListener('focus', () => renderOwnerMenu(employeeSearch.value === selectedOwner?.name ? '' : employeeSearch.value));
employeeSearch.addEventListener('input', () => {
  if (selectedOwner && employeeSearch.value !== selectedOwner.name) setOwner(null);
  renderOwnerMenu(employeeSearch.value);
});
document.querySelector('#employee-menu-toggle').addEventListener('click', () => renderOwnerMenu(''));
document.querySelector('#clear-employee').addEventListener('click', () => {
  setOwner(null);
  employeeSearch.value = ''; renderOwnerMenu(''); employeeSearch.focus();
});
document.addEventListener('click', (event) => { if (!event.target.closest('.employee-search-wrap')) employeeMenu.hidden = true; });
dropzone.addEventListener('click', () => employeeFileInput.click());
dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); employeeFileInput.click(); } });
employeeFileInput.addEventListener('change', () => setFile(employeeFileInput.files[0]));
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); const file = event.dataTransfer.files[0]; if (!file) return; try { employeeFileInput.files = event.dataTransfer.files; } catch { /* Submit uses selectedFile. */ } setFile(file); });
document.querySelector('#remove-file').addEventListener('click', () => setFile(null));
document.querySelector('#document-category').addEventListener('change', (event) => { document.querySelector('#summary-category').textContent = event.target.value; });
uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault(); uploadMessage.textContent = '';
  if (!selectedOwner) { uploadMessage.textContent = `Select a ${ownerType} first.`; return; }
  if (!selectedFile) { uploadMessage.textContent = 'Choose a document to upload.'; return; }
  const title = document.querySelector('#document-name').value.trim();
  if (!title) { uploadMessage.textContent = 'Enter a document name.'; return; }
  const submit = uploadForm.querySelector('.submit-upload'); submit.disabled = true; submit.lastChild.textContent = ' Uploading…';
  const data = new FormData(); data.append('file', selectedFile); data.append('owner_type', ownerType); data.append('owner_id', selectedOwner.id); data.append('document_name', title); data.append('category', document.querySelector('#document-category').value);
  try {
    const response = await fetch('/api/documents', { method: 'POST', body: data }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed.');
    location.href = '/documents?document_uploaded=1';
  } catch (error) { uploadMessage.textContent = error.message; submit.disabled = false; submit.lastChild.textContent = ' Upload Document'; }
});
loadOwners();
loadCategories();
