const toast = document.querySelector('#toast');
const filePicker = document.querySelector('#file-picker');
const uploadFilter = document.querySelector('#upload-filter');
const globalSearch = document.querySelector('#global-search');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatUploadTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderDocuments(documents) {
  const tbody = document.querySelector('#upload-rows');
  tbody.innerHTML = documents.map((doc) => {
    const format = escapeHtml(doc.format.toUpperCase());
    const iconClass = format === 'PDF' ? 'file-pdf' : ['PNG', 'JPG', 'JPEG'].includes(format) ? 'file-image' : 'file-doc';
    const icon = iconClass === 'file-image'
      ? '<path d="M5 4h14v16H5z"/><path d="m7 17 4-4 3 3 2-2 3 3"/><circle cx="9" cy="9" r="1.5"/>'
      : '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>';
    return `<tr><td class="filename" data-label="Document Name"><svg class="${iconClass}" viewBox="0 0 24 24">${icon}</svg><em>${escapeHtml(doc.filename)}</em></td><td data-label="Owner">${escapeHtml(doc.owner_name || doc.employee || '—')}</td><td data-label="Category">${escapeHtml(doc.category)}</td><td data-label="Format"><span class="format">${format}</span></td><td data-label="Uploaded">${escapeHtml(formatUploadTime(doc.uploaded_at))}</td><td data-label="Action"><button class="text-action" data-document-id="${doc.id}">View</button></td></tr>`;
  }).join('');
  document.querySelector('#uploads-empty').hidden = documents.length > 0;
  tbody.querySelectorAll('[data-document-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const doc = await api(`/api/documents/${button.dataset.documentId}`);
        showToast(`${doc.filename} · ${doc.category} · ${doc.employee || 'Unassigned'}`);
      } catch (error) { showToast(error.message); }
    });
  });
}

async function loadDocuments(query = '') {
  try {
    const documents = await api(`/api/documents?q=${encodeURIComponent(query)}`);
    renderDocuments(documents);
  } catch (error) { showToast(`Backend unavailable: ${error.message}`); }
}

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    const numbers = document.querySelectorAll('.stat-card .stat-bottom strong');
    [data.total_employees, data.total_documents, data.uploaded_this_month, data.categories]
      .forEach((number, index) => { numbers[index].textContent = number; });
    document.querySelectorAll('[data-category-count]').forEach((badge) => {
      badge.textContent = data.category_counts?.[badge.dataset.categoryCount] ?? 0;
    });
    const employees = await api('/api/employees');
    const tbody = document.querySelector('#employees tbody');
    tbody.innerHTML = employees.slice(0, 9).map((employee, index) => {
      const initials = employee.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['avatar-blue', 'avatar-rust', 'avatar-pale', 'avatar-lilac'];
      return `<tr><td class="employee-name"><span class="avatar ${colors[index % colors.length]}">${escapeHtml(initials)}</span>${escapeHtml(employee.name)}</td><td>${escapeHtml(employee.employee_code || '')}</td><td>${escapeHtml(employee.designation)}</td><td><span class="doc-pill">${employee.document_count} docs</span></td><td><button class="text-action" data-employee-id="${employee.id}">View</button></td></tr>`;
    }).join('') || '<tr><td class="empty-state" colspan="5">No employees yet.</td></tr>';
    tbody.querySelectorAll('[data-employee-id]').forEach((button) => button.addEventListener('click', () => {
      const employee = employees.find((item) => item.id === Number(button.dataset.employeeId));
      if (employee) window.location.href = `/employees/${employee.id}/documents`;
    }));
  } catch (error) { showToast(`Backend unavailable: ${error.message}`); }
}

let filterTimer;
function onSearch(value) {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => loadDocuments(value.trim()), 180);
}
uploadFilter.addEventListener('input', () => {
  globalSearch.value = '';
  onSearch(uploadFilter.value);
});
globalSearch.addEventListener('input', () => {
  uploadFilter.value = globalSearch.value;
  onSearch(globalSearch.value);
});

document.querySelector('#quick-upload').addEventListener('click', () => { window.location.href = '/documents/upload'; });
filePicker.addEventListener('change', async () => {
  const file = filePicker.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('category', 'Others');
  try {
    const doc = await api('/api/documents', { method: 'POST', body: form });
    showToast(`${doc.filename} uploaded successfully.`);
    await Promise.all([loadDocuments(uploadFilter.value), loadDashboard()]);
  } catch (error) { showToast(error.message); }
  filePicker.value = '';
});

document.querySelector('#quick-add').addEventListener('click', () => { window.location.href = '/employees/new'; });

document.querySelector('#archive').addEventListener('click', () => { window.location.href = '/documents?archived=true'; });

document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.nav-link.active')?.classList.remove('active');
  link.classList.add('active');
}));

loadDashboard();
loadDocuments();
if (new URLSearchParams(window.location.search).has('employee_added')) {
  showToast('Employee added successfully.');
  window.history.replaceState({}, '', '/');
}
if (new URLSearchParams(window.location.search).has('document_uploaded')) {
  showToast('Document uploaded successfully.');
  window.history.replaceState({}, '', '/');
}
