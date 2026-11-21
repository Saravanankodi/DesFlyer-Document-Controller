const toastNode = document.querySelector('#profile-toast');
let adminProfile = null;
let toastTimer;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('visible'), 2800);
}

function applyProfile(profile) {
  adminProfile = profile;
  document.querySelector('#banner-name').textContent = profile.name;
  document.querySelector('#profile-name').textContent = profile.name;
  document.querySelector('#banner-email').textContent = profile.email;
  document.querySelector('#profile-email').textContent = profile.email;
  document.querySelector('#profile-password').textContent = profile.password_set ? '••••••••••••' : 'Not set';
  const badge = document.querySelector('#two-factor-status');
  badge.textContent = profile.two_factor_enabled ? 'Enabled' : 'Disabled';
  badge.classList.toggle('disabled', !profile.two_factor_enabled);
}

async function loadProfile() {
  try { applyProfile(await requestJson('/api/admin/profile')); }
  catch (error) { showToast(error.message); }
}

function categoryIcon(category) {
  const value = category.name.toLowerCase();
  if (value.includes('certificate')) return '<svg viewBox="0 0 24 24"><path d="m12 3 2.2 2 3-.2.7 2.9 2.5 1.7-1.1 2.8 1.1 2.8-2.5 1.7-.7 2.9-3-.2-2.2 2-2.2-2-3 .2-.7-2.9-2.5-1.7 1.1-2.8-1.1-2.8 2.5-1.7.7-2.9 3 .2z"/><path d="m9 12 2 2 4-4"/></svg>';
  if (value.includes('offer')) return '<svg viewBox="0 0 24 24"><path d="M8 12.5 12.5 8a3.2 3.2 0 0 1 4.5 4.5l-6 6a4.2 4.2 0 0 1-6-6l6-6M9 15l6-6"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z"/><path d="M12 8v5m0 3h.01"/></svg>';
}

async function loadCategories() {
  try {
    const categories = await requestJson('/api/admin/categories');
    const order = ['offer letters', 'policies', 'others', 'certificates'];
    categories.sort((a, b) => {
      const ai = order.indexOf(a.name.toLowerCase());
      const bi = order.indexOf(b.name.toLowerCase());
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.id - b.id;
    });
    document.querySelector('#category-chips').innerHTML = categories.map((category) => `<div class="category-chip"><span class="category-chip-icon">${categoryIcon(category)}</span><span>${escapeHtml(category.name)}</span><button class="category-remove" type="button" data-category-id="${category.id}" aria-label="Remove ${escapeHtml(category.name)}">×</button></div>`).join('');
    document.querySelectorAll('[data-category-id]').forEach((button) => button.addEventListener('click', async () => {
      try {
        await requestJson(`/api/admin/categories/${button.dataset.categoryId}`, { method: 'DELETE' });
        await loadCategories();
        showToast('Category removed.');
      } catch (error) { showToast(error.message); }
    }));
  } catch (error) { showToast(error.message); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

document.querySelector('#edit-profile').addEventListener('click', () => {
  if (!adminProfile) return;
  document.querySelector('#edit-name').value = adminProfile.name;
  document.querySelector('#edit-email').value = adminProfile.email;
  document.querySelector('#profile-message').textContent = '';
  document.querySelector('#profile-dialog').showModal();
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const profile = await requestJson('/api/admin/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), email: form.get('email') }),
    });
    applyProfile({ ...adminProfile, ...profile });
    document.querySelector('#profile-dialog').close();
    showToast('Profile updated.');
  } catch (error) { document.querySelector('#profile-message').textContent = error.message; }
});

document.querySelector('#category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#category-name');
  try {
    await requestJson('/api/admin/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value.trim() }),
    });
    input.value = '';
    await loadCategories();
    showToast('Category added.');
  } catch (error) { showToast(error.message); }
});

document.querySelector('#toggle-2fa').addEventListener('click', async () => {
  if (!adminProfile) return;
  try {
    const result = await requestJson('/api/admin/security/two-factor', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !adminProfile.two_factor_enabled }),
    });
    applyProfile({ ...adminProfile, two_factor_enabled: result.enabled });
    showToast(`Two-factor setting ${result.enabled ? 'enabled' : 'disabled'}.`);
  } catch (error) { showToast(error.message); }
});

document.querySelector('#change-password').addEventListener('click', () => {
  const form = document.querySelector('#password-form');
  form.reset();
  document.querySelector('#password-message').textContent = '';
  document.querySelector('#current-password-wrap').hidden = !adminProfile?.password_set;
  document.querySelector('#password-dialog').showModal();
});

document.querySelector('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = String(data.get('new_password'));
  if (password !== String(data.get('confirm_password'))) {
    document.querySelector('#password-message').textContent = 'The new passwords do not match.';
    return;
  }
  try {
    await requestJson('/api/admin/security/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: data.get('current_password'), new_password: password }),
    });
    applyProfile({ ...adminProfile, password_set: true });
    document.querySelector('#password-dialog').close();
    showToast('Password updated.');
  } catch (error) { document.querySelector('#password-message').textContent = error.message; }
});

document.querySelector('#login-activity').addEventListener('click', async () => {
  try {
    const activity = await requestJson('/api/admin/login-activity');
    document.querySelector('#activity-dialog p').textContent = activity.note;
    document.querySelector('#activity-dialog').showModal();
  } catch (error) { showToast(error.message); }
});

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(`#${button.dataset.close}`).close();
}));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));
document.querySelectorAll('#sidebar-logout,#logout-button').forEach((button) => button.addEventListener('click', () => {
  showToast('Sign-in is not configured in this app yet.');
}));

loadProfile();
loadCategories();
