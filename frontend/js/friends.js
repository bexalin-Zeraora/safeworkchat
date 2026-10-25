const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
async function api(path, method = 'GET', body) {
  const r = await fetch('/api/friends' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) return logout();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Request failed');
  return d;
}

async function loadCode() { $('code').textContent = (await api('/code')).code; }
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('code').textContent); $('copy').textContent = 'Copied'; } catch (e) { prompt('Copy your code:', $('code').textContent); } setTimeout(() => $('copy').textContent = 'Copy', 1500); };
$('reset').onclick = async () => { if (confirm('Reset your friend code? The old one will stop working.')) { $('code').textContent = (await api('/code/reset', 'POST')).code; } };

$('send').onclick = async () => {
  const v = $('who').value.trim();
  if (!v) return;
  try {
    const r = await api('/request', 'POST', { identifier: v });
    $('addMsg').className = 'small mt-2 text-success'; $('addMsg').textContent = r.message; $('who').value = '';
    load();
  } catch (e) { $('addMsg').className = 'small mt-2 text-danger'; $('addMsg').textContent = e.message; }
};
$('who').onkeydown = (e) => { if (e.key === 'Enter') $('send').click(); };

async function load() {
  try {
    const [reqs, friends] = await Promise.all([api('/requests'), api('')]);
    const rows = [
      ...reqs.incoming.map((r) => `<div class="dl">${avImg(r.username, 36)}<div class="nm">${esc(r.username)}<small>wants to be your friend</small></div><div class="ac"><a href="#" data-a="${esc(r._id)}">Accept</a> · <a href="#" data-d="${esc(r._id)}" style="color:#e5484d">Decline</a></div></div>`),
      ...reqs.outgoing.map((r) => `<div class="dl"><div class="fi txt"><i class="fas fa-clock"></i></div><div class="nm">${esc(r.username)}<small>waiting for them to accept</small></div></div>`)
    ];
    $('reqs').innerHTML = rows.length ? rows.join('') : 'No pending requests.';
    $('list').innerHTML = friends.length ? friends.map((f) => `<div class="dl">${avImg(f.username, 36)}<div class="nm">${esc(f.username)}<small>${f.publicKey ? 'Encryption ready' : 'Has not logged in since encryption was added'}</small></div><div class="ac"><a href="/pages/chat.html?dm=${esc(f._id)}">Message</a> · <a href="#" data-u="${esc(f._id)}" style="color:#e5484d">Remove</a></div></div>`).join('') : emptyState('No friends yet. Share your code or add someone by username.');
    document.querySelectorAll('[data-a]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); await api(`/requests/${a.dataset.a}/accept`, 'POST'); load(); });
    document.querySelectorAll('[data-d]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); await api(`/requests/${a.dataset.d}/decline`, 'POST'); load(); });
    document.querySelectorAll('[data-u]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); if (confirm('Remove this friend? They stay in groups you already share.')) { await api('/' + a.dataset.u, 'DELETE'); load(); } });
  } catch (e) { $('reqs').textContent = e.message; }
}

loadCode().catch((e) => $('code').textContent = e.message);
load();
if (window.io) io({ auth: { token } }).on('friendsChanged', load);
