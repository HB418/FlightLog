/* js/namePrompt.js
   Sign-up (Welcome modal), Sign-In modal (shown on return visits unless
   "keep me signed in" was checked), and the Account modal. Everything
   here is stored locally in localStorage — there is no backend/server,
   so "password" is a local gate only, not real authentication. It's
   hashed (SHA-256) before storage rather than kept in plain text, but
   that does not make this a secure login system; anyone with access to
   the device's localStorage can read/clear it. */

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC'
];

function populateStateSelect(select) {
  if (!select || select.options.length > 0) return;
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Select a state';
  select.appendChild(blank);
  US_STATES.forEach(abbr => {
    const opt = document.createElement('option');
    opt.value = abbr;
    opt.textContent = abbr;
    select.appendChild(opt);
  });
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

document.addEventListener('DOMContentLoaded', function () {
  populateStateSelect(document.getElementById('signup-state-select'));
  populateStateSelect(document.getElementById('account-state-select'));

  // Gate logic: no account yet -> Sign Up. Account exists but "keep me
  // signed in" wasn't set -> Sign In every time the page loads. Account
  // exists and autologin is on -> straight in, no prompt.
  // Check for userPasswordHash specifically, not just userName — an
  // earlier/older version of this app only ever asked for a name (no
  // password), so a leftover userName from that could otherwise make
  // this think a real account already exists and show Sign In instead
  // of Sign Up.
  const hasAccount = !!localStorage.getItem('userPasswordHash');
  const autoLogin = localStorage.getItem('userAutoLogin') === 'true';
  const welcomeModal = document.getElementById('welcome-modal');
  const signinModal = document.getElementById('signin-modal');

  if (!hasAccount) {
    welcomeModal.classList.add('active');
  } else if (!autoLogin) {
    signinModal.classList.add('active');
  }

  document.getElementById('save-signup-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('signup-status');
    const name = document.getElementById('signup-name-input').value.trim();
    const state = document.getElementById('signup-state-select').value;
    const email = document.getElementById('signup-email-input').value.trim();
    const password = document.getElementById('signup-password-input').value;
    const passwordConfirm = document.getElementById('signup-password-confirm-input').value;
    const remember = document.getElementById('signup-remember-checkbox').checked;

    if (!name || !state || !email) {
      statusEl.textContent = 'Please fill in your name, state, and email.';
      return;
    }
    if (!looksLikeEmail(email)) {
      statusEl.textContent = 'That email address doesn\'t look right.';
      return;
    }
    if (password.length < 6) {
      statusEl.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (password !== passwordConfirm) {
      statusEl.textContent = 'Passwords don\'t match.';
      return;
    }

    const passwordHash = await hashPassword(password);
    localStorage.setItem('userName', name);
    localStorage.setItem('userState', state);
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userPasswordHash', passwordHash);
    localStorage.setItem('userAutoLogin', remember ? 'true' : 'false');

    statusEl.textContent = '';
    welcomeModal.classList.remove('active');
  });

  document.getElementById('save-signin-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('signin-status');
    const email = document.getElementById('signin-email-input').value.trim();
    const password = document.getElementById('signin-password-input').value;
    const remember = document.getElementById('signin-remember-checkbox').checked;

    if (!email || !password) {
      statusEl.textContent = 'Enter your email and password.';
      return;
    }
    const storedEmail = localStorage.getItem('userEmail') || '';
    const storedHash = localStorage.getItem('userPasswordHash') || '';
    const enteredHash = await hashPassword(password);

    if (email.toLowerCase() !== storedEmail.toLowerCase() || enteredHash !== storedHash) {
      statusEl.textContent = 'Email or password is incorrect.';
      return;
    }

    localStorage.setItem('userAutoLogin', remember ? 'true' : 'false');
    document.getElementById('signin-email-input').value = '';
    document.getElementById('signin-password-input').value = '';
    statusEl.textContent = '';
    signinModal.classList.remove('active');
  });

  function openAccountModal() {
    document.getElementById('account-view-name').textContent = localStorage.getItem('userName') || '';
    document.getElementById('account-view-state').textContent = localStorage.getItem('userState') || '';
    document.getElementById('account-view-email').textContent = localStorage.getItem('userEmail') || '';
    document.getElementById('account-name-input').value = localStorage.getItem('userName') || '';
    document.getElementById('account-state-select').value = localStorage.getItem('userState') || '';
    document.getElementById('account-email-input').value = localStorage.getItem('userEmail') || '';
    document.getElementById('account-current-password-input').value = '';
    document.getElementById('account-new-password-input').value = '';
    document.getElementById('account-new-password-confirm-input').value = '';
    document.getElementById('account-profile-status').textContent = '';
    document.getElementById('account-password-status').textContent = '';
    showAccountSection('view');
    document.getElementById('account-modal').classList.add('active');
  }
  window.openAccountModal = openAccountModal;

  // Shows exactly one of the three account sections at a time.
  function showAccountSection(which) {
    document.getElementById('account-view-section').classList.toggle('hide', which !== 'view');
    document.getElementById('account-edit-profile-section').classList.toggle('hide', which !== 'profile');
    document.getElementById('account-edit-password-section').classList.toggle('hide', which !== 'password');
  }

  document.getElementById('account-edit-profile-btn')?.addEventListener('click', () => showAccountSection('profile'));
  document.getElementById('cancel-account-profile-btn')?.addEventListener('click', () => showAccountSection('view'));
  document.getElementById('account-open-password-btn')?.addEventListener('click', () => showAccountSection('password'));
  document.getElementById('cancel-account-password-btn')?.addEventListener('click', () => showAccountSection('view'));

  document.getElementById('account-close-btn')?.addEventListener('click', () => {
    document.getElementById('account-modal').classList.remove('active');
  });

  document.getElementById('save-account-profile-btn')?.addEventListener('click', () => {
    const statusEl = document.getElementById('account-profile-status');
    const name = document.getElementById('account-name-input').value.trim();
    const state = document.getElementById('account-state-select').value;
    const email = document.getElementById('account-email-input').value.trim();

    if (!name || !state || !email) {
      statusEl.textContent = 'Please fill in your name, state, and email.';
      return;
    }
    if (!looksLikeEmail(email)) {
      statusEl.textContent = 'That email address doesn\'t look right.';
      return;
    }

    localStorage.setItem('userName', name);
    localStorage.setItem('userState', state);
    localStorage.setItem('userEmail', email);
    document.getElementById('account-view-name').textContent = name;
    document.getElementById('account-view-state').textContent = state;
    document.getElementById('account-view-email').textContent = email;
    statusEl.textContent = '';
    showAccountSection('view');
  });

  document.getElementById('save-account-password-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('account-password-status');
    const currentPassword = document.getElementById('account-current-password-input').value;
    const newPassword = document.getElementById('account-new-password-input').value;
    const newPasswordConfirm = document.getElementById('account-new-password-confirm-input').value;
    const storedHash = localStorage.getItem('userPasswordHash') || '';

    if (!currentPassword) {
      statusEl.textContent = 'Enter your current password.';
      return;
    }
    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== storedHash) {
      statusEl.textContent = 'Current password is incorrect.';
      return;
    }
    if (newPassword.length < 6) {
      statusEl.textContent = 'New password must be at least 6 characters.';
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      statusEl.textContent = 'New passwords don\'t match.';
      return;
    }

    localStorage.setItem('userPasswordHash', await hashPassword(newPassword));
    document.getElementById('account-current-password-input').value = '';
    document.getElementById('account-new-password-input').value = '';
    document.getElementById('account-new-password-confirm-input').value = '';
    statusEl.textContent = 'Password updated.';
    setTimeout(() => showAccountSection('view'), 900);
  });

  document.getElementById('delete-account-btn')?.addEventListener('click', () => {
    showConfirmModal(
      'This will permanently delete your profile (name, state, email, password) from this device. Your saved courses and rounds are not affected. Continue?',
      () => {
        localStorage.removeItem('userName');
        localStorage.removeItem('userState');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userPasswordHash');
        localStorage.removeItem('userAutoLogin');
        document.getElementById('account-modal').classList.remove('active');
        document.getElementById('welcome-modal').classList.add('active');
      }
    );
  });
});
