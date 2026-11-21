const form = document.querySelector('#employee-form');
const photoInput = document.querySelector('#photo-input');
const photoPreview = document.querySelector('#photo-preview');
const previewAvatar = document.querySelector('#preview-avatar');
const message = document.querySelector('#form-message');
let photoUrl = null;

async function loadNextEmployeeCode() {
  try {
    const response = await fetch('/api/employees/next-id');
    const result = await response.json();
    if (response.ok) {
      document.querySelector('#employee-code').value = result.employee_code;
      document.querySelector('#preview-id').textContent = result.employee_code;
    }
  } catch { /* Keep the visual reference value until the backend responds. */ }
}

function updatePreview() {
  const name = document.querySelector('#employee-name').value.trim();
  const email = document.querySelector('#employee-email').value.trim();
  const designation = document.querySelector('#employee-designation').value;
  const employeeCode = document.querySelector('#employee-code').value;
  document.querySelector('#preview-name').textContent = name || 'New Employee';
  document.querySelector('#preview-person').textContent = name || 'Jane Doe';
  document.querySelector('#preview-email').textContent = email || 'email@example.com';
  document.querySelector('#preview-designation').textContent = designation || 'Designation';
  document.querySelector('#preview-id').textContent = employeeCode;
  if (!photoUrl) {
    const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    previewAvatar.textContent = initials || 'A';
  }
}

document.querySelectorAll('#employee-name,#employee-email,#employee-designation').forEach((field) => field.addEventListener('input', updatePreview));
document.querySelector('#employee-department').addEventListener('change', updatePreview);
document.querySelector('#choose-photo').addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  message.textContent = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    message.textContent = 'Photo must be 2MB or smaller.';
    photoInput.value = '';
    return;
  }
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(file);
  const image = document.createElement('img');
  image.src = photoUrl;
  image.alt = 'Employee photo preview';
  photoPreview.replaceChildren(image);
  const avatarImage = image.cloneNode();
  previewAvatar.replaceChildren(avatarImage);
});
document.querySelector('#remove-photo').addEventListener('click', () => {
  photoInput.value = '';
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  photoPreview.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/><path d="M18 4v4m-2-2h4"/></svg>';
  previewAvatar.textContent = 'A';
  updatePreview();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  const submit = form.querySelector('.submit-button');
  submit.disabled = true;
  submit.textContent = 'Adding…';
  try {
    const response = await fetch('/api/employees', { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not add employee.');
    window.location.href = '/?employee_added=1';
  } catch (error) {
    message.textContent = error.message;
    submit.disabled = false;
    submit.textContent = 'Add Employee';
  }
});

loadNextEmployeeCode();
