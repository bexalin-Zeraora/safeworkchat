const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const $ = (id) => document.getElementById(id);
const say = (id, text, ok) => { $(id).className = 'small mt-2 ' + (ok ? 'text-success' : 'text-danger'); $(id).textContent = text; };
const rememberMe = () => sess.remembered();

async function api(path, method = 'GET', body, headers = {}) {
  const raw = body instanceof Blob;
  const r = await fetch('/api' + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  if (r.status === 401) return logout();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Request failed');
  return d;
}

let me = null;
function show(u) {
  me = u;
  renderGoogle();
  $('un').value = u.username; $('bio').value = u.bio || ''; $('em').value = u.email;
  $('pic').src = avUrl(u.username) + '?t=' + Date.now();
  const chip = document.querySelector('.uchip');   // top bar: show the new name and picture straight away
  if (chip) { chip.innerHTML = avImg(u.username, 32) + '<span></span>'; chip.lastChild.textContent = u.username; }
  // keep the saved login in step with the new name (shown in the top bar of every page)
  const cur = JSON.parse(sess.get('user') || '{}');
  sess.set('user', JSON.stringify({ ...cur, username: u.username }), rememberMe());
}

$('choose').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0]; $('file').value = '';
  if (!f) return;
  try {
    // crop to a centred square and shrink to 256x256 in the browser
    const bmp = await createImageBitmap(f);
    const s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 256, 256);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
    show(await api('/users/me/avatar', 'POST', blob, { 'Content-Type': 'image/jpeg' }));
    say('picMsg', 'Profile picture updated.', true);
  } catch (e) { say('picMsg', e.message || 'Could not use that image', false); }
};
$('removePic').onclick = async () => { try { show(await api('/users/me/avatar', 'DELETE')); say('picMsg', 'Back to the default picture.', true); } catch (e) { say('picMsg', e.message, false); } };

$('saveDet').onclick = async () => {
  try { show(await api('/users/me', 'PUT', { username: $('un').value, bio: $('bio').value })); say('detMsg', 'Saved.', true); }
  catch (e) { say('detMsg', e.message, false); }
};

$('savePw').onclick = async () => {
  if ($('np').value !== $('np2').value) return say('pwMsg', 'The new passwords do not match.', false);
  const problem = PasswordRules.firstProblem($('np').value, { username: me && me.username, email: me && me.email });
  if (problem) return say('pwMsg', problem + '.', false);
  if ($('np').value === $('cp').value) return say('pwMsg', 'The new password must be different from the current one.', false);
  const sk = sess.get('e2ee_sk');
  if (!sk) return say('pwMsg', 'Your encryption key is not loaded in this tab. Log out, log in again, then retry.', false);
  try {
    $('savePw').disabled = true; say('pwMsg', 'Working…', true);
    await new Promise((r) => setTimeout(r, 30));
    await api('/auth/password', 'PUT', { currentPassword: $('cp').value, newPassword: $('np').value, keyBackup: E2EE.backup(sk, $('np').value) });
    $('cp').value = $('np').value = $('np2').value = '';
    say('pwMsg', 'Password changed. Use the new password next time you log in.', true);
  } catch (e) { say('pwMsg', e.message, false); }
  $('savePw').disabled = false;
};

api('/users/me').then(show).catch((e) => say('detMsg', e.message, false));

PasswordRules.attach($('np'), $('npRules'), () => ({ username: me && me.username, email: me && me.email }), $('np2'));


// ---------- Google sign-in: connect / disconnect ----------
let gCfg = null, gInit = false;
const loadScript = (src) => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
async function renderGoogle() {
  if (!me) return;
  // a Google-only account has no password to change
  $('pwCard').hidden = !me.hasPassword;
  try { gCfg = gCfg || await (await fetch('/api/auth/config')).json(); } catch (e) { return; }
  if (!gCfg.googleClientId) { $('gCard').hidden = true; if (!me.hasPassword) { $('pwCard').hidden = false; } return; }
  $('gCard').hidden = false;
  $('gBtn').textContent = '';
  $('gOff').hidden = !me.googleLinked;
  if (me.googleLinked) {
    $('gState').innerHTML = '<i class="fas fa-check-circle text-success me-1"></i>Google is connected. You can sign in with the Google button' + (me.hasPassword ? ' or with your password.' : '. This account has no password; your encryption passphrase protects your chats.');
    $('gOff').disabled = !me.hasPassword; $('gOff').title = me.hasPassword ? '' : 'Google is your only way to sign in';
    return;
  }
  $('gState').textContent = 'Connect your Google account to sign in with one click. Your password keeps working.';
  try {
    if (!window.google || !google.accounts) await loadScript('https://accounts.google.com/gsi/client');
    if (!gInit) { google.accounts.id.initialize({ client_id: gCfg.googleClientId, callback: onLinkCredential, ux_mode: 'popup' }); gInit = true; }
    google.accounts.id.renderButton($('gBtn'), { theme: 'outline', size: 'large', text: 'continue_with', width: 280 });
  } catch (e) { $('gState').textContent = 'Google could not be loaded right now.'; }
}
async function onLinkCredential(resp) {
  try { const r = await api('/auth/google/link', 'POST', { credential: resp.credential }); show(await api('/users/me')); say('gMsg', 'Google connected (' + r.email + ').', true); }
  catch (e) { say('gMsg', e.message, false); }
}
$('gOff').onclick = async () => {
  if (!confirm('Disconnect Google from this account?')) return;
  try { await api('/auth/google', 'DELETE'); show(await api('/users/me')); say('gMsg', 'Google disconnected.', true); } catch (e) { say('gMsg', e.message, false); }
};
