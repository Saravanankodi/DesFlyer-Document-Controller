const employeeId = Number(window.location.pathname.match(/\/employees\/(\d+)\/documents/)?.[1]);
const toast = document.querySelector('#employee-toast');
const employeeSwitchQuery = document.querySelector('#employee-switch-query');
const employeeSwitchResults = document.querySelector('#employee-switch-results');
let allDocuments = [];
let employeeChoices = [];
let employeeData = null;
let currentPage = 1;
const rowsPerPage = 5;
let debounceTimer;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatSize(bytes) {
  if (!bytes) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) ? 1 : 0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function renderEmployee(employee) {
  employeeData = employee;
  const initialsValue = initials(employee.name);
  document.title = `${employee.name}’s Documents — DesFlyer`;
  const avatar = document.querySelector('#employee-avatar');
  avatar.textContent = initialsValue;
  if (employee.photo_filename) {
    const photo = document.createElement('img');
    photo.src = `/employee-photos/${encodeURIComponent(employee.photo_filename)}`;
    photo.alt = `${employee.name} profile photo`;
    photo.onerror = () => { photo.remove(); avatar.textContent = initialsValue; };
    avatar.replaceChildren(photo);
  }
  document.querySelector('#employee-name').textContent = employee.name;
  document.querySelector('#list-employee-name').textContent = employee.name;
  document.querySelector('#employee-code').textContent = employee.employee_code || '—';
  document.querySelector('#employee-designation').textContent = employee.designation || '—';
  document.querySelector('#employee-department').textContent = employee.department || '—';
  employeeSwitchQuery.value = employee.name;
}

async function loadEmployeeChoices() {
  try {
    const response = await fetch('/api/employees');
    if (!response.ok) throw new Error('Could not load employees.');
    employeeChoices = await response.json();
  } catch (error) { showToast(error.message); }
}

function showEmployeeMatches(query) {
  const needle = query.trim().toLowerCase();
  employeeSwitchResults.replaceChildren();
  if (!needle) { employeeSwitchResults.hidden = true; return; }
  const matches = employeeChoices.filter((employee) => `${employee.name} ${employee.employee_code || ''}`.toLowerCase().includes(needle)).slice(0, 6);
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'employee-switch-empty';
    empty.textContent = 'No matching employees';
    employeeSwitchResults.append(empty);
  } else {
    matches.forEach((employee) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'employee-switch-option';
      const name = document.createElement('strong');
      const code = document.createElement('small');
      name.textContent = employee.name;
      code.textContent = employee.employee_code || '';
      option.append(name, code);
      option.addEventListener('click', () => { window.location.href = `/employees/${employee.id}/documents`; });
      employeeSwitchResults.append(option);
    });
  }
  employeeSwitchResults.hidden = false;
}

function iconFor(format) {
  if (['JPG', 'JPEG', 'PNG'].includes(format)) {
    return '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="m6 17 4-4 3 3 2-2 3 3"/><circle cx="9" cy="9" r="1.5"/></svg>';
  }
  return `<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M8 15h8M8 18h6"/>${format === 'PDF' ? '<text x="7" y="13" font-size="4">PDF</text>' : ''}</svg>`;
}

function renderRows() {
  const startIndex = (currentPage - 1) * rowsPerPage;
  const pageRows = allDocuments.slice(startIndex, startIndex + rowsPerPage);
  const tbody = document.querySelector('#employee-document-rows');
  tbody.innerHTML = pageRows.map((doc) => {
    const priority = (doc.priority || 'Medium').toLowerCase();
    const iconClass = ['JPG', 'JPEG', 'PNG'].includes(doc.format) ? ' image' : '';
    return `<tr data-id="${doc.id}"><td><div class="employee-file-name"><span class="employee-file-icon${iconClass}">${iconFor(escapeHtml(doc.format))}</span><span title="${escapeHtml(doc.document_title?.trim() || doc.filename)}">${escapeHtml(doc.document_title?.trim() || doc.filename)}</span></div></td><td>${escapeHtml(doc.format)}</td><td>${formatDate(doc.uploaded_at)}</td><td><span class="priority-badge ${priority}">${escapeHtml(doc.priority || 'Medium')}</span></td><td>${formatSize(doc.file_size)}</td><td><div class="employee-row-actions"><button type="button" class="open-document" data-row-action="open" aria-label="Open document" title="Open document"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.7"/></svg></button><button type="button" class="row-more" data-row-action="menu" aria-label="More actions">⋮</button><div class="row-menu" hidden><button type="button" data-menu-action="open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.7"/></svg><span>Open document</span></button><button type="button" data-menu-action="download"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/></svg><span>Download</span></button><button type="button" data-menu-action="share" data-share-document="${doc.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4m-7.5 6.8 7.5 4.4"/></svg><span>Share</span></button><button type="button" data-menu-action="archive"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg><span>Archive</span></button></div></div></td></tr>`;
  }).join('');
  document.querySelector('#employee-empty').hidden = pageRows.length > 0;
  document.querySelector('#documents-found').textContent = `${allDocuments.length} document${allDocuments.length === 1 ? '' : 's'} found`;
  document.querySelector('#showing-documents').textContent = `Showing ${allDocuments.length ? startIndex + 1 : 0} to ${Math.min(startIndex + rowsPerPage, allDocuments.length)} of ${allDocuments.length} documents`;
  document.querySelector('#documents-prev').disabled = currentPage <= 1;
  document.querySelector('#documents-next').disabled = startIndex + rowsPerPage >= allDocuments.length;

  tbody.querySelectorAll('tr').forEach((row) => row.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-row-action]')?.dataset.rowAction;
    const menuAction = event.target.closest('[data-menu-action]')?.dataset.menuAction;
    const id = Number(row.dataset.id);
    if (action === 'menu') {
      const menu = row.querySelector('.row-menu');
      document.querySelectorAll('.row-menu').forEach((other) => { if (other !== menu) other.hidden = true; });
      menu.hidden = !menu.hidden;
      return;
    }
    if (action === 'open' || menuAction === 'open') {
      window.location.href = `/documents/${id}/view`;
      return;
    }
    if (action === 'download' || menuAction === 'download') await downloadDocument(id, row);
    if (action === 'archive' || menuAction === 'archive') await archiveDocument(id);
  }));
}

async function loadDocuments() {
  if (!employeeId) return;
  const globalQuery = window.matchMedia('(max-width:700px)').matches ? '' : document.querySelector('#employee-global-query').value;
  const query = [globalQuery, document.querySelector('#document-query').value]
    .map((value) => value.trim()).filter(Boolean).join(' ');
  const params = new URLSearchParams({ sort: document.querySelector('#sort-order').value });
  if (query) params.set('q', query);
  if (document.querySelector('#format-filter').value) params.set('file_type', document.querySelector('#format-filter').value);
  try {
    const response = await fetch(`/api/employees/${employeeId}/documents?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load employee documents.');
    renderEmployee(data.employee);
    document.querySelector('#document-count').textContent = data.total;
    allDocuments = data.documents;
    currentPage = Math.min(currentPage, Math.max(1, Math.ceil(allDocuments.length / rowsPerPage)));
    renderRows();
  } catch (error) { showToast(error.message); }
}

async function downloadDocument(id, row) {
  const doc = allDocuments.find((item) => item.id === id);
  try {
    const response = await fetch(`/api/documents/${id}/download`);
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Download failed.');
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = doc?.filename || 'document';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { showToast(error.message); }
  row?.querySelector('.row-menu')?.setAttribute('hidden', '');
}

async function archiveDocument(id) {
  try {
    const response = await fetch(`/api/documents/${id}/archive`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not archive this document.');
    showToast('Document archived.');
    loadDocuments();
  } catch (error) { showToast(error.message); }
}

function queueLoad() {
  currentPage = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadDocuments, 200);
}
document.querySelector('#employee-global-query').addEventListener('input', queueLoad);
employeeSwitchQuery.addEventListener('input', () => showEmployeeMatches(employeeSwitchQuery.value));
employeeSwitchQuery.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const firstOption = employeeSwitchResults.querySelector('.employee-switch-option');
    if (firstOption) { event.preventDefault(); firstOption.click(); }
  }
  if (event.key === 'Escape') employeeSwitchResults.hidden = true;
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.employee-switch-search')) employeeSwitchResults.hidden = true;
});
document.querySelector('#document-query').addEventListener('input', queueLoad);
document.querySelector('#format-filter').addEventListener('change', queueLoad);
document.querySelector('#sort-order').addEventListener('change', queueLoad);
document.querySelector('#documents-prev').addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderRows(); } });
document.querySelector('#documents-next').addEventListener('click', () => { if (currentPage * rowsPerPage < allDocuments.length) { currentPage += 1; renderRows(); } });
document.addEventListener('click', (event) => {
  if (!event.target.closest('.employee-row-actions')) document.querySelectorAll('.row-menu').forEach((menu) => { menu.hidden = true; });
});

loadEmployeeChoices();
loadDocuments();
