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
const picked = new Map(); // id -> { username, email, role, pk }   (a Map: the same person can never be added twice)
let friends = [], shown = [];

function drawPicked() {
  $('chips').innerHTML = [...picked].map(([id, m]) => `<span class="chip">${avImg(m.username, 22)}<span>${esc(m.username)}</span><button type="button" data-rm="${esc(id)}" aria-label="Remove ${esc(m.username)}">✕</button></span>`).join('');
  $('cnt').textContent = picked.size ? `${picked.size} selected` : 'No one selected yet (you can also create the group alone)';
  $('rl').style.display = picked.size ? 'block' : 'none';
  $('roles').innerHTML = [...picked].map(([id, m]) => `<div class="d-flex gap-2 mb-2"><div class="fld" style="flex:1">${esc(m.username)}</div>
    <select class="fld" style="flex:1" data-id="${esc(id)}">${['Admin', 'Manager', 'Member'].map((r) => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${r === 'Member' ? 'User' : r}</option>`).join('')}</select></div>`).join('');
  document.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { picked.delete(b.dataset.rm); drawPicked(); drawResults(); });
  document.querySelectorAll('#roles select').forEach((s) => s.onchange = () => { picked.get(s.dataset.id).role = s.value; });
}

// the list stays open, so several people can be ticked one after another
function drawResults() {
  const v = $('ms').value.trim().toLowerCase();
  shown = friends.filter((u) => !v || u.username.toLowerCase().includes(v) || String(u.email || '').toLowerCase().includes(v)).slice(0, 60);
  $('res').innerHTML = shown.length ? shown.map((u) => `<button type="button" class="up-opt ${picked.has(u._id) ? 'on' : ''}" data-id="${esc(u._id)}" ${u.publicKey ? '' : 'disabled style="opacity:.6" title="This friend must log in once to set up encryption"'}>
      <span class="chk">${picked.has(u._id) ? '✓' : ''}</span>${avImg(u.username, 26)}<span>${esc(u.username)}<span class="em">${esc(u.email || '')}${u.publicKey ? '' : ' · needs to log in once'}</span></span></button>`).join('')
    : `<div class="small text-muted p-2">${friends.length ? 'No friends match.' : 'You have no friends yet.'} <a href="/pages/friends.html">Add friends</a> first.</div>`;
  document.querySelectorAll('#res .up-opt').forEach((b) => b.onclick = () => {
    const u = friends.find((f) => f._id === b.dataset.id); if (!u || !u.publicKey) return;
    if (picked.has(u._id)) picked.delete(u._id); else picked.set(u._id, { username: u.username, email: u.email, role: 'Member', pk: u.publicKey });
    drawPicked(); drawResults();
  });
}
$('ms').oninput = drawResults;
$('ms').onfocus = () => { $('res').hidden = false; drawResults(); };
$('selAll').onclick = (e) => { e.preventDefault(); shown.filter((u) => u.publicKey).forEach((u) => { if (!picked.has(u._id)) picked.set(u._id, { username: u.username, email: u.email, role: 'Member', pk: u.publicKey }); }); drawPicked(); drawResults(); };
$('clrAll').onclick = (e) => { e.preventDefault(); picked.clear(); drawPicked(); drawResults(); };
fetch('/api/friends', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json()).then((d) => { friends = Array.isArray(d) ? d : []; drawResults(); }).catch(() => {});
drawPicked();

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
    $('mine').innerHTML = g.length ? g.map((x) => `<div class="py-2 border-bottom"><div class="d-flex justify-content-between align-items-center gap-2 flex-wrap"><span class="text-dark">${avImg(x.name, 26, 'group')} ${esc(x.name)}</span>
      <span class="small"><a href="#" data-mem="${esc(x._id)}">Members</a> · <a href="/pages/files.html?groupId=${esc(x._id)}">Files</a> · <a href="/pages/documents.html?groupId=${esc(x._id)}">Documents</a> <span class="tag Low ms-1">${esc(x.myRole === 'Member' ? 'User' : x.myRole)}</span></span></div><div class="mem-row" id="m-${esc(x._id)}" hidden></div></div>`).join('') : 'You are not in any group yet.';
    document.querySelectorAll('[data-mem]').forEach((a) => a.onclick = async (e) => {
      e.preventDefault();
      const box = $('m-' + a.dataset.mem);
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false; box.textContent = 'Loading…';
      try { const m = await api(`/${a.dataset.mem}/members`); box.innerHTML = m.map((u) => `<span class="chip">${avImg(u.username, 22)}<span>${esc(u.username)} · ${esc(u.role === 'Member' ? 'User' : u.role)}</span></span>`).join(''); }
      catch (er) { box.textContent = er.message; }
    });
  } catch (e) { $('mine').textContent = e.message; }
})();
