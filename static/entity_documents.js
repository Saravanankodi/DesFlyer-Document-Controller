const page = document.body;
const ownerType = page.dataset.ownerType;
const ownerId = Number(page.dataset.ownerId);
const typeLabel = ownerType[0].toUpperCase() + ownerType.slice(1);
let allDocuments = [];
let visibleDocuments = [];
let currentPage = 1;
const rowsPerPage = 5;
let toastTimer;
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function initials(name) { return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatSize(bytes) { return !bytes ? '—' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes % 1048576 ? 1 : 0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }); }
function iconFor(format) {
  if (['JPG', 'JPEG', 'PNG'].includes(format)) return '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="m6 17 4-4 3 3 2-2 3 3"/><circle cx="9" cy="9" r="1.5"/></svg>';
  return `<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M8 15h8M8 18h6"/>${format === 'PDF' ? '<text x="7" y="13" font-size="4">PDF</text>' : ''}</svg>`;
}
function showToast(message) {
  const toast = document.querySelector('#owner-toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}
function renderRows() {
  const query = `${document.querySelector('#owner-global-query').value} ${document.querySelector('#document-query').value}`.trim().toLowerCase();
  const format = document.querySelector('#format-filter').value.toUpperCase();
  const sort = document.querySelector('#sort-order').value;
  visibleDocuments = allDocuments.filter((doc) => (!format || doc.format === format) && (!query || `${doc.filename} ${doc.document_title || ''} ${doc.category} ${doc.format}`.toLowerCase().includes(query)));
  visibleDocuments.sort((a, b) => {
    const delta = new Date(a.uploaded_at) - new Date(b.uploaded_at);
    return sort === 'oldest' ? delta : -delta;
  });
  const pages = Math.max(1, Math.ceil(visibleDocuments.length / rowsPerPage));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * rowsPerPage;
  const pageRows = visibleDocuments.slice(start, start + rowsPerPage);
  const tbody = document.querySelector('#owner-document-rows');
  tbody.innerHTML = pageRows.map((doc) => {
    const priority = (doc.priority || 'Medium').toLowerCase();
    const imageClass = ['JPG', 'JPEG', 'PNG'].includes(doc.format) ? ' image' : '';
    return `<tr data-id="${doc.id}"><td><div class="employee-file-name"><span class="employee-file-icon${imageClass}">${iconFor(doc.format)}</span><span title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</span></div></td><td>${escapeHtml(doc.format)}</td><td>${formatDate(doc.uploaded_at)}</td><td><span class="priority-badge ${priority}">${escapeHtml(doc.priority || 'Medium')}</span></td><td>${formatSize(doc.file_size)}</td><td><div class="employee-row-actions"><button type="button" class="open-document" data-row-action="open">Open</button><button type="button" class="row-more" data-row-action="menu" aria-label="More actions">⋮</button><div class="row-menu" hidden><button type="button" data-menu-action="open">Open document</button><button type="button" data-menu-action="download">Download</button><button type="button" data-menu-action="share" data-share-document="${doc.id}">Share</button><button type="button" data-menu-action="archive">Archive</button></div></div></td></tr>`;
  }).join('');
  const empty = visibleDocuments.length === 0;
  document.querySelector('#owner-empty').hidden = !empty;
  document.querySelector('#documents-found').textContent = `${visibleDocuments.length} document${visibleDocuments.length === 1 ? '' : 's'} found`;
  document.querySelector('#showing-documents').textContent = `Showing ${visibleDocuments.length ? start + 1 : 0} to ${Math.min(start + rowsPerPage, visibleDocuments.length)} of ${visibleDocuments.length} documents`;
  document.querySelector('#documents-prev').disabled = currentPage <= 1;
  document.querySelector('#documents-next').disabled = start + rowsPerPage >= visibleDocuments.length;
  tbody.querySelectorAll('tr').forEach((row) => row.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-row-action]')?.dataset.rowAction;
    const menuAction = event.target.closest('[data-menu-action]')?.dataset.menuAction;
    const id = Number(row.dataset.id);
    if (action === 'menu') {
      const menu = row.querySelector('.row-menu');
      document.querySelectorAll('.row-menu').forEach((other) => { if (other !== menu) other.hidden = true; });
      menu.hidden = !menu.hidden; return;
    }
    if (action === 'open' || menuAction === 'open') { location.href = `/documents/${id}/view`; return; }
    if (action === 'download' || menuAction === 'download') await downloadDocument(id);
    if (action === 'archive' || menuAction === 'archive') await archiveDocument(id);
  }));
}
async function downloadDocument(id) {
  const doc = allDocuments.find((item) => item.id === id);
  try {
    const response = await fetch(`/api/documents/${id}/download`);
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Download failed.'); }
    const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = doc?.filename || 'document'; link.click(); URL.revokeObjectURL(link.href);
  } catch (error) { showToast(error.message); }
}
async function archiveDocument(id) {
  try {
    const response = await fetch(`/api/documents/${id}/archive`, { method: 'POST' }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not archive this document.');
    allDocuments = allDocuments.filter((doc) => doc.id !== id); renderRows(); showToast('Document archived.');
  } catch (error) { showToast(error.message); }
}
async function load() {
  try {
    const response = await fetch(`/api/owners/${ownerType}/${ownerId}/documents`); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load this record.');
    const owner = data.owner;
    const code = owner.employee_code || owner.client_code || owner.project_code || '—';
    const firstDetail = ownerType === 'client' ? owner.company || 'Client record' : owner.client_name || 'No linked client';
    const secondDetail = ownerType === 'client' ? owner.email || 'No contact email' : owner.status || 'Active';
    document.title = `${owner.name}’s Documents — DesFlyer`;
    document.querySelector('#owner-breadcrumb').textContent = `${owner.name}’s Documents`;
    document.querySelector('#owner-heading').textContent = `${typeLabel} Documents`;
    document.querySelector('#owner-description').textContent = `View and manage documents associated with this ${ownerType}.`;
    document.querySelector('#owner-avatar').textContent = initials(owner.name);
    document.querySelector('#owner-name').textContent = owner.name;
    document.querySelector('#owner-status').textContent = owner.status || 'Active';
    document.querySelector('#owner-code').textContent = code;
    document.querySelector('#owner-detail-one').textContent = firstDetail;
    document.querySelector('#owner-detail-two').textContent = secondDetail;
    document.querySelector('#owner-list-name').textContent = owner.name;
    document.querySelector('#owner-document-count').textContent = data.documents.length;
    allDocuments = data.documents;
    renderRows();
  } catch (error) { showToast(error.message); document.querySelector('#owner-heading').textContent = 'Unable to load record'; }
}
['#owner-global-query', '#document-query'].forEach((selector) => document.querySelector(selector).addEventListener('input', () => { currentPage = 1; renderRows(); }));
['#format-filter', '#sort-order'].forEach((selector) => document.querySelector(selector).addEventListener('change', () => { currentPage = 1; renderRows(); }));
document.querySelector('#documents-prev').addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderRows(); } });
document.querySelector('#documents-next').addEventListener('click', () => { if (currentPage * rowsPerPage < visibleDocuments.length) { currentPage += 1; renderRows(); } });
load();
