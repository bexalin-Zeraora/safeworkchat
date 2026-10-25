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
// phases are planned by the assigned person; a task can have none yet
const stagesOf = (t) => t.stages || [];
const prog = (t) => { const s = stagesOf(t); return [s.filter((x) => x.done).length, s.length]; };
const currentPhase = (t) => { const s = stagesOf(t); const i = s.findIndex((x) => x.state === 'in_progress'); return i >= 0 ? i : s.findIndex((x) => !x.done); };
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
  const manageable = groups.filter((g) => !g.isDirect && (g.myRole === 'Admin' || g.myRole === 'Manager'));
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
    const [d, n] = prog(t), st = stagesOf(t), cur = currentPhase(t);
    const who = t.assignedTo?.username, isFriend = friendIds.has(t.assignedTo?._id);
    const sub = panel === 'mine'
      ? `Assigned by ${esc(t.createdBy === me._id ? 'you' : 'your group')} · Due ${fmt(t.dueDate)}`
      : `Assigned to <b>${esc(who)}</b>${isFriend ? ' <span class="fb">Friend</span>' : ''} · Due ${fmt(t.dueDate)}`;
    let phaseLine;
    if (!n) phaseLine = canAct(t)
      ? `<div class="d-flex align-items-center gap-2 mb-2 small"><span class="text-muted">No phases yet. Plan the phases for this work.</span><a class="btn-s text-decoration-none ms-auto" href="?plan=${esc(t._id)}">Plan phases</a></div>`
      : `<div class="small text-muted mb-2"><i class="far fa-clock me-1"></i>${esc(who)} has not planned the phases yet.</div>`;
    else if (cur >= 0) phaseLine = `<div class="d-flex align-items-center gap-2 mb-2 small flex-wrap"><span class="text-muted">${st[cur].state === 'in_progress' ? 'Working on' : 'Next'} (phase ${cur + 1} of ${n}):</span><b>${esc(st[cur].name)}</b>${canAct(t) ? `<a class="btn-s text-decoration-none ms-auto" href="?update=${esc(t._id)}">Update Status</a>` : ''}</div>`;
    else phaseLine = '<div class="small text-success mb-2"><i class="fas fa-check-circle me-1"></i>All phases completed</div>';
    return `<div class="tc"><div class="top"><div><b>${avImg(who, 26)} <a class="text-decoration-none text-dark" href="?id=${esc(t._id)}">${esc(t.title)}</a></b><div class="small text-muted">${sub}</div></div>
      <div class="text-end"><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span><div class="small text-muted">${n ? `${d}/${n} phases` : 'no phases yet'}</div></div></div>
      <div class="pb"><i style="width:${n ? (d / n) * 100 : 0}%"></i></div>
      ${phaseLine}
      ${n ? `<details ${n <= 6 ? 'open' : ''}><summary class="small text-muted" style="cursor:pointer">${n} phases</summary>
      ${st.map((s, i) => `<div class="st ${s.done ? 'd' : ''}"><span class="n">${s.done ? '<i class="fas fa-check"></i>' : i + 1}</span><div>${esc(s.name)}${s.description ? `<span class="when">${esc(s.description)}</span>` : ''}${s.done ? `<span class="when">OK · ${fmt(s.doneAt)}</span>` : ''}</div>
        ${s.done ? (s.proofType ? `<span class="pt">${esc(s.proofType)}</span>` : '') : s.state === 'in_progress' ? '<span class="pt" style="background:#fff3dc;color:#c27d0e">In progress</span>' : '<span class="pend">Pending</span>'}</div>`).join('')}</details>` : ''}${!canAct(t) ? `<div class="small text-muted mt-2"><i class="fas fa-eye me-1"></i>View only: ${esc(who)} plans and updates this task's phases.</div>` : ''}</div>`;
  };
  draw();
}

// ---------- Plan phases (assigned person) ----------
async function plan(id) {
  const t = await api('/tasks/' + id), st = stagesOf(t);
  if (!canAct(t)) { view.innerHTML = '<div class="cd">Only the person this task is assigned to can plan its phases.</div>'; return; }
  if (t.status === 'Completed') { view.innerHTML = '<div class="cd">This task is already completed.</div>'; return; }
  const done = st.filter((x) => x.done);
  let rows = st.filter((x) => !x.done).map((x) => ({ _id: x._id, name: x.name, description: x.description || '' }));
  if (!st.length) rows = [{ name: '', description: '' }, { name: '', description: '' }];
  const draw = () => {
    const total = done.length + rows.length;
    view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-2"><a class="back" href="?${q.get('id') ? 'id=' + id : ''}"><i class="fas fa-chevron-left"></i></a><b>Plan phases</b><span class="ms-auto small ${total >= 2 && total <= 100 ? 'text-muted' : 'text-danger'}">${total} phase${total === 1 ? '' : 's'} (2 to 100)</span></div>
      <div class="small mb-2"><b>${esc(t.title)}</b><div class="text-muted">Break the work into as many phases as it needs. Give each phase a name and say what you will do in it. Later you tell the assigner which phase you are working on and which phase is OK.</div></div>
      ${done.map((x, i) => `<div class="tc" style="opacity:.7"><div class="small"><i class="fas fa-check-circle text-success me-1"></i><b>${i + 1}. ${esc(x.name)}</b> <span class="text-muted">· completed, cannot be changed</span></div></div>`).join('')}
      ${rows.map((r, i) => `<div class="tc" data-i="${i}"><div class="d-flex gap-2 align-items-center mb-2"><span class="n" style="width:24px;height:24px;border-radius:50%;background:#e6edf0;display:inline-flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700">${done.length + i + 1}</span><input class="fld ph-name" maxlength="60" placeholder="Phase name, e.g. Collect requirements" value="${esc(r.name)}"><button class="btn btn-outline-danger btn-sm ph-del" title="Remove this phase"><i class="fas fa-trash"></i></button></div>
        <textarea class="fld ph-desc" rows="2" maxlength="300" placeholder="Describe what you will do in this phase">${esc(r.description)}</textarea></div>`).join('')}
      <div class="d-flex gap-2 flex-wrap align-items-center mb-2"><button id="addOne" class="btn btn-outline-success btn-sm"><i class="fas fa-plus"></i> Add a phase</button>
        <span class="small text-muted ms-2">or add several:</span><input id="addN" type="number" min="1" max="100" value="5" class="fld" style="width:80px;padding:5px 8px"><button id="addMany" class="btn btn-outline-secondary btn-sm">Add</button></div>
      <div id="err" class="text-danger small mb-2"></div><button id="save" class="btn-g">Save phases</button></div>`;
    const read = () => view.querySelectorAll('.tc[data-i]').forEach((el) => { const r = rows[Number(el.dataset.i)]; r.name = el.querySelector('.ph-name').value; r.description = el.querySelector('.ph-desc').value; });
    view.querySelectorAll('.ph-del').forEach((b) => b.onclick = () => { read(); rows.splice(Number(b.closest('.tc').dataset.i), 1); draw(); });
    $('addOne').onclick = () => { read(); rows.push({ name: '', description: '' }); draw(); };
    $('addMany').onclick = () => { read(); const n = Math.max(1, Math.min(100, Number($('addN').value) || 1)); for (let i = 0; i < n && done.length + rows.length < 100; i++) rows.push({ name: '', description: '' }); draw(); };
    $('save').onclick = async () => {
      read();
      const phases = rows.map((r, i) => ({ ...(r._id ? { _id: r._id } : {}), name: r.name.trim() || `Phase ${done.length + i + 1}`, description: r.description.trim() }));
      if (done.length + phases.length < 2 || done.length + phases.length > 100) { $('err').textContent = 'A task needs between 2 and 100 phases.'; return; }
      try { $('save').disabled = true; await api(`/tasks/${id}/phases`, { method: 'PUT', json: { phases } }); location.href = '?id=' + id; }
      catch (e) { $('err').textContent = e.message; $('save').disabled = false; }
    };
  };
  draw();
}

// ---------- Screen 7: Update Task Status ----------
async function update(id) {
  const t = await api('/tasks/' + id), st = stagesOf(t), [d, n] = prog(t);
  if (!canAct(t)) { view.innerHTML = '<div class="cd">Only the person this task is assigned to can update its progress.</div>'; return; }
  if (!n) { location.replace('?plan=' + id); return; }
  const pending = st.map((s, i) => ({ s, i })).filter((x) => !x.s.done);
  if (!pending.length) { view.innerHTML = '<div class="cd">All phases are completed.</div>'; return; }
  const start = currentPhase(t);
  let ptype = '', file = null;
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-2"><a class="back" href="?id=${esc(id)}"><i class="fas fa-chevron-left"></i></a><b>Update Task Status</b><a class="ms-auto small" href="?plan=${esc(id)}">Edit phases</a></div>
    <div class="small">${avImg(t.assignedTo?.username, 26)} <b>${esc(t.title)}</b><span class="text-muted ms-2">${d}/${n} phases OK</span></div><div class="pb"><i style="width:${(d / n) * 100}%"></i></div>
    <label class="lbl">Which phase?</label><select id="stage" class="fld">${pending.map((x) => `<option value="${esc(x.s._id)}" ${x.i === start ? 'selected' : ''}>Phase ${x.i + 1}: ${esc(x.s.name)}${x.s.state === 'in_progress' ? ' (in progress)' : ''}</option>`).join('')}</select>
    <div id="phDesc" class="small text-muted mt-1"></div>
    <label class="lbl">What is its status?</label>
    <button class="up-opt on" data-act="working"><i class="fas fa-spinner"></i>I am working on this phase</button>
    <button class="up-opt" data-act="done"><i class="fas fa-check-circle"></i>This phase is OK (completed)</button>
    <div id="lastNote" class="small text-muted mt-1"></div>
    <label class="lbl">Add Proof (when the phase is OK)</label>
    <button class="up-opt" data-p="Photo" data-a="image/*"><i class="far fa-image"></i>Upload Image</button>
    <button class="up-opt" data-p="Document" data-a=".pdf,.doc,.docx,.txt,.md,.pptx,.xlsx"><i class="far fa-file-alt"></i>Upload Document</button>
    <button class="up-opt" data-p="File" data-a="*"><i class="far fa-file"></i>Upload File</button>
    <input type="file" id="fi" hidden><div id="chosen"></div>
    <label class="lbl">Comments (optional)</label><textarea id="cm" class="fld" rows="3" maxlength="500" placeholder="Add a note"></textarea>
    <div id="err" class="text-danger small mt-2"></div><button id="sub" class="btn-g mt-3">Submit Update</button></div>`;
  let action = 'working';
  const showDesc = () => { const s = st.find((x) => x._id === $('stage').value); $('phDesc').textContent = s && s.description ? s.description : ''; $('lastNote').textContent = action === 'done' && pending.length === 1 ? 'This is the last phase: marking it OK completes the whole task.' : ''; };
  $('stage').onchange = showDesc; showDesc();
  view.querySelectorAll('.up-opt[data-act]').forEach((b) => b.onclick = () => { action = b.dataset.act; view.querySelectorAll('.up-opt[data-act]').forEach((x) => x.classList.toggle('on', x === b)); showDesc(); });
  view.querySelectorAll('.up-opt[data-p]').forEach((b) => b.onclick = () => { ptype = b.dataset.p; $('fi').accept = b.dataset.a; $('fi').click(); });
  $('fi').onchange = () => {
    file = $('fi').files[0] || null;
    if (file && file.size > 10 * 1048576) { file = null; $('err').textContent = 'File must be under 10 MB'; return; }
    view.querySelectorAll('.up-opt[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === ptype && !!file));
    $('chosen').innerHTML = file ? `<div class="fchip mt-2"><i class="far fa-file"></i>${esc(file.name)} · ${sz(file.size)} <a href="#" id="rm" class="ms-2 text-danger">✕</a></div>` : '';
    if ($('rm')) $('rm').onclick = (e) => { e.preventDefault(); file = null; $('fi').value = ''; ptype = ''; $('chosen').innerHTML = ''; view.querySelectorAll('.up-opt[data-p]').forEach((b) => b.classList.remove('on')); };
  };
  $('sub').onclick = async () => {
    const fd = new FormData();
    fd.append('stageId', $('stage').value); fd.append('action', action); fd.append('comment', $('cm').value);
    if (action === 'done' && ptype) fd.append('proofType', ptype);
    if (action === 'done' && file) fd.append('proof', file);
    try { $('sub').disabled = true; await api(`/tasks/${id}/updates`, { method: 'POST', body: fd }); location.href = '?id=' + id; }
    catch (e) { $('err').textContent = e.message; $('sub').disabled = false; }
  };
}

// ---------- Screen 8: Task Details & History ----------
async function detail(id, tab = 'Status History') {
  const [t, acts] = await Promise.all([api('/tasks/' + id), api(`/tasks/${id}/activity`)]);
  const hist = acts.filter((a) => a.action === 'stage_update').reverse();
  const workLog = acts.filter((a) => a.action === 'stage_working');   // newest first
  const forStage = (list, s) => list.filter((h) => h.stageId === String(s._id) || (!h.stageId && h.stage === s.name));
  const files = hist.filter((a) => a.file && a.file.filename);
  const comments = acts.filter((a) => a.comment);
  const [d, n] = prog(t), st = stagesOf(t);
  const viewable = (n) => /\.(png|jpe?g|gif|webp|pdf|txt)$/i.test(n || '');
  const link = (a) => a.file && a.file.filename
    ? `<span class="fchip"><i class="far fa-file"></i>${esc(a.file.originalName)}</span>${viewable(a.file.originalName) ? ` <a class="fchip" href="#" data-view="${esc(a._id)}"><i class="far fa-eye"></i>View</a>` : ''} <a class="fchip" href="#" data-dl="${esc(a._id)}" data-n="${esc(a.file.originalName)}"><i class="fas fa-download"></i>Download</a>`
    : (a.fileHidden ? '<span class="fchip" style="background:#f1f3f5;color:#7a8a94"><i class="fas fa-lock"></i>File visible to the assignee and managers only</span>' : '');
  const body = {
    'Details': `<div class="small"><p>${esc(t.description) || '<span class="text-muted">No description.</span>'}</p>
      <div class="row g-2"><div class="col-6 text-muted">Assigned to</div><div class="col-6">${esc(t.assignedTo?.username)}</div><div class="col-6 text-muted">Group</div><div class="col-6">${esc(t.groupId?.name)}</div>
      <div class="col-6 text-muted">Deadline</div><div class="col-6">${fmt(t.dueDate, { dateStyle: 'medium', timeStyle: 'short' })}</div><div class="col-6 text-muted">Status</div><div class="col-6">${esc(t.status)}</div><div class="col-6 text-muted">Progress</div><div class="col-6">${n ? `${d}/${n} phases OK` : 'phases not planned yet'}</div></div></div>`,
    'Status History': !n ? `<div class="text-muted small">${canAct(t) ? 'No phases yet. <a href="?plan=' + esc(id) + '">Plan the phases</a> for this work.' : esc(t.assignedTo?.username) + ' has not planned the phases yet.'}</div>` : `<div class="tlv">${st.map((s, i) => {
      const a = forStage(hist, s).pop(), w = forStage(workLog, s)[0];
      // with many phases, show every completed one, the current ones, the next 3, and a summary of the rest
      const firstPending = st.findIndex((x) => !x.done);
      if (!s.done && s.state !== 'in_progress' && i > firstPending + 2) return i === firstPending + 3 ? `<div class="it p"><span class="n">…</span><small>${st.length - i} more phases pending</small></div>` : '';
      const desc = s.description ? `<small>${esc(s.description)}</small>` : '';
      const body = s.done ? `<small>OK · ${fmt(s.doneAt)} · By ${esc(a?.userId?.username || '')}</small>${a?.comment ? `<small>“${esc(a.comment)}”</small>` : ''}${a ? link(a) : ''}`
        : s.state === 'in_progress' ? `<small style="color:#c27d0e"><b>In progress</b>${w ? ' · since ' + fmt(w.createdAt) : ''}</small>${w?.comment ? `<small>“${esc(w.comment)}”</small>` : ''}` : '<small>Pending</small>';
      return `<div class="it ${s.done ? '' : 'p'}"><span class="n">${i + 1}</span><b>${esc(s.name)}</b>${desc}${body}</div>`; }).join('')}</div>`,
    'Files': (files.length ? files.map((a) => `<div class="mb-2">${link(a)} <span class="small text-muted">${sz(a.file.size || 0)} · ${esc(a.stage)} · ${esc(a.userId?.username)}</span></div>`).join('') : '<div class="text-muted small">No files uploaded yet.</div>') + (hist.some((a) => a.fileHidden) ? '<div class="small text-muted mt-2"><i class="fas fa-lock me-1"></i>Some uploads are visible only to the assignee and group Admins/Managers.</div>' : ''),
    'Comments': `${comments.map((a) => `<div class="mb-2 small"><b>${esc(a.userId?.username)}</b> <span class="text-muted">${fmt(a.createdAt)}</span><br>${esc(a.comment)}</div>`).join('') || '<div class="text-muted small mb-2">No comments yet.</div>'}
      <div class="d-flex gap-2"><input id="nc" class="fld" maxlength="500" placeholder="Write a comment"><button id="nb" class="btn-s">Send</button></div>`
  };
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-3"><a class="back" href="?"><i class="fas fa-chevron-left"></i></a><b>Task Details</b><span class="tag ${esc(t.priority)} ms-auto">${esc(t.priority)}</span></div>
    <div class="fw-bold mb-2 d-flex align-items-center gap-2">${avImg(t.assignedTo?.username, 28)}${esc(t.title)}</div><div class="tabs">${Object.keys(body).map((k) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${k}</button>`).join('')}</div>${body[tab]}
    ${canAct(t) && t.status !== 'Completed' ? (n ? `<a class="btn-g mt-3" href="?update=${esc(id)}">Update Status</a><a class="d-block text-center small mt-2" href="?plan=${esc(id)}&id=${esc(id)}">Edit phases</a>` : `<a class="btn-g mt-3" href="?plan=${esc(id)}&id=${esc(id)}">Plan phases</a>`) : ''}</div>`;
  view.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => detail(id, b.dataset.k));
  view.querySelectorAll('[data-dl]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const r = await fetch(`/api/tasks/${id}/files/${a.dataset.dl}`, { headers: H });
    if (!r.ok) return alert('Download failed');
    const url = URL.createObjectURL(await r.blob()), l = document.createElement('a'); l.href = url; l.download = a.dataset.n; l.click(); URL.revokeObjectURL(url);
  });
  view.querySelectorAll('[data-view]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const w = window.open('', '_blank');                      // open first so the pop-up is not blocked
    const r = await fetch(`/api/tasks/${id}/files/${a.dataset.view}?inline=1`, { headers: H });
    if (!r.ok) { if (w) w.close(); return alert('Could not open the file'); }
    const url = URL.createObjectURL(await r.blob());
    if (w) w.location.href = url; else location.href = url;
  });
  if ($('nb')) $('nb').onclick = async () => { if (!$('nc').value.trim()) return; await api(`/tasks/${id}/comments`, { method: 'POST', json: { comment: $('nc').value } }); detail(id, 'Comments'); };
}

(async () => {
  try { q.get('plan') ? await plan(q.get('plan')) : q.get('update') ? await update(q.get('update')) : q.get('id') ? await detail(q.get('id')) : await list(); }
  catch (e) { view.innerHTML = `<div class="cd text-danger">${esc(e.message)}</div>`; }
})();
