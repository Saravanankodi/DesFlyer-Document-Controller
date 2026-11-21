const rowsNode = document.querySelector('#employee-rows');
const queryNode = document.querySelector('#employee-query');
const designationNode = document.querySelector('#designation-filter');
const documentNode = document.querySelector('#document-filter');
const sortNode = document.querySelector('#employee-sort');
const pageSizeNode = document.querySelector('#rows-per-page');
const rangeNode = document.querySelector('#employee-range');
const emptyNode = document.querySelector('#directory-empty');
let employeeList = [];
let page = 1;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatDate(value) {
  if (!value) return 'Not uploaded yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not uploaded yet';
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? `Today, ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date)}`
    : new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function filteredEmployees() {
  const query = queryNode.value.trim().toLowerCase();
  const designation = designationNode.value;
  const documentStatus = documentNode.value;
  const items = employeeList.filter((employee) => {
    const matchesQuery = `${employee.name} ${employee.employee_code || ''}`.toLowerCase().includes(query);
    const matchesDesignation = !designation || employee.designation === designation;
    const count = Number(employee.document_count || 0);
    const matchesStatus = documentStatus === 'all' || (documentStatus === 'with-documents' ? count > 0 : count === 0);
    return matchesQuery && matchesDesignation && matchesStatus;
  });
  if (sortNode.value === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortNode.value === 'documents') items.sort((a, b) => Number(b.document_count) - Number(a.document_count) || a.name.localeCompare(b.name));
  else items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(a.id) - Number(b.id));
  return items;
}

function render() {
  const items = filteredEmployees();
  const pageSize = Number(pageSizeNode.value);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  page = Math.min(page, pages);
  const start = (page - 1) * pageSize;
  const visible = items.slice(start, start + pageSize);
  rowsNode.innerHTML = visible.map((employee) => {
    const count = Number(employee.document_count || 0);
    const action = count
      ? `<a class="employee-view-link" href="/employees/${Number(employee.id)}/documents">View Documents →</a>`
      : `<a class="employee-view-link" href="/documents/upload?employee_id=${Number(employee.id)}">Upload Document →</a>`;
    return `<tr><td><div class="directory-name"><span class="directory-avatar">${escapeHtml(initials(employee.name))}</span><span>${escapeHtml(employee.name)}</span></div></td><td>${escapeHtml(employee.employee_code || '—')}</td><td>${escapeHtml(employee.designation || '—')}</td><td class="document-count-cell">${count ? `${count} documents` : '<span class="no-documents">0 documents</span>'}</td><td>${escapeHtml(formatDate(employee.last_updated))}</td><td>${action}</td></tr>`;
  }).join('');
  emptyNode.hidden = items.length !== 0;
  rangeNode.textContent = `Showing ${items.length ? start + 1 : 0}–${Math.min(start + pageSize, items.length)} of ${items.length} employees`;
  document.querySelector('#employee-prev').disabled = page <= 1;
  document.querySelector('#employee-next').disabled = page >= pages;
  const pageNumbers = document.querySelector('#page-numbers');
  pageNumbers.innerHTML = Array.from({ length: pages }, (_, index) => index + 1).map((number) =>
    `<button type="button" class="${number === page ? 'current' : ''}" data-page="${number}" aria-label="Page ${number}">${number}</button>`,
  ).join('');
  pageNumbers.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
    page = Number(button.dataset.page);
    render();
  }));
}

async function loadEmployees() {
  try {
    const [employeeResponse, dashboardResponse] = await Promise.all([fetch('/api/employees'), fetch('/api/dashboard')]);
    if (!employeeResponse.ok) throw new Error('Unable to load employees. Please refresh the page.');
    employeeList = await employeeResponse.json();
    const dashboard = dashboardResponse.ok ? await dashboardResponse.json() : {};
    const withDocuments = employeeList.filter((employee) => Number(employee.document_count || 0) > 0).length;
    document.querySelector('#total-employees').textContent = employeeList.length.toLocaleString();
    document.querySelector('#employees-with-documents').textContent = withDocuments.toLocaleString();
    document.querySelector('#total-documents').textContent = Number(dashboard.total_documents ?? employeeList.reduce((sum, employee) => sum + Number(employee.document_count || 0), 0)).toLocaleString();
    const designations = [...new Set(employeeList.map((employee) => employee.designation).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    designationNode.insertAdjacentHTML('beforeend', designations.map((designation) => `<option value="${escapeHtml(designation)}">${escapeHtml(designation)}</option>`).join(''));
    render();
  } catch (error) {
    rangeNode.textContent = error.message;
    emptyNode.hidden = false;
  }
}

[queryNode, designationNode, documentNode, sortNode].forEach((control) => control.addEventListener('input', () => { page = 1; render(); }));
pageSizeNode.addEventListener('change', () => { page = 1; render(); });
document.querySelector('#employee-prev').addEventListener('click', () => { page -= 1; render(); });
document.querySelector('#employee-next').addEventListener('click', () => { page += 1; render(); });
loadEmployees();
