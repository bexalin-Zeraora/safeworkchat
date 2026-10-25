const API_URL = '/api/auth';

// UI Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const alertBox = document.getElementById('alertBox');

// Toggle password visibility
function togglePassword() {
  const passwordInput = document.getElementById('loginPassword');
  const toggleIcon = document.getElementById('toggleIcon');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleIcon.classList.remove('fa-eye');
    toggleIcon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    toggleIcon.classList.remove('fa-eye-slash');
    toggleIcon.classList.add('fa-eye');
  }
}

// Toggle between Login and Register views
document.getElementById('showRegister').addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  hideAlert();
});

document.getElementById('showLogin').addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  hideAlert();
});

function showAlert(message, type = 'danger') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.classList.remove('hidden');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideAlert();
  }, 5000);
}

function hideAlert() {
  alertBox.classList.add('hidden');
}

// ---- end-to-end encryption key handling ----
function storeKeys(pk, sk) { const r = remember(); sess.set('e2ee_pk', pk, r); sess.set('e2ee_sk', sk, r); }
function remember() { const c = document.getElementById('rememberMe'); return !!(c && c.checked); }

// never keep the encrypted key backup in the session object
function saveSession(data) {
  const { keyBackup, ...user } = data;
  sess.set('token', data.token, remember());
  sess.set('user', JSON.stringify(user), remember());
}

async function setupKeysAfterLogin(data, password) {
  // already unlocked on this device for this account
  if (data.publicKey && sess.get('e2ee_pk') === data.publicKey && sess.get('e2ee_sk')) return true;

  if (data.publicKey && data.keyBackup) {
    const sk = E2EE.unlock(data.keyBackup, password);
    if (!sk) return false;
    storeKeys(data.publicKey, sk);
    return true;
  }

  // account created before encryption existed: create keys once and upload the public key + encrypted backup
  const keys = E2EE.genKeys();
  const res = await fetch(`${API_URL}/keys`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token },
    body: JSON.stringify({ publicKey: keys.pk, keyBackup: E2EE.backup(keys.sk, password) })
  });
  if (!res.ok) return false;
  storeKeys(keys.pk, keys.sk);
  return true;
}

// Handle Registration
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  // check everything BEFORE creating keys, with a clear message (the server checks again)
  if (username.length < 2 || username.length > 30) return showAlert('Username must be 2 to 30 characters.');
  if (/[<>"'&]/.test(username)) return showAlert('Username cannot contain < > " \' or &.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showAlert('Please enter a valid email address.');
  const problem = PasswordRules.firstProblem(password, { username, email });
  if (problem) return showAlert(problem + '.');
  if (password !== document.getElementById('regPassword2').value) return showAlert('The two passwords do not match.');

  try {
    // Generate this user's encryption keys in the browser; the private key never leaves unencrypted
    showAlert('Creating your encryption keys…', 'info');
    await new Promise((r) => setTimeout(r, 30));
    const keys = E2EE.genKeys();
    const keyBackup = E2EE.backup(keys.sk, password);

    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, publicKey: keys.pk, keyBackup })
    });

    const data = await response.json();

    if (response.ok) {
      storeKeys(keys.pk, keys.sk);
      saveSession(data);
      showAlert('Registration successful! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/pages/dashboard.html';
      }, 1500);
    } else {
      showAlert(data.message || 'Registration failed');
    }
  } catch (error) {
    showAlert('Network error. Is the backend running?');
    console.error(error);
  }
});

// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      showAlert('Unlocking your encryption keys…', 'info');
      await new Promise((r) => setTimeout(r, 30));
      const ok = await setupKeysAfterLogin(data, password);
      if (!ok) return showAlert('Could not unlock your encryption key with this password.');
      saveSession(data);
      showAlert('Login successful! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/pages/dashboard.html';
      }, 1500);
    } else {
      showAlert(data.message || 'Login failed');
    }
  } catch (error) {
    showAlert('Network error. Is the backend running?');
    console.error(error);
  }
});

// Already logged in? Check the token with the server first (a stale token must not bounce us around)
async function checkAuth() {
  const token = sess.get('token');
  if (!token) return;
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) window.location.replace('/pages/dashboard.html');
    else if (r.status === 401) sess.clear();   // expired / unknown user: stay on the login page
  } catch (e) { /* server unreachable: stay on the login page */ }
}

// Run on page load
checkAuth();


// live password checklist + strength bar + "passwords match" under the register form
PasswordRules.attach(document.getElementById('regPassword'), document.getElementById('pwRules'),
  () => ({ username: document.getElementById('regUsername').value, email: document.getElementById('regEmail').value }), document.getElementById('regPassword2'));
['regUsername', 'regEmail'].forEach((id) => document.getElementById(id).addEventListener('input', () => document.getElementById('regPassword').dispatchEvent(new Event('input'))));
