const page = document.body;
const entityType = page.dataset.entityType;
const endpoint = `/api/${entityType}s`;
const form = document.querySelector('#entity-form');
const message = document.querySelector('#entity-message');
const rows = document.querySelector('#entity-rows');
const dialog = document.querySelector('#entity-dialog');
const queryNode = document.querySelector('#entity-search');
const filterNode = document.querySelector('#entity-filter');
const sortNode = document.querySelector('#entity-sort');
const pageSizeNode = document.querySelector('#entity-page-size');
let records = [];
let currentPage = 1;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function filteredRecords() {
  const query = queryNode.value.trim().toLowerCase();
  const filter = filterNode.value;
  const visible = records.filter((record) => {
    const code = record.client_code || record.project_code || '';
    const searchable = `${record.name} ${code} ${record.company || ''} ${record.email || ''} ${record.client_name || ''} ${record.status || ''}`.toLowerCase();
    if (!searchable.includes(query)) return false;
    if (entityType === 'client' && filter === 'with-documents') return Number(record.document_count || 0) > 0;
    if (entityType === 'client' && filter === 'without-documents') return Number(record.document_count || 0) === 0;
    if (entityType === 'project' && filter !== 'all') return (record.status || 'Active') === filter;
    return true;
  });

  if (sortNode.value === 'name') visible.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortNode.value === 'documents') visible.sort((a, b) => Number(b.document_count || 0) - Number(a.document_count || 0) || a.name.localeCompare(b.name));
  else visible.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id));
  return visible;
}

function renderRecords() {
  const filtered = filteredRecords();
  const pageSize = Number(pageSizeNode.value);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  rows.innerHTML = visible.map((record) => {
    const code = record.client_code || record.project_code || '—';
    const count = Number(record.document_count || 0);
    const owner = entityType === 'client' ? record.company || '—' : record.client_name || '—';
    const detail = entityType === 'client' ? record.email || '—' : record.status || 'Active';
    const action = `<a class="employee-view-link" href="/${entityType}s/${Number(record.id)}/documents">View Documents →</a>`;
    return `<tr><td><div class="directory-name"><span class="directory-avatar">${esc(initials(record.name))}</span><span>${esc(record.name)}</span></div></td><td>${esc(code)}</td><td>${esc(owner)}</td><td>${esc(detail)}</td><td class="document-count-cell">${count ? `${count} documents` : '<span class="no-documents">0 documents</span>'}</td><td>${action}</td></tr>`;
  }).join('');

  document.querySelector('#entity-empty').hidden = filtered.length !== 0;
  document.querySelector('#entity-footer-count').textContent = `Showing ${filtered.length ? start + 1 : 0}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} ${entityType} records`;
  document.querySelector('#entity-prev').disabled = currentPage <= 1;
  document.querySelector('#entity-next').disabled = currentPage >= pages;
  const pageNumbers = document.querySelector('#entity-page-numbers');
  pageNumbers.innerHTML = Array.from({ length: pages }, (_, index) => index + 1).map((number) =>
    `<button type="button" class="${number === currentPage ? 'current' : ''}" data-page="${number}" aria-label="Page ${number}">${number}</button>`,
  ).join('');
  pageNumbers.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
    currentPage = Number(button.dataset.page);
    renderRecords();
  }));

  const totalDocs = records.reduce((sum, record) => sum + Number(record.document_count || 0), 0);
  const withDocuments = records.filter((record) => Number(record.document_count || 0) > 0).length;
  document.querySelector('#entity-total').textContent = records.length.toLocaleString();
  document.querySelector('#entity-doc-total').textContent = totalDocs.toLocaleString();
  document.querySelector('#entity-third-label').textContent = entityType === 'client' ? 'Clients with Documents' : 'Active Projects';
  document.querySelector('#entity-third-total').textContent = (entityType === 'client'
    ? withDocuments
    : records.filter((record) => (record.status || 'Active') === 'Active').length).toLocaleString();
}

async function loadRecords() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Could not load ${entityType} records.`);
    records = data;
    renderRecords();
  } catch (error) {
    message.textContent = error.message;
    document.querySelector('#entity-empty').textContent = error.message;
    document.querySelector('#entity-empty').hidden = false;
  }
}

async function loadClients() {
  if (entityType !== 'project') return;
  const response = await fetch('/api/clients');
  const clients = await response.json();
  document.querySelector('#client-select').innerHTML = '<option value="">No client linked</option>'
    + clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join('');
}

queryNode.addEventListener('input', () => { currentPage = 1; renderRecords(); });
filterNode.addEventListener('change', () => { currentPage = 1; renderRecords(); });
sortNode.addEventListener('change', () => { currentPage = 1; renderRecords(); });
pageSizeNode.addEventListener('change', () => { currentPage = 1; renderRecords(); });
document.querySelector('#entity-prev').addEventListener('click', () => { currentPage -= 1; renderRecords(); });
document.querySelector('#entity-next').addEventListener('click', () => { currentPage += 1; renderRecords(); });
document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => dialog.showModal()));
document.querySelectorAll('[data-close-form]').forEach((button) => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  const payload = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Could not add this ${entityType}.`);
    form.reset();
    dialog.close();
    await loadRecords();
  } catch (error) { message.textContent = error.message; }
});

loadClients();
loadRecords();
