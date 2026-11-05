const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const H = { Authorization: 'Bearer ' + token };
async function api(path, method = 'GET', json) {
  const r = await fetch(path, { method, headers: { ...H, ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  if (r.status === 401) return logout();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || 'Request failed'), { status: r.status, data: d });
  return d;
}
async function sendForm(path, method, fd) {                       // file uploads (multipart)
  const r = await fetch(path, { method, headers: H, body: fd });
  if (r.status === 401) return logout();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || 'Upload failed'), { status: r.status, data: d });
  return d;
}
const blobOf = async (path) => { const r = await fetch(path, { headers: H }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Could not open the file'); return r.blob(); };
const saveBlob = (blob, name) => { const url = URL.createObjectURL(blob), l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
const view = $('view');
const q = new URLSearchParams(location.search);
const ICON = { docx: 'fa-file-word', md: 'fa-file-code', txt: 'fa-file-alt', pdf: 'fa-file-pdf', png: 'fa-file-image', jpg: 'fa-file-image', webp: 'fa-file-image', doc: 'fa-file-word' };
const ago = (d) => { const m = Math.max(0, (Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${Math.floor(m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} hours ago` : `${Math.floor(m / 1440)} days ago`; };
const stamp = (d) => new Date(d).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const sz = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.ceil(b / 1024)) + ' KB';
const me = JSON.parse(sess.get('user') || 'null') || {};

// ---------- Documents list ----------
async function list() {
  let scope = 'all', term = '', src = '', groupFilter = q.get('groupId') || '';
  const taskFilter = q.get('taskId') || '';
  const [groups, myTasks] = await Promise.all([api('/api/groups/my-groups'), api('/api/tasks').catch(() => [])]);
  const real = groups.filter((g) => !g.isDirect);
  const manages = (gid) => real.some((g) => g._id === gid && (g.myRole === 'Admin' || g.myRole === 'Manager'));
  // tasks I may attach a document to: assigned to me, or in a group I manage
  const taskChoices = myTasks.filter((t) => t.status !== undefined && (t.assignedTo?._id === me._id || manages(t.groupId?._id)));
  const addGroups = real.filter((g) => g.myRole === 'Admin' || g.myRole === 'Manager' || taskChoices.some((t) => t.groupId?._id === g._id && t.assignedTo?._id === me._id));

  view.innerHTML = `<div class="cd" style="padding:0"><div class="d-flex align-items-center p-3 gap-2 flex-wrap"><b><i class="far fa-folder-open me-2"></i>Documents</b>
    ${addGroups.length ? '<span class="ms-auto d-flex gap-2"><button id="ub" class="btn btn-outline-success btn-sm"><i class="fas fa-upload"></i> Upload</button><button id="nb" class="btn-s" style="margin:0"><i class="fas fa-plus"></i> New</button></span>' : ''}</div>
    <div class="px-3 fbar"><input id="sq" class="fld" placeholder="Search documents..."><select id="gf" class="fld" aria-label="Group"><option value="">All groups</option>${real.map((g) => `<option value="${esc(g._id)}" ${g._id === groupFilter ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div class="px-3 pills2" id="sf"><button data-s="" class="on">All</button><button data-s="created">Created here</button><button data-s="uploaded">Uploaded</button><button data-s="task">Task documents</button></div>
    <div class="tabs mt-1" id="dt"><button data-s="all" class="on">All</button><button data-s="shared">Shared</button><button data-s="mine">My Files</button></div>
    <div class="px-3 pb-3" id="dlist"></div></div>`;

  const row = (d) => `<div class="dl"><div class="fi ${esc(d.type)}"><i class="far ${ICON[d.type] || 'fa-file'}"></i></div>
    <div><div class="nm">${esc(d.title)}.${esc(d.type)}${d.source === 'uploaded' ? '<span class="sc-tag">Uploaded</span>' : ''}${d.task ? `<span class="sc-tag task">Task: ${esc(d.task.title)}</span>` : ''}</div>
    <small>${esc(d.groupId?.name)} · Version ${d.currentVersion} · ${d.updatedBy ? 'Modified by ' + esc(d.updatedBy.username) + ' · ' : ''}${ago(d.updatedAt)}</small></div>
    <div class="ac"><a href="?id=${esc(d._id)}">View</a>${d.canEdit && ['txt', 'md', 'docx'].includes(d.type) ? ` · <a href="?id=${esc(d._id)}&edit=1">Edit</a>` : ''}</div></div>`;

  const draw = async () => {
    try {
      const p = new URLSearchParams({ scope, q: term });
      if (groupFilter) p.set('groupId', groupFilter);
      if (taskFilter) p.set('taskId', taskFilter);
      else if (src === 'task') p.set('task', '1');
      else if (src) { p.set('source', src); p.set('task', '0'); }
      const docs = await api('/api/documents?' + p);
      if (!docs.length) return void ($('dlist').innerHTML = emptyState('No documents here.'));
      // separate sections: documents made in the app / uploaded files / documents that belong to a task
      const sections = [['Created in Safe WorkChat', (d) => !d.task && d.source !== 'uploaded'], ['Uploaded documents', (d) => !d.task && d.source === 'uploaded'], ['Task documents', (d) => !!d.task]];
      $('dlist').innerHTML = sections.map(([t, f]) => { const part = docs.filter(f); return part.length ? `<div class="small fw-bold text-muted mt-3 mb-1">${t} (${part.length})</div>${part.map(row).join('')}` : ''; }).join('');
    } catch (e) { $('dlist').textContent = e.message; }
  };
  $('sq').oninput = () => { term = $('sq').value; draw(); };
  $('gf').onchange = () => { groupFilter = $('gf').value; draw(); };
  document.querySelectorAll('#dt button').forEach((b) => b.onclick = () => { scope = b.dataset.s; document.querySelectorAll('#dt button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  document.querySelectorAll('#sf button').forEach((b) => b.onclick = () => { src = b.dataset.s; document.querySelectorAll('#sf button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });

  // ----- New / Upload dialog -----
  let mode = 'new';
  const fillTasks = () => {
    const gid = $('ng').value;
    const opts = taskChoices.filter((t) => t.groupId?._id === gid);
    $('ntask').innerHTML = (manages(gid) ? '<option value="">None (group document)</option>' : '') + opts.map((t) => `<option value="${esc(t._id)}">${esc(t.title)} (assigned to ${esc(t.assignedTo?.username)})</option>`).join('');
  };
  const openDialog = (m, preTask) => {
    mode = m; $('mTitle').textContent = m === 'up' ? 'Upload an existing document' : 'New Document';
    $('newOnly').hidden = m === 'up'; $('upOnly').hidden = m !== 'up'; $('nc').textContent = m === 'up' ? 'Upload' : 'Create';
    $('ng').innerHTML = addGroups.map((g) => `<option value="${esc(g._id)}">${esc(g.name)}</option>`).join('');
    const pt = preTask && taskChoices.find((t) => t._id === preTask);
    if (pt) $('ng').value = pt.groupId._id; else if (groupFilter && addGroups.some((g) => g._id === groupFilter)) $('ng').value = groupFilter;
    fillTasks(); if (pt) $('ntask').value = pt._id;
    $('nt').value = ''; $('nf').value = ''; $('nerr').textContent = '';
    bootstrap.Modal.getOrCreateInstance($('newDoc')).show();
  };
  $('ng').onchange = fillTasks;
  if ($('nb')) $('nb').onclick = () => openDialog('new');
  if ($('ub')) $('ub').onclick = () => openDialog('up');
  $('nc').onclick = async () => {
    $('nerr').textContent = '';
    try {
      let d;
      if (mode === 'up') {
        if (!$('nf').files[0]) return void ($('nerr').textContent = 'Choose a file first');
        const fd = new FormData(); fd.append('groupId', $('ng').value); if ($('ntask').value) fd.append('taskId', $('ntask').value); if ($('nt').value.trim()) fd.append('title', $('nt').value.trim()); fd.append('file', $('nf').files[0]);
        d = await sendForm('/api/documents/upload', 'POST', fd);
      } else d = await api('/api/documents', 'POST', { groupId: $('ng').value, title: $('nt').value, type: $('ny').value, ...($('ntask').value ? { taskId: $('ntask').value } : {}) });
      location.href = `?id=${d._id}${['txt', 'md', 'docx'].includes(d.type) ? '&edit=1' : ''}`;
    } catch (e) { $('nerr').textContent = e.message; }
  };
  draw();
  if (q.get('new') && addGroups.length) openDialog(q.get('new') === 'upload' ? 'up' : 'new', taskFilter);
}

// ---------- Document viewer / editor + version history ----------
async function editor(id) {
  let doc = await api('/api/documents/' + id);
  const text = doc.kind === 'text';
  let editing = !!q.get('edit') && doc.canEdit && text;
  const banner = doc.task ? `<div class="note"><i class="fas fa-tasks me-1"></i>Task document for “${esc(doc.task.title)}”. ${doc.canEdit ? 'You are the assignee, so you can edit and update it.' : 'Only the person this task is assigned to can edit or update it. You can view and download it.'}</div>` : '';
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><a class="back" href="?"><i class="fas fa-chevron-left"></i></a>
    <div><b>${esc(doc.title)}.${esc(doc.type)}</b><small class="d-block text-muted" id="meta"></small></div>
    <div class="ms-auto d-flex gap-2 align-items-center">
      ${text ? `<div class="dropdown"><button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-label="Download"><i class="fas fa-download"></i></button>
      <ul class="dropdown-menu"><li><a class="dropdown-item" data-x="docx" href="#">.docx</a></li><li><a class="dropdown-item" data-x="md" href="#">.md</a></li><li><a class="dropdown-item" data-x="txt" href="#">.txt</a></li></ul></div>`
        : '<button id="dlf" class="btn btn-outline-secondary btn-sm"><i class="fas fa-download"></i> Download</button>'}
      ${doc.canEdit ? (text ? '<button id="tg" class="btn btn-outline-success btn-sm"></button><button id="sv" class="btn-s" style="margin:0;padding:6px 16px">Save</button>'
        : '<label class="btn btn-outline-success btn-sm mb-0"><i class="fas fa-sync-alt"></i> Replace file<input id="rf" type="file" hidden></label>') : '<span class="tag" style="background:#eef2f4">View only</span>'}</div></div>
    ${banner}<div id="msg" class="small mb-2"></div>
    <div class="ed"><div id="body">${text ? '<div><div id="qe"></div></div>' : '<div id="pv">Loading preview…</div>'}</div><div class="vh"><b class="small">Version History</b><div id="vl" class="mt-2 small text-muted">Loading…</div></div></div></div>`;
  const say = (t, cls = 'text-success') => { $('msg').className = 'small mb-2 ' + cls; $('msg').textContent = t; };
  const meta = () => $('meta').textContent = `Version ${doc.currentVersion} · ${doc.groupId?.name || ''}${doc.updatedBy ? ' · modified by ' + doc.updatedBy.username + ' on ' + stamp(doc.updatedAt) : ''}${doc.source === 'uploaded' ? ' · uploaded' : ''}`;
  meta();

  let quill = null, pvUrl = null;
  if (text) {
    const fmts = doc.type === 'txt' ? [] : [['bold', 'italic', 'underline'], [{ header: [1, 2, 3, false] }], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote']];
    quill = new Quill('#qe', { theme: 'snow', modules: { toolbar: fmts.length ? fmts : false }, formats: doc.type === 'txt' ? [] : ['bold', 'italic', 'underline', 'header', 'list', 'blockquote'], readOnly: !editing });
    quill.setContents({ ops: doc.ops });
    const syncMode = () => { quill.enable(editing); if ($('tg')) $('tg').textContent = editing ? 'Stop editing' : 'Edit'; if ($('sv')) $('sv').style.display = editing ? '' : 'none'; };
    if ($('tg')) $('tg').onclick = () => { editing = !editing; syncMode(); };
    syncMode();
    if ($('sv')) $('sv').onclick = async () => {
      try { const r = await api('/api/documents/' + id, 'PUT', { ops: quill.getContents().ops, baseVersion: doc.currentVersion }); doc.currentVersion = r.currentVersion; doc.updatedBy = { username: me.username }; doc.updatedAt = new Date().toISOString(); meta(); say(`Saved to this document as version ${r.currentVersion}.`); loadVersions(); }
      catch (er) { say(er.message, 'text-danger'); }
    };
    document.querySelectorAll('[data-x]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); try { saveBlob(await blobOf(`/api/documents/${id}/export?format=${a.dataset.x}`), `${doc.title}.${a.dataset.x}`); } catch (er) { say(er.message, 'text-danger'); } });
  } else {
    // PDFs and images: preview only. They are never shown as editable text.
    (async () => {
      try {
        if (doc.kind === 'binary') { $('pv').innerHTML = '<div class="note mb-0">There is no in-browser preview for this file type. Download it to open it; use “Replace file” to upload a newer copy.</div>'; return; }
        pvUrl = URL.createObjectURL(await blobOf(`/api/documents/${id}/file?inline=1`));
        $('pv').innerHTML = doc.kind === 'image' ? '<img class="pvimg" alt="">' : '<iframe class="pv" title="PDF preview"></iframe>';
        $('pv').firstChild.src = pvUrl; if (doc.kind === 'image') $('pv').firstChild.alt = doc.title;
      } catch (e) { $('pv').textContent = e.message; }
    })();
    if ($('dlf')) $('dlf').onclick = async () => { try { saveBlob(await blobOf(`/api/documents/${id}/file`), doc.file?.originalName || doc.title + '.' + doc.type); } catch (e) { say(e.message, 'text-danger'); } };
    if ($('rf')) $('rf').onchange = async () => {
      const fd = new FormData(); fd.append('baseVersion', doc.currentVersion); fd.append('file', $('rf').files[0]);
      try { say('Uploading…', 'text-muted'); await sendForm(`/api/documents/${id}/file`, 'PUT', fd); location.reload(); } catch (e) { say(e.message, 'text-danger'); $('rf').value = ''; }
    };
  }

  const loadVersions = async () => {
    const vs = await api(`/api/documents/${id}/versions`);
    $('vl').innerHTML = vs.map((v) => { const cur = v.version === doc.currentVersion;
      return `<div class="v ${cur ? 'cur' : ''}"><b>Version ${v.version}${cur ? ' (Current)' : ''}</b>
      <small>${stamp(v.createdAt)}</small><small>${esc(v.savedBy?.username)}${v.note ? ' · ' + esc(v.note) : ''}${v.file ? ' · ' + esc(v.file.originalName) + ' (' + sz(v.file.size || 0) + ')' : ''}</small>
      ${text && !cur ? `<a href="#" data-p="${v.version}">Preview</a>` : ''}${v.file ? `<a href="#" data-f="${v.version}" data-n="${esc(v.file.originalName)}">Download file</a>` : ''}${!cur && doc.canEdit ? `<a href="#" data-r="${v.version}">Restore</a>` : ''}</div>`; }).join('');
    $('vl').querySelectorAll('[data-p]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); const v = await api(`/api/documents/${id}/versions/${a.dataset.p}`); quill.setContents({ ops: v.ops }); quill.enable(false); say(`Previewing version ${v.version} (not saved). Reload to return to the current version.`, 'text-warning'); });
    $('vl').querySelectorAll('[data-f]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); try { saveBlob(await blobOf(`/api/documents/${id}/file?version=${a.dataset.f}`), a.dataset.n); } catch (er) { say(er.message, 'text-danger'); } });
    $('vl').querySelectorAll('[data-r]').forEach((a) => a.onclick = async (e) => {
      e.preventDefault();
      if (!confirm(`Restore version ${a.dataset.r}? This creates a new version; history is kept.`)) return;
      try { await api(`/api/documents/${id}/restore/${a.dataset.r}`, 'POST'); location.reload(); } catch (er) { say(er.message, 'text-danger'); }
    });
  };
  loadVersions().catch((e) => { $('vl').textContent = e.message; });
}

(async () => { try { q.get('id') ? await editor(q.get('id')) : await list(); } catch (e) { view.innerHTML = `<div class="cd text-danger">${esc(e.message)}</div>`; } })();
