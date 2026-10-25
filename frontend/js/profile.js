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
