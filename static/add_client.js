const form = document.querySelector('#client-form');
const message = document.querySelector('#client-message');
function updatePreview() {
  const name = document.querySelector('#client-name').value.trim();
  const company = document.querySelector('#client-company').value.trim();
  const email = document.querySelector('#client-email').value.trim();
  const code = document.querySelector('#client-code').value;
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'C';
  document.querySelector('#client-avatar').textContent = initials;
  document.querySelector('#preview-avatar').textContent = initials;
  document.querySelector('#client-intro-name').textContent = name || 'New Client';
  document.querySelector('#preview-name').textContent = name || 'New Client';
  document.querySelector('#preview-company').textContent = company || 'Company';
  document.querySelector('#preview-code').textContent = code || 'DFC-0001';
  document.querySelector('#preview-email').textContent = email || 'contact@company.com';
}
async function loadClientCode() {
  try {
    const response = await fetch('/api/clients/next-id');
    const result = await response.json();
    if (response.ok) { document.querySelector('#client-code').value = result.client_code; updatePreview(); }
  } catch { /* Keep the starter preview until the server responds. */ }
}
document.querySelectorAll('#client-name,#client-company,#client-email').forEach((field) => field.addEventListener('input', updatePreview));
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  const submit = form.querySelector('.submit-button'); submit.disabled = true; submit.textContent = 'Adding…';
  try {
    const response = await fetch('/api/clients', { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not add client.');
    location.href = '/clients';
  } catch (error) { message.textContent = error.message; submit.disabled = false; submit.textContent = 'Add Client'; }
});
loadClientCode();
