const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const $ = (id) => document.getElementById(id);
const H = { Authorization: 'Bearer ' + token };
const ago = (d) => { const m = Math.max(0, (Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.floor(m) + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
const ICON = { task_assigned: 'fa-clipboard-list', task_reassigned: 'fa-random', task_due_soon: 'fa-clock', task_overdue: 'fa-exclamation', task_completed: 'fa-check', task_update: 'fa-tasks', task_plan: 'fa-sitemap' };
const COLOR = { task_due_soon: '#f5a524', task_overdue: '#e5484d', task_completed: '#3b82f6' };
let items = [], filter = 'all';

async function load() {
  const r = await fetch('/api/notifications', { headers: H });
  if (r.status === 401) return logout();
  const d = await r.json(); items = d.items || [];
  $('cAll').textContent = '(' + items.length + ')'; $('cUnread').textContent = '(' + (d.unread || 0) + ')';
  draw();
}
function draw() {
  const list = $('list'); list.textContent = '';
  const shown = items.filter((n) => filter === 'all' || !n.read);
  if (!shown.length) { list.innerHTML = '<div class="text-center py-4"><img src="/images/empty.svg" width="110" alt=""><div class="small text-muted mt-2">' + (filter === 'unread' ? 'You are all caught up.' : 'No notifications yet.') + '</div></div>'; return; }
  shown.forEach((n) => {
    const row = document.createElement('div'); row.className = 'dl'; row.style.cssText = 'padding:12px;border-radius:10px;margin:4px 6px;cursor:pointer;' + (n.read ? '' : 'background:#eefaf4;');
    const ic = document.createElement('div'); ic.className = 'fi'; ic.style.cssText = 'background:' + (COLOR[n.type] || '#10a463') + ';color:#fff'; ic.innerHTML = '<i class="fas ' + (ICON[n.type] || 'fa-bell') + '"></i>';
    const txt = document.createElement('div'); txt.style.flex = '1';
    const t = document.createElement('div'); t.className = 'nm'; t.textContent = n.title + (n.read ? '' : '  ●');
    const b = document.createElement('div'); b.className = 'small'; b.textContent = n.body;
    const w = document.createElement('small'); w.textContent = ago(n.createdAt) + ' · ' + new Date(n.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    txt.append(t, b, w);
    row.append(ic, txt);
    if (!n.read) { const m = document.createElement('a'); m.href = '#'; m.className = 'small ms-2'; m.textContent = 'Mark read'; m.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await fetch('/api/notifications/' + n._id + '/read', { method: 'POST', headers: H }); load(); }; row.appendChild(m); }
    row.onclick = async () => { await fetch('/api/notifications/' + n._id + '/read', { method: 'POST', headers: H }); if (n.link && n.link.startsWith('/')) location.href = n.link; else load(); };
    list.appendChild(row);
  });
}
document.querySelectorAll('#nt button').forEach((b) => b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('#nt button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
$('readAll').onclick = async () => { await fetch('/api/notifications/read-all', { method: 'POST', headers: H }); load(); };
$('clearRead').onclick = async () => { if (confirm('Delete all notifications you have already read?')) { await fetch('/api/notifications/read', { method: 'DELETE', headers: H }); load(); } };

// OS pop-ups (stay until clicked): only browsers on localhost or https can show them
(function () {
  const d = $('desk');
  if (!window.Notification) d.textContent = 'This browser cannot show desktop pop-ups. The on-screen cards above still stay until you read them.';
  else if (!window.isSecureContext) d.innerHTML = '<i class="fas fa-info-circle me-1"></i>Desktop pop-ups work only when you open the app as <b>http://localhost:5000</b> (or over https). On the host laptop use localhost; other devices still get the persistent on-screen cards.';
  else if (Notification.permission === 'granted') d.innerHTML = '<i class="fas fa-check-circle text-success me-1"></i>Desktop pop-ups are on. They stay on screen until you click them.';
  else if (Notification.permission === 'denied') d.textContent = 'Desktop pop-ups are blocked in your browser settings for this site.';
  else { d.innerHTML = '<button id="enable" class="btn btn-outline-success btn-sm">Turn on desktop pop-ups</button> <span class="text-muted ms-1">They stay on screen until you click them.</span>'; $('enable').onclick = async () => { await Notification.requestPermission(); location.reload(); }; }
})();

load();
setInterval(load, 30000);
