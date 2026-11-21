const page = document.body;
const entityType = page.dataset.entityType;
const endpoint = `/api/${entityType}s`;
const form = document.querySelector('#entity-form');
const message = document.querySelector('#entity-message');
const rows = document.querySelector('#entity-rows');
const dialog = document.querySelector('#entity-dialog');
let records = [];
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function initials(name) { return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function renderRecords() {
  const query = document.querySelector('#entity-search').value.trim().toLowerCase();
  const visible = records.filter((record) => `${record.name} ${record.client_code || ''} ${record.project_code || ''} ${record.company || ''} ${record.client_name || ''} ${record.email || ''}`.toLowerCase().includes(query));
  rows.innerHTML = visible.map((record) => {
    const code = record.client_code || record.project_code || '—';
    const info = entityType === 'client' ? record.email || 'No contact email' : record.client_name || 'No client linked';
    const count = Number(record.document_count || 0);
    return `<tr><td><div class="entity-record"><span class="entity-avatar">${esc(initials(record.name))}</span><span><strong>${esc(record.name)}</strong><small>${entityType === 'client' ? esc(record.company || 'Client record') : 'Project record'}</small></span></div></td><td><span class="record-code">${esc(code)}</span></td><td>${esc(entityType === 'client' ? record.company || '—' : record.client_name || '—')}</td>${entityType === 'client' ? `<td>${esc(record.email || '—')}</td>` : `<td><span class="record-status"><i></i>${esc(record.status || 'Active')}</span></td>`}<td><span class="entity-doc-count"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></svg>${count}</span></td><td class="entity-action-cell"><a class="entity-view-link" href="/${entityType}s/${record.id}/documents">View Documents <span>→</span></a></td></tr>`;
  }).join('');
  const noRows = visible.length === 0;
  document.querySelector('#entity-empty').hidden = !noRows;
  document.querySelector('#entity-table').hidden = noRows;
  document.querySelector('#entity-list-summary').textContent = `${records.length} ${entityType} record${records.length === 1 ? '' : 's'}`;
  document.querySelector('#entity-footer-count').textContent = `Showing ${visible.length} of ${records.length} record${records.length === 1 ? '' : 's'}`;
  const totalDocs = records.reduce((sum, record) => sum + Number(record.document_count || 0), 0);
  document.querySelector('#entity-total').textContent = records.length;
  document.querySelector('#entity-doc-total').textContent = totalDocs;
  document.querySelector('#entity-third-label').textContent = entityType === 'client' ? 'With Documents' : 'Active Projects';
  document.querySelector('#entity-third-total').textContent = entityType === 'client' ? records.filter((record) => Number(record.document_count) > 0).length : records.filter((record) => (record.status || 'Active') === 'Active').length;
}
async function loadRecords() {
  try {
    const response = await fetch(endpoint); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load records.');
    records = data; renderRecords();
  } catch (error) { message.textContent = error.message; }
}
async function loadClients() {
  if (entityType !== 'project') return;
  const response = await fetch('/api/clients'); const clients = await response.json();
  document.querySelector('#client-select').innerHTML = '<option value="">No client linked</option>' + clients.map((client) => `<option value="${client.id}">${esc(client.name)}</option>`).join('');
}
document.querySelector('#entity-search').addEventListener('input', renderRecords);
document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => dialog.showModal()));
document.querySelectorAll('[data-close-form]').forEach((button) => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const payload = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not add this record.');
    form.reset(); dialog.close(); await loadRecords();
  } catch (error) { message.textContent = error.message; }
});
loadClients();
loadRecords();
