const API = '/api';
const token = sess.get('token');
const user = JSON.parse(sess.get('user') || 'null');
if (!token || !user) window.location.href = '/pages/login.html';

function logout() { sess.clear(); window.location.href = '/pages/login.html'; }

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) return logout();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// XSS-safe text escaping (task titles are user input)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let view = new Date(); view.setDate(1);
let selectedKey = dayKey(new Date());
let groups = [];
let tasks = [];
let manageableGroups = [];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isOverdue(t) { return t.status !== 'Completed' && new Date(t.dueDate) < new Date(); }

async function loadGroups() {
  groups = (await api('/groups/my-groups')).filter((g) => !g.isDirect);
  manageableGroups = groups.filter((g) => g.myRole === 'Admin' || g.myRole === 'Manager');
  const sel = document.getElementById('groupFilter');
  sel.innerHTML = '<option value="">All Groups</option>' + groups.map((g) => `<option value="${esc(g._id)}">${esc(g.name)}</option>`).join('');
  document.getElementById('newTaskBtn').classList.toggle('d-none', manageableGroups.length === 0);
}

async function loadTasks() {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 42);
  const q = new URLSearchParams({ from: gridStart.toISOString(), to: gridEnd.toISOString(), mine: '1' });   // only tasks assigned to me
  const g = document.getElementById('groupFilter').value;
  if (g) q.set('groupId', g);
  tasks = await api('/tasks?' + q.toString());
  const role = document.getElementById('roleFilter').value, prio = document.getElementById('prioFilter').value;
  tasks = tasks.filter((t) => (!role || t.myRole === role) && (!prio || t.priority === prio));
  render(gridStart);
}

function tasksByDay() {
  const map = {};
  tasks.forEach((t) => { (map[dayKey(new Date(t.dueDate))] ||= []).push(t); });
  return map;
}

function dotClass(t) { return t.status === 'Completed' ? 'done' : isOverdue(t) ? 'od' : t.priority; }
let selectedTaskId = null;

function render(gridStart) {
  document.getElementById('monthLabel').textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
  const byDay = tasksByDay();
  const todayKey = dayKey(new Date());
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const key = dayKey(d);
    const list = byDay[key] || [];
    const cell = document.createElement('div');
    cell.className = (d.getMonth() !== view.getMonth() ? 'o ' : '') + (key === todayKey ? 't ' : '') + (key === selectedKey ? 's' : '');
    cell.innerHTML = `<span>${d.getDate()}</span><div class="dots">${list.slice(0, 4).map((t) => `<i class="${dotClass(t)}"></i>`).join('')}</div>`;
    cell.onclick = () => { selectedKey = key; selectedTaskId = null; render(gridStart); };
    grid.appendChild(cell);
  }
  renderDay();
}

function renderDay() {
  const list = tasksByDay()[selectedKey] || [];
  const box = document.getElementById('dayTasks');
  if (!list.length) { box.innerHTML = `<div class="mb-2">${new Date(selectedKey + 'T00:00:00').toDateString()}</div>No tasks due on this day.`; return; }
  const t = list.find((x) => x._id === selectedTaskId) || list[0];
  const canEdit = t.assignedTo?._id === user._id;
  const due = new Date(t.dueDate);
  box.innerHTML = (list.length > 1 ? list.map((x) => `<div class="tl ${x._id === t._id ? 'on' : ''}" data-t="${esc(x._id)}">${esc(x.title)}</div>`).join('') : '') +
    `<div class="d-flex justify-content-between align-items-start mb-1"><b>${esc(t.title)}</b><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span></div>
    <div class="row"><span>Assigned to:</span><b>${avImg(t.assignedTo?.username, 20)} ${esc(t.assignedTo?.username)}</b></div>
    <div class="row"><span>Deadline:</span><b>${due.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${isOverdue(t) ? ' <span class="text-danger">(Overdue)</span>' : ''}</b></div>
    <div class="row"><span>Status:</span><b><select class="form-select form-select-sm" id="stSel" ${canEdit ? '' : 'disabled'}>${['To Do', 'In Progress', 'Completed'].map((x) => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select></b></div>
    <div class="row"><span>Group:</span><b>${esc(t.groupId?.name)}</b></div>
    ${t.description ? `<div class="small mt-2 mb-2">${esc(t.description)}</div>` : ''}
    <a class="btn-g mt-3" href="/pages/tasks.html?id=${encodeURIComponent(t._id)}">View Task</a>`;
  box.querySelectorAll('.tl').forEach((el) => el.onclick = () => { selectedTaskId = el.dataset.t; renderDay(); });
  const sel = document.getElementById('stSel');
  sel.onchange = async () => {
    try { await api('/tasks/' + t._id, { method: 'PATCH', body: { status: sel.value } }); await loadTasks(); }
    catch (e) { alert(e.message); await loadTasks(); }
  };
}

// ---- navigation ----
document.getElementById('prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); loadTasks(); };
document.getElementById('nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); loadTasks(); };
document.getElementById('todayBtn').onclick = () => { view = new Date(); view.setDate(1); selectedKey = dayKey(new Date()); loadTasks(); };
['groupFilter', 'roleFilter', 'prioFilter'].forEach((id) => document.getElementById(id).onchange = loadTasks);

// ---- create task ----
const modal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('taskModal'));
async function fillAssignees() {
  const gid = document.getElementById('tGroup').value;
  const members = await api(`/groups/${gid}/members`);
  document.getElementById('tAssignee').innerHTML = members.map((m) => `<option value="${esc(m._id)}">${esc(m.username)} (${esc(m.role)})</option>`).join('');
}
document.getElementById('newTaskBtn').onclick = async () => {
  document.getElementById('tGroup').innerHTML = manageableGroups.map((g) => `<option value="${esc(g._id)}">${esc(g.name)}</option>`).join('');
  document.getElementById('tDue').value = `${selectedKey}T17:00`;
  document.getElementById('taskError').classList.add('d-none');
  await fillAssignees();
  modal().show();
};
document.getElementById('tGroup').onchange = fillAssignees;
document.getElementById('saveTask').onclick = async () => {
  const err = document.getElementById('taskError');
  try {
    await api('/tasks', { method: 'POST', body: {
      groupId: document.getElementById('tGroup').value,
      title: document.getElementById('tTitle').value.trim(),
      description: document.getElementById('tDesc').value,
      assignedTo: document.getElementById('tAssignee').value,
      priority: document.getElementById('tPriority').value,
      dueDate: new Date(document.getElementById('tDue').value).toISOString()
    } });
    document.getElementById('tTitle').value = ''; document.getElementById('tDesc').value = '';
    modal().hide(); await loadTasks();
  } catch (e) { err.textContent = e.message; err.classList.remove('d-none'); }
};

// ---- .ics export (works fully offline) ----
document.getElementById('exportIcs').onclick = () => {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = (s) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Safe WorkChat//EN'];
  tasks.forEach((t) => lines.push('BEGIN:VEVENT', `UID:${t._id}@safeworkchat`, `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(t.dueDate)}`, `DTEND:${fmt(new Date(new Date(t.dueDate).getTime() + 3600000))}`,
    `SUMMARY:${icsEsc(t.title)}`, `DESCRIPTION:${icsEsc(t.description)}`, 'END:VEVENT'));
  lines.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = 'safe-workchat-tasks.ics'; a.click();
};

// ---- live updates ----
(async () => {
  try {
    await loadGroups();
    await loadTasks();
    if (window.io) {
      const socket = io({ auth: { token } });
      const join = () => groups.forEach((g) => socket.emit('joinRoom', g._id));
      join();
      if (window.watchSocket) window.watchSocket(socket, () => { join(); loadTasks(); });
      socket.on('taskUpdated', loadTasks);
    }
  } catch (e) { document.getElementById('dayTasks').textContent = e.message; }
})();
