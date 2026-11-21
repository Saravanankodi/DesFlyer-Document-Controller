const form = document.querySelector('#project-form');
const message = document.querySelector('#project-message');
const clientSelect = document.querySelector('#project-client');

function updatePreview() {
  const name = document.querySelector('#project-name').value.trim() || 'New Project';
  const client = clientSelect.selectedOptions[0]?.textContent || 'No client linked';
  const code = document.querySelector('#project-code').value || 'DFP-0001';
  const status = document.querySelector('#project-status').value;
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
  document.querySelector('#project-avatar').textContent = initials;
  document.querySelector('#preview-avatar').textContent = initials;
  document.querySelector('#project-intro-name').textContent = name;
  document.querySelector('#preview-name').textContent = name;
  document.querySelector('#preview-client').textContent = client;
  document.querySelector('#preview-code').textContent = code;
  document.querySelector('#preview-status').textContent = status;
}

async function loadProjectCode() {
  try {
    const response = await fetch('/api/projects/next-id');
    const result = await response.json();
    if (response.ok) { document.querySelector('#project-code').value = result.project_code; updatePreview(); }
  } catch { /* Keep the starter preview until the server responds. */ }
}

async function loadClients() {
  try {
    const response = await fetch('/api/clients');
    const clients = await response.json();
    if (!response.ok) throw new Error(clients.error || 'Could not load clients.');
    clientSelect.innerHTML = '<option value="">No client linked</option>' + clients.map((client) => `<option value="${client.id}">${String(client.name).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])}</option>`).join('');
    updatePreview();
  } catch (error) { message.textContent = error.message; }
}

document.querySelector('#project-name').addEventListener('input', updatePreview);
clientSelect.addEventListener('change', updatePreview);
document.querySelector('#project-status').addEventListener('change', updatePreview);
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const submit = form.querySelector('.submit-button'); submit.disabled = true; submit.textContent = 'Adding…';
  try {
    const response = await fetch('/api/projects', { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not add project.');
    location.href = '/projects';
  } catch (error) { message.textContent = error.message; submit.disabled = false; submit.textContent = 'Add Project'; }
});

loadProjectCode();
loadClients();
