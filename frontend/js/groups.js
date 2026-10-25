const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
async function api(path, opts = {}) {
  const r = await fetch('/api/groups' + path, { method: opts.method || 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) return logout();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Request failed');
  return d;
}
const picked = new Map(); // id -> { username, role }
const BADGE = { Admin: 'tag Low', Manager: 'tag Medium', Member: 'tag' };

function drawPicked() {
  $('picked').innerHTML = [...picked].map(([id, m]) => `<div class="d-flex align-items-center gap-2 py-1 small">${avImg(m.username, 26)} ${esc(m.username)}<span class="${BADGE[m.role]} ms-auto" style="background:#eef2f4">${esc(m.role === 'Member' ? 'User' : m.role)}</span><a href="#" data-rm="${esc(id)}" class="text-danger ms-2">✕</a></div>`).join('');
  $('rl').style.display = picked.size ? 'block' : 'none';
  $('roles').innerHTML = [...picked].map(([id, m]) => `<div class="d-flex gap-2 mb-2"><div class="fld" style="flex:1">${esc(m.username)}</div>
    <select class="fld" style="flex:1" data-id="${esc(id)}">${['Admin', 'Manager', 'Member'].map((r) => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${r === 'Member' ? 'User' : r}</option>`).join('')}</select></div>`).join('');
  document.querySelectorAll('[data-rm]').forEach((a) => a.onclick = (e) => { e.preventDefault(); picked.delete(a.dataset.rm); drawPicked(); });
  document.querySelectorAll('#roles select').forEach((s) => s.onchange = () => { picked.get(s.dataset.id).role = s.value; drawPicked(); });
}

let friends = [];
function drawResults() {
  const v = $('ms').value.trim().toLowerCase();
  if (!v) { $('res').innerHTML = ''; return; }
  const list = friends.filter((u) => !picked.has(u._id) && u.username.toLowerCase().includes(v));
  $('res').innerHTML = list.length ? list.map((u) => `<button class="up-opt" data-id="${esc(u._id)}" data-n="${esc(u.username)}" data-pk="${esc(u.publicKey || '')}" ${u.publicKey ? '' : 'style="opacity:.6" title="This friend must log in once to set up encryption"'}>${avImg(u.username, 26)} ${esc(u.username)}${u.publicKey ? '' : ' <span class="text-muted small ms-auto">needs to log in once</span>'}</button>`).join('')
    : '<div class="small text-muted">No friends match. <a href="/pages/friends.html">Add friends</a> first.</div>';
  document.querySelectorAll('#res .up-opt').forEach((b) => b.onclick = () => {
    if (!b.dataset.pk) return;
    picked.set(b.dataset.id, { username: b.dataset.n, role: 'Member', pk: b.dataset.pk });
    $('res').innerHTML = ''; $('ms').value = ''; drawPicked();
  });
}
$('ms').oninput = drawResults;
fetch('/api/friends', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json()).then((d) => { friends = Array.isArray(d) ? d : []; }).catch(() => {});

$('go').onclick = async () => {
  $('err').textContent = '';
  const name = $('gn').value.trim();
  if (!name) { $('err').textContent = 'Group name is required'; return; }
  const myPk = sess.get('e2ee_pk'), mySk = sess.get('e2ee_sk');
  if (!myPk || !mySk) { $('err').textContent = 'Your encryption key is missing on this device. Please log out and log in again.'; return; }
  try {
    $('go').disabled = true;
    // one random key per group; each member gets a copy that only they can open
    const groupKey = E2EE.newGroupKey();
    const myKey = E2EE.wrapKey(groupKey, myPk, mySk, myPk);
    const members = [...picked].map(([userId, m]) => ({ userId, role: m.role, key: E2EE.wrapKey(groupKey, m.pk, mySk, myPk) }));
    await api('', { method: 'POST', body: { name, description: $('gd').value, members, myKey } });
    location.href = '/pages/chat.html';
  } catch (e) { $('err').textContent = e.message; $('go').disabled = false; }
};

(async () => {
  try {
    const g = (await api('/my-groups')).filter((x) => !x.isDirect);
    $('mine').innerHTML = g.length ? g.map((x) => `<div class="d-flex justify-content-between py-1 border-bottom"><span class="text-dark">${avImg(x.name, 26, 'group')} ${esc(x.name)}</span><span class="tag Low">${esc(x.myRole)}</span></div>`).join('') : 'You are not in any group yet.';
  } catch (e) { $('mine').textContent = e.message; }
})();
