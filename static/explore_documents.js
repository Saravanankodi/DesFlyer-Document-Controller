const documentRows = document.querySelector('#document-rows');
const toast = document.querySelector('#explore-toast');
const pageSizeSelect = document.querySelector('#per-page');
const archiveMode = new URLSearchParams(window.location.search).get('archived') === 'true';
let currentPage = 1;
let totalRows = 0;
let activeItems = [];
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

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatSize(bytes) {
  if (!bytes) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) ? 1 : 0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatIcon(format) {
  const normalizedFormat = String(format || '').trim().replace(/^\./, '').toUpperCase();
  if (['JPG', 'JPEG', 'PNG'].includes(normalizedFormat)) {
    return '<svg class="format-icon image" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="m6 17 4-4 3 3 2-2 3 3"/><circle cx="9" cy="9" r="1.5"/></svg>';
  }
  const typeClass = ['DOC', 'DOCX', 'TXT', 'XLSX'].includes(normalizedFormat) ? 'doc' : 'pdf';
  const mark = typeClass === 'pdf' ? '<path d="M8 15h8M8 18h6"/><text x="7" y="13" font-size="4">PDF</text>' : '<path d="M9 12h6M9 16h6"/>';
  return `<svg class="format-icon ${typeClass}" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>${mark}</svg>`;
}

function renderRows(items) {
  documentRows.innerHTML = items.map((doc) => `<tr data-id="${doc.id}">
    <td><input class="row-select" type="checkbox" value="${doc.id}" aria-label="Select ${escapeHtml(doc.document_title?.trim() || doc.filename)}" /></td>
    <td class="document-cell"><div class="document-name">${formatIcon(doc.format)}<span title="${escapeHtml(doc.document_title?.trim() || doc.filename)}">${escapeHtml(doc.document_title?.trim() || doc.filename)}</span></div></td>
    <td><a class="employee-link" href="/${doc.owner_type === 'employee' ? 'employees' : `${doc.owner_type}s`}/${doc.owner_id}/documents">${escapeHtml(doc.owner_name || doc.employee || '—')}</a></td><td>${escapeHtml(doc.owner_code || doc.employee_code || '—')}</td>
    <td><span class="category-pill" title="${escapeHtml(doc.category)}">${escapeHtml(doc.category)}</span></td>
    <td>${escapeHtml(doc.format)}</td><td>${formatSize(doc.file_size)}</td><td>${formatDate(doc.uploaded_at)}</td>
    <td><div class="document-actions"><button type="button" data-action="view" aria-label="View document"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.7"/></svg></button><button type="button" data-action="download" aria-label="Download document"><svg viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/></svg></button><button type="button" class="share-action" data-action="share" data-share-document="${doc.id}" aria-label="Share document"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4m-7.5 6.8 7.5 4.4"/></svg></button></div></td>
  </tr>`).join('');
  document.querySelector('#table-empty').hidden = items.length > 0;
  document.querySelector('#select-all').checked = false;
  updateSelection();
  documentRows.querySelectorAll('tr').forEach((row) => row.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const item = items.find((entry) => entry.id === Number(row.dataset.id));
    if (button.dataset.action === 'view') viewDocument(item);
    if (button.dataset.action === 'download') downloadDocument(item);
    if (button.dataset.action === 'share') return;
  }));
  documentRows.querySelectorAll('.row-select').forEach((checkbox) => checkbox.addEventListener('change', updateSelection));
}

function updateSelection() {
  const selected = [...document.querySelectorAll('.row-select:checked')];
  const toolbar = document.querySelector('#bulk-toolbar');
  const archiveButton = document.querySelector('#archive-selected');
  const isArchivedView = document.querySelector('#archived-filter').checked;
  toolbar.hidden = selected.length === 0;
  document.querySelector('#selection-count').textContent = `${selected.length} selected`;
  archiveButton.disabled = isArchivedView;
  archiveButton.title = isArchivedView ? 'These documents are already archived.' : 'Archive selected documents';
  const allBoxes = [...document.querySelectorAll('.row-select')];
  document.querySelector('#select-all').checked = allBoxes.length > 0 && selected.length === allBoxes.length;
}

let allOwners = { employee: [], client: [], project: [] };
async function loadOwners() {
  try {
    const responses = await Promise.all([fetch('/api/employees'), fetch('/api/clients'), fetch('/api/projects')]);
    if (responses.some((response) => !response.ok)) throw new Error();
    [allOwners.employee, allOwners.client, allOwners.project] = await Promise.all(responses.map((response) => response.json()));
    updateOwnerOptions();
  } catch { showToast('Could not load document owner filters.'); }
}
function updateOwnerOptions() {
  const type = document.querySelector('#owner-type-filter').value;
  const select = document.querySelector('#owner-filter');
  const records = type ? allOwners[type] : [];
  select.innerHTML = '<option value="">Any record</option>' + records.map((owner) => `<option value="${owner.id}">${escapeHtml(owner.name)}</option>`).join('');
  select.disabled = !type;
}

async function loadDocuments() {
  const params = new URLSearchParams({ page: String(currentPage), per_page: pageSizeSelect.value, archived: String(document.querySelector('#archived-filter').checked) });
  const query = document.querySelector('#document-query').value.trim();
  const ownerType = document.querySelector('#owner-type-filter').value;
  const ownerId = document.querySelector('#owner-filter').value;
  const category = document.querySelector('#category-filter').value;
  const fileType = document.querySelector('#type-filter').value;
  const dateFrom = document.querySelector('#date-from').value;
  const dateTo = document.querySelector('#date-to').value;
  if (query) params.set('q', query);
  if (ownerType) params.set('owner_type', ownerType);
  if (ownerId) params.set('owner_id', ownerId);
  if (category) params.set('category', category);
  if (fileType) params.set('file_type', fileType);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  try {
    const response = await fetch(`/api/documents/explore?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load documents.');
    totalRows = data.total;
    const lastPage = Math.max(1, Math.ceil(totalRows / Number(pageSizeSelect.value)));
    if (currentPage > lastPage) { currentPage = lastPage; return loadDocuments(); }
    activeItems = data.items;
    renderRows(data.items);
    const first = totalRows ? (currentPage - 1) * Number(pageSizeSelect.value) + 1 : 0;
    const last = Math.min(currentPage * Number(pageSizeSelect.value), totalRows);
    document.querySelector('#page-range').textContent = `${first}–${last} of ${totalRows.toLocaleString()}`;
    document.querySelector('#page-prev').disabled = currentPage <= 1;
    document.querySelector('#page-next').disabled = last >= totalRows;
    const categorySelect = document.querySelector('#category-filter');
    const priorCategory = categorySelect.value;
    categorySelect.innerHTML = '<option value="">Category</option>' + data.categories.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    categorySelect.value = priorCategory;
  } catch (error) {
    renderRows([]);
    showToast(error.message);
  }
}

async function viewDocument(item) {
  window.location.href = `/documents/${item.id}/view`;
}

async function downloadDocument(item) {
  try {
    const response = await fetch(`/api/documents/${item.id}/download`);
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Download failed.');
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = item.filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { showToast(error.message); }
}

let searchTimer;
document.querySelector('#document-query').addEventListener('input', () => {
  clearTimeout(searchTimer);
  currentPage = 1;
  searchTimer = setTimeout(loadDocuments, 220);
});
document.querySelector('#owner-type-filter').addEventListener('change', () => { updateOwnerOptions(); currentPage = 1; loadDocuments(); });
document.querySelector('#owner-filter').addEventListener('change', () => { currentPage = 1; loadDocuments(); });
['#category-filter', '#type-filter', '#date-from', '#date-to', '#archived-filter'].forEach((selector) => {
  document.querySelector(selector).addEventListener('change', () => { currentPage = 1; loadDocuments(); });
});
pageSizeSelect.addEventListener('change', () => { currentPage = 1; loadDocuments(); });
document.querySelector('#page-prev').addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; loadDocuments(); } });
document.querySelector('#page-next').addEventListener('click', () => { if (currentPage * Number(pageSizeSelect.value) < totalRows) { currentPage += 1; loadDocuments(); } });
document.querySelector('#select-all').addEventListener('change', (event) => {
  document.querySelectorAll('.row-select').forEach((checkbox) => { checkbox.checked = event.target.checked; });
  updateSelection();
});
const archiveDialog = document.querySelector('#archive-confirm-dialog');
const archiveConfirmButton = document.querySelector('#archive-confirm');
let pendingArchiveIds = [];
document.querySelector('#archive-selected').addEventListener('click', () => {
  pendingArchiveIds = [...document.querySelectorAll('.row-select:checked')].map((checkbox) => Number(checkbox.value));
  if (!pendingArchiveIds.length) return;
  const count = pendingArchiveIds.length;
  document.querySelector('#archive-confirm-message').textContent = `Archive ${count} selected document${count === 1 ? '' : 's'}? They will be moved out of the active documents list.`;
  archiveDialog.showModal();
});
document.querySelector('#archive-cancel').addEventListener('click', () => archiveDialog.close());
archiveConfirmButton.addEventListener('click', async () => {
  if (!pendingArchiveIds.length) return;
  archiveConfirmButton.disabled = true;
  try {
    const response = await fetch('/api/documents/bulk-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: pendingArchiveIds }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Archive action failed.');
    if (!result.updated) throw new Error('No active selected documents were found to archive.');
    archiveDialog.close();
    showToast(`${result.updated} document${result.updated === 1 ? '' : 's'} archived.`);
    pendingArchiveIds = [];
    await loadDocuments();
  } catch (error) { showToast(error.message); }
  finally { archiveConfirmButton.disabled = false; }
});
document.querySelector('#more-filters-toggle').addEventListener('click', () => {
  const filters = document.querySelector('#more-filters');
  filters.hidden = !filters.hidden;
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  document.querySelector('#document-query').value = '';
  document.querySelector('#owner-type-filter').value = '';
  updateOwnerOptions();
  document.querySelector('#category-filter').value = '';
  document.querySelector('#type-filter').value = '';
  document.querySelector('#date-from').value = '';
  document.querySelector('#date-to').value = '';
  document.querySelector('#archived-filter').checked = false;
  currentPage = 1;
  loadDocuments();
});
document.querySelector('#dialog-close').addEventListener('click', () => document.querySelector('#document-dialog').close());
document.querySelector('#document-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector('#archived-filter').checked = archiveMode;
loadOwners();
loadDocuments();
