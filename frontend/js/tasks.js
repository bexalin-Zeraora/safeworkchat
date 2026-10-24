const token = sess.get('token');
const me = JSON.parse(sess.get('user') || 'null');
if (!token || !me) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { Authorization: 'Bearer ' + token };
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { ...opts, headers: { ...H, ...(opts.json ? { 'Content-Type': 'application/json' } : {}) }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
  if (res.status === 401) return logout();
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Request failed');
  return d;
}
const $ = (id) => document.getElementById(id);
const view = $('view');
const fmt = (d, o) => new Date(d).toLocaleString([], o || { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const q = new URLSearchParams(location.search);
const sz = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB';
const DEF = ['Started', 'Setup Environment', 'Database Integration', 'API Development', 'Testing', 'Code Review', 'Deployment', 'Completed'];
const stagesOf = (t) => (t.stages && t.stages.length ? t.stages : DEF.map((name) => ({ name, done: false })));
const prog = (t) => { const s = stagesOf(t); return [s.filter((x) => x.done).length, s.length]; };
const canAct = (t) => t.assignedTo?._id === me._id;   // only the person it is assigned to updates progress

// ---------- Assign Task (Admin / Manager) ----------
function openNewTask(manageable, done) {
  const g = $('tGroup');
  g.innerHTML = manageable.map((x) => `<option value="${esc(x._id)}">${esc(x.name)}</option>`).join('');
  const d = new Date(Date.now() + 86400000); d.setHours(17, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  $('tDue').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T17:00`;
  $('tTitle').value = ''; $('tDesc').value = ''; $('taskError').textContent = '';
  const loadMembers = async () => {
    const m = await api(`/groups/${g.value}/members`);
    $('tAssignee').innerHTML = m.map((x) => `<option value="${esc(x._id)}">${esc(x.username)} (${esc(x.role === 'Member' ? 'User' : x.role)})</option>`).join('');
  };
  g.onchange = loadMembers;
  loadMembers().catch((e) => { $('taskError').textContent = e.message; });
  $('saveTask').onclick = async () => {
    try {
      $('saveTask').disabled = true;
      await api('/tasks', { method: 'POST', json: { groupId: g.value, title: $('tTitle').value.trim(), description: $('tDesc').value,
        assignedTo: $('tAssignee').value, priority: $('tPriority').value, dueDate: new Date($('tDue').value).toISOString() } });
      bootstrap.Modal.getOrCreateInstance($('taskModal')).hide(); await done();
    } catch (e) { $('taskError').textContent = e.message; }
    $('saveTask').disabled = false;
  };
  bootstrap.Modal.getOrCreateInstance($('taskModal')).show();
}

// ---------- Screen 6: Tasks (two panels: My Tasks | Assigned to friends) ----------
async function list() {
  const [everything, groups, friends] = await Promise.all([api('/tasks'), api('/groups/my-groups'), api('/friends').catch(() => [])]);
  const friendIds = new Set((Array.isArray(friends) ? friends : []).map((f) => f._id));
  const manageable = groups.filter((g) => g.myRole === 'Admin' || g.myRole === 'Manager');
  const mineAll = everything.filter((t) => t.assignedTo?._id === me._id);                                   // given to me
  const givenAll = everything.filter((t) => t.createdBy === me._id && t.assignedTo?._id !== me._id);        // I gave to others
  const teamAll = manageable.length ? everything.filter((t) => (t.myRole === 'Admin' || t.myRole === 'Manager') && t.assignedTo?._id !== me._id) : [];

  let panel = q.get('panel') === 'friends' ? 'friends' : 'mine', tab = 'Active', showTeam = false;

  const draw = () => {
    const base = panel === 'mine' ? mineAll : (showTeam ? teamAll : givenAll);
    const act = base.filter((t) => t.status !== 'Completed'), done = base.filter((t) => t.status === 'Completed');
    const shown = tab === 'Active' ? act : tab === 'Completed' ? done : base;
    const empty = panel === 'friends' && !manageable.length
      ? emptyState('You have not assigned any tasks. Only group Admins and Managers can assign tasks.')
      : emptyState(panel === 'mine' ? 'No tasks here.' : 'No tasks assigned to friends yet.');
    view.innerHTML = `<div class="cd" style="padding:0">
      <div class="p-3 d-flex align-items-center gap-2"><b><i class="far fa-list-alt me-2"></i>Tasks</b>${manageable.length ? '<button id="newTask" class="btn-s ms-auto"><i class="fas fa-plus"></i> Assign Task</button>' : ''}</div>
      <div class="px-3 pb-2"><div class="seg"><button data-p="mine" class="${panel === 'mine' ? 'on' : ''}">My Tasks <span>${mineAll.length}</span></button><button data-p="friends" class="${panel === 'friends' ? 'on' : ''}">Assigned to friends <span>${givenAll.length}</span></button></div></div>
      ${panel === 'friends' && manageable.length ? `<div class="px-3 pb-1 small"><label class="d-flex align-items-center gap-2 text-muted"><input type="checkbox" id="allTeam" ${showTeam ? 'checked' : ''}> Also show tasks other Admins/Managers assigned in my groups (${teamAll.length})</label></div>` : ''}
      <div class="tabs"><button data-t="Active" class="${tab === 'Active' ? 'on' : ''}">Active (${act.length})</button><button data-t="Completed" class="${tab === 'Completed' ? 'on' : ''}">Completed (${done.length})</button><button data-t="All" class="${tab === 'All' ? 'on' : ''}">All (${base.length})</button></div>
      <div class="p-3 pt-0">${shown.length ? shown.map(card).join('') : empty}</div></div>`;
    view.querySelectorAll('.seg button').forEach((b) => b.onclick = () => { panel = b.dataset.p; tab = 'Active'; draw(); });
    view.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const at = document.getElementById('allTeam'); if (at) at.onchange = () => { showTeam = at.checked; draw(); };
    const nb = document.getElementById('newTask');
    if (nb) nb.onclick = () => openNewTask(manageable, async () => { location.href = '?panel=friends'; });
  };

  const card = (t) => {
    const [d, n] = prog(t), st = stagesOf(t), next = st.findIndex((s) => !s.done);
    const who = t.assignedTo?.username, isFriend = friendIds.has(t.assignedTo?._id);
    const sub = panel === 'mine'
      ? `Assigned by ${esc(t.createdBy === me._id ? 'you' : 'your group')} · Due ${fmt(t.dueDate)}`
      : `Assigned to <b>${esc(who)}</b>${isFriend ? ' <span class="fb">Friend</span>' : ''} · Due ${fmt(t.dueDate)}`;
    return `<div class="tc"><div class="top"><div><b>${avImg(who, 26)} <a class="text-decoration-none text-dark" href="?id=${esc(t._id)}">${esc(t.title)}</a></b><div class="small text-muted">${sub}</div></div>
      <div class="text-end"><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span><div class="small text-muted">${d}/${n} updates</div></div></div>
      <div class="pb"><i style="width:${(d / n) * 100}%"></i></div>
      ${st.map((s, i) => `<div class="st ${s.done ? 'd' : ''}"><span class="n">${s.done ? '<i class="fas fa-check"></i>' : i + 1}</span><div>${esc(s.name)}${s.done ? `<span class="when">${fmt(s.doneAt)}</span>` : ''}</div>
        ${s.done ? (s.proofType ? `<span class="pt">${esc(s.proofType)}</span>` : '') : i === next && canAct(t) ? `<a class="btn-s text-decoration-none" href="?update=${esc(t._id)}&stage=${encodeURIComponent(s.name)}">Update Status</a>` : '<span class="pend">Pending</span>'}</div>`).join('')}${!canAct(t) ? `<div class="small text-muted mt-2"><i class="fas fa-eye me-1"></i>View only: ${esc(who)} updates this task's progress.</div>` : ''}</div>`;
  };
  draw();
}

// ---------- Screen 7: Update Task Status ----------
async function update(id) {
  const t = await api('/tasks/' + id), st = stagesOf(t), [d, n] = prog(t);
  const pending = st.filter((s) => !s.done);
  if (!canAct(t) || !pending.length) { view.innerHTML = '<div class="cd">Nothing to update on this task.</div>'; return; }
  let ptype = '', file = null;
  const want = q.get('stage');
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-2"><a class="back" href="?"><i class="fas fa-chevron-left"></i></a><b>Update Task Status</b></div>
    <div class="small">${avImg(t.assignedTo?.username, 26)} <b>${esc(t.title)}</b><span class="text-muted ms-2">${d}/${n} updates</span></div><div class="pb"><i style="width:${(d / n) * 100}%"></i></div>
    <label class="lbl">Current Status</label><select id="stage" class="fld">${pending.map((s) => `<option ${s.name === want ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <label class="lbl">Add Proof</label>
    <button class="up-opt" data-p="Photo" data-a="image/*"><i class="far fa-image"></i>Upload Image</button>
    <button class="up-opt" data-p="Document" data-a=".pdf,.doc,.docx,.txt,.md,.pptx,.xlsx"><i class="far fa-file-alt"></i>Upload Document</button>
    <button class="up-opt" data-p="File" data-a="*"><i class="far fa-file"></i>Upload File</button>
    <input type="file" id="fi" hidden><div id="chosen"></div>
    <label class="lbl">Comments (optional)</label><textarea id="cm" class="fld" rows="3" maxlength="500" placeholder="Add a note"></textarea>
    <div id="err" class="text-danger small mt-2"></div><button id="sub" class="btn-g mt-3">Submit Update</button></div>`;
  view.querySelectorAll('.up-opt').forEach((b) => b.onclick = () => { ptype = b.dataset.p; $('fi').accept = b.dataset.a; $('fi').click(); });
  $('fi').onchange = () => {
    file = $('fi').files[0] || null;
    if (file && file.size > 10 * 1048576) { file = null; $('err').textContent = 'File must be under 10 MB'; return; }
    view.querySelectorAll('.up-opt').forEach((b) => b.classList.toggle('on', b.dataset.p === ptype && !!file));
    $('chosen').innerHTML = file ? `<div class="fchip mt-2"><i class="far fa-file"></i>${esc(file.name)} · ${sz(file.size)} <a href="#" id="rm" class="ms-2 text-danger">✕</a></div>` : '';
    if ($('rm')) $('rm').onclick = (e) => { e.preventDefault(); file = null; $('fi').value = ''; ptype = ''; $('chosen').innerHTML = ''; view.querySelectorAll('.up-opt').forEach((b) => b.classList.remove('on')); };
  };
  $('sub').onclick = async () => {
    const fd = new FormData();
    fd.append('stage', $('stage').value); fd.append('comment', $('cm').value); if (ptype) fd.append('proofType', ptype);
    if (file) fd.append('proof', file);
    try { $('sub').disabled = true; await api(`/tasks/${id}/updates`, { method: 'POST', body: fd }); location.href = '?id=' + id; }
    catch (e) { $('err').textContent = e.message; $('sub').disabled = false; }
  };
}

// ---------- Screen 8: Task Details & History ----------
async function detail(id, tab = 'Status History') {
  const [t, acts] = await Promise.all([api('/tasks/' + id), api(`/tasks/${id}/activity`)]);
  const hist = acts.filter((a) => a.action === 'stage_update').reverse();
  const files = hist.filter((a) => a.file && a.file.filename);
  const comments = acts.filter((a) => a.comment);
  const [d, n] = prog(t), st = stagesOf(t);
  const link = (a) => a.file && a.file.filename ? `<a class="fchip" href="#" data-dl="${esc(a._id)}" data-n="${esc(a.file.originalName)}"><i class="far fa-file"></i>${esc(a.file.originalName)}</a>` : '';
  const body = {
    'Details': `<div class="small"><p>${esc(t.description) || '<span class="text-muted">No description.</span>'}</p>
      <div class="row g-2"><div class="col-6 text-muted">Assigned to</div><div class="col-6">${esc(t.assignedTo?.username)}</div><div class="col-6 text-muted">Group</div><div class="col-6">${esc(t.groupId?.name)}</div>
      <div class="col-6 text-muted">Deadline</div><div class="col-6">${fmt(t.dueDate, { dateStyle: 'medium', timeStyle: 'short' })}</div><div class="col-6 text-muted">Status</div><div class="col-6">${esc(t.status)}</div><div class="col-6 text-muted">Progress</div><div class="col-6">${d}/${n} updates</div></div></div>`,
    'Status History': `<div class="tlv">${st.map((s, i) => { const a = hist.filter((h) => h.stage === s.name).pop();
      return `<div class="it ${s.done ? '' : 'p'}"><span class="n">${i + 1}</span><b>${esc(s.name)}</b>${s.done ? `<small>${fmt(s.doneAt)} · By ${esc(a?.userId?.username || '')}</small>${a?.comment ? `<small>${esc(a.comment)}</small>` : ''}${a ? link(a) : ''}` : '<small>Pending</small>'}</div>`; }).join('')}</div>`,
    'Files': files.length ? files.map((a) => `<div class="mb-2">${link(a)} <span class="small text-muted">${sz(a.file.size || 0)} · ${esc(a.userId?.username)}</span></div>`).join('') : '<div class="text-muted small">No files uploaded yet.</div>',
    'Comments': `${comments.map((a) => `<div class="mb-2 small"><b>${esc(a.userId?.username)}</b> <span class="text-muted">${fmt(a.createdAt)}</span><br>${esc(a.comment)}</div>`).join('') || '<div class="text-muted small mb-2">No comments yet.</div>'}
      <div class="d-flex gap-2"><input id="nc" class="fld" maxlength="500" placeholder="Write a comment"><button id="nb" class="btn-s">Send</button></div>`
  };
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-3"><a class="back" href="?"><i class="fas fa-chevron-left"></i></a><b>Task Details</b><span class="tag ${esc(t.priority)} ms-auto">${esc(t.priority)}</span></div>
    <div class="fw-bold mb-2 d-flex align-items-center gap-2">${avImg(t.assignedTo?.username, 28)}${esc(t.title)}</div><div class="tabs">${Object.keys(body).map((k) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${k}</button>`).join('')}</div>${body[tab]}
    ${canAct(t) && st.some((s) => !s.done) ? `<a class="btn-g mt-3" href="?update=${esc(id)}">Update Status</a>` : ''}</div>`;
  view.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => detail(id, b.dataset.k));
  view.querySelectorAll('[data-dl]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const r = await fetch(`/api/tasks/${id}/files/${a.dataset.dl}`, { headers: H });
    if (!r.ok) return alert('Download failed');
    const url = URL.createObjectURL(await r.blob()), l = document.createElement('a'); l.href = url; l.download = a.dataset.n; l.click(); URL.revokeObjectURL(url);
  });
  if ($('nb')) $('nb').onclick = async () => { if (!$('nc').value.trim()) return; await api(`/tasks/${id}/comments`, { method: 'POST', json: { comment: $('nc').value } }); detail(id, 'Comments'); };
}

(async () => {
  try { q.get('update') ? await update(q.get('update')) : q.get('id') ? await detail(q.get('id')) : await list(); }
  catch (e) { view.innerHTML = `<div class="cd text-danger">${esc(e.message)}</div>`; }
})();
