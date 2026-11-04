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


// ================= Sign in with Google =================
// Google proves WHO you are. Your chats are protected by a key only you can open, so after Google you
// type your encryption passphrase (for a password account: your account password).
function loadScript(src) { return new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = no; document.head.appendChild(el); }); }

function askSecret({ mode, hasPassword, backup, token, username, email }) {
  return new Promise((resolve) => {
    const $ = (id) => document.getElementById(id);
    const modal = $('secretModal'), err = $('smErr'), pass = $('smPass'), pass2 = $('smPass2');
    const create = mode === 'create';
    $('smTitle').textContent = create ? 'Create your encryption passphrase' : 'Unlock your chat encryption';
    $('smText').textContent = create
      ? 'Google confirms who you are. This passphrase protects the key that encrypts your chats, so even the server cannot read your messages. You will type it every time you sign in. If you forget it, old messages cannot be recovered.'
      : 'Google has already signed you in. This is not another login step: enter the passphrase that protects your end-to-end encrypted chat key. For an account originally registered with email and password, this is the same password you used when setting up chat encryption.';
    $('smCreate').hidden = !create; pass.value = ''; pass2.value = ''; err.textContent = '';
    pass.placeholder = create ? 'Choose a passphrase' : 'Chat encryption passphrase';
    pass.autocomplete = create ? 'new-password' : 'current-password';
    let render = null;
    if (create) render = PasswordRules.attach(pass, $('smRules'), () => ({ username, email }), pass2);
    modal.hidden = false; setTimeout(() => pass.focus(), 50);

    const done = (v) => { modal.hidden = true; $('smOk').onclick = $('smCancel').onclick = null; pass.onkeydown = pass2.onkeydown = null; resolve(v); };
    const busy = (b, t) => { $('smOk').disabled = b; $('smOk').textContent = t || 'Continue'; };
    const submit = async () => {
      err.textContent = '';
      if (!pass.value) { err.textContent = 'Please type it first.'; return; }
      busy(true, 'Working…'); await new Promise((r) => setTimeout(r, 30));
      try {
        if (!create) {
          const sk = E2EE.unlock(backup, pass.value);
          if (!sk) { err.textContent = 'That is not right. Try again.'; busy(false); return; }
          return done(sk);
        }
        const problem = PasswordRules.firstProblem(pass.value, { username, email });
        if (problem) { err.textContent = problem + '.'; busy(false); return; }
        if (pass.value !== pass2.value) { err.textContent = 'The two passphrases do not match.'; busy(false); return; }
        const keys = E2EE.genKeys();
        const res = await fetch(`${API_URL}/keys`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ publicKey: keys.pk, keyBackup: E2EE.backup(keys.sk, pass.value) }) });
        if (!res.ok) { err.textContent = ((await res.json().catch(() => ({}))).message) || 'Could not save your keys.'; busy(false); return; }
        return done({ pk: keys.pk, sk: keys.sk });
      } catch (e) { err.textContent = 'Something went wrong. Please try again.'; busy(false); }
    };
    $('smOk').onclick = submit; $('smCancel').onclick = () => done(null);
    pass.onkeydown = pass2.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  });
}

async function onGoogleCredential(resp) {
  try {
    showAlert('Signing in with Google…', 'info');
    const r = await fetch(`${API_URL}/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: resp.credential }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return showAlert(data.message || 'Google sign-in failed.');
    if (data.publicKey && data.keyBackup) {
      const sk = await askSecret({ mode: 'unlock', hasPassword: data.hasPassword, backup: data.keyBackup });
      if (!sk) return showAlert('Sign-in cancelled.');
      storeKeys(data.publicKey, sk);
    } else {
      const made = await askSecret({ mode: 'create', token: data.token, username: data.username, email: data.email });
      if (!made) return showAlert('Sign-in cancelled. You need an encryption passphrase to use the chats.');
      storeKeys(made.pk, made.sk);
    }
    saveSession(data);
    showAlert(data.isNew ? 'Account created! Redirecting...' : 'Login successful! Redirecting...', 'success');
    setTimeout(() => { window.location.href = '/pages/dashboard.html'; }, 800);
  } catch (e) { showAlert('Google sign-in failed. Please try again.'); }
}

(async function initGoogle() {
  try {
    const cfg = await (await fetch(`${API_URL}/config`)).json();
    if (!cfg.googleClientId) return;                                     // not configured: no Google button
    await loadScript('https://accounts.google.com/gsi/client');
    google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onGoogleCredential, ux_mode: 'popup' });
    [['googleBlock', 'googleBtn'], ['googleBlockReg', 'googleBtnReg']].forEach(([block, box]) => {
      document.getElementById(block).classList.remove('hidden');
      const w = Math.min(360, Math.max(200, document.getElementById(box).parentElement.clientWidth || 320));
      google.accounts.id.renderButton(document.getElementById(box), { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width: w });
    });
  } catch (e) { /* offline or Google blocked: the normal login still works */ }
})();
