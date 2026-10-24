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
const view = $('view');
const q = new URLSearchParams(location.search);
const ICON = { docx: 'fa-file-word', md: 'fa-file-code', txt: 'fa-file-alt' };
const ago = (d) => { const m = Math.max(0, (Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${Math.floor(m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} hours ago` : `${Math.floor(m / 1440)} days ago`; };

// ---------- Screen 9: Documents ----------
async function list() {
  let scope = 'all', term = '';
  const groups = await api('/api/groups/my-groups');
  const manageable = groups.filter((g) => g.myRole === 'Admin' || g.myRole === 'Manager');
  view.innerHTML = `<div class="cd" style="padding:0"><div class="d-flex align-items-center p-3"><b><i class="far fa-folder-open me-2"></i>Documents</b>
    ${manageable.length ? '<button id="nb" class="btn-s ms-auto"><i class="fas fa-plus"></i> New</button>' : ''}</div>
    <div class="px-3"><input id="sq" class="fld" placeholder="Search documents..."></div>
    <div class="tabs mt-2" id="dt"><button data-s="all" class="on">All</button><button data-s="shared">Shared</button><button data-s="mine">My Files</button></div>
    <div class="px-3 pb-3" id="dlist"></div></div>`;
  const draw = async () => {
    try {
      const docs = await api(`/api/documents?scope=${scope}&q=${encodeURIComponent(term)}`);
      $('dlist').innerHTML = docs.length ? docs.map((d) => `<div class="dl"><div class="fi ${esc(d.type)}"><i class="far ${ICON[d.type] || 'fa-file'}"></i></div>
        <div><div class="nm">${esc(d.title)}.${esc(d.type)}</div><small>${esc(d.groupId?.name)} · Version ${d.currentVersion} · Edited ${ago(d.updatedAt)}</small></div>
        <div class="ac"><a href="?id=${esc(d._id)}">View</a>${d.canEdit ? ` · <a href="?id=${esc(d._id)}&edit=1">Edit</a>` : ''}</div></div>`).join('') : emptyState('No documents here.');
    } catch (e) { $('dlist').textContent = e.message; }
  };
  $('sq').oninput = () => { term = $('sq').value; draw(); };
  document.querySelectorAll('#dt button').forEach((b) => b.onclick = () => { scope = b.dataset.s; document.querySelectorAll('#dt button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  if ($('nb')) $('nb').onclick = () => {
    $('ng').innerHTML = manageable.map((g) => `<option value="${esc(g._id)}">${esc(g.name)}</option>`).join('');
    $('nerr').textContent = ''; bootstrap.Modal.getOrCreateInstance($('newDoc')).show();
  };
  $('nc').onclick = async () => {
    try {
      const d = await api('/api/documents', 'POST', { groupId: $('ng').value, title: $('nt').value, type: $('ny').value });
      location.href = `?id=${d._id}&edit=1`;
    } catch (e) { $('nerr').textContent = e.message; }
  };
  draw();
}

// ---------- Screen 10: Document Editor + Version History ----------
async function editor(id) {
  let doc = await api('/api/documents/' + id);
  let editing = !!q.get('edit') && doc.canEdit;
  view.innerHTML = `<div class="cd"><div class="d-flex align-items-center gap-2 mb-3"><a class="back" href="?"><i class="fas fa-chevron-left"></i></a>
    <div><b>${esc(doc.title)}.${esc(doc.type)}</b><small class="d-block text-muted" id="meta"></small></div>
    <div class="ms-auto d-flex gap-2 align-items-center"><div class="dropdown"><button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="fas fa-download"></i></button>
      <ul class="dropdown-menu"><li><a class="dropdown-item" data-x="docx" href="#">.docx</a></li><li><a class="dropdown-item" data-x="md" href="#">.md</a></li><li><a class="dropdown-item" data-x="txt" href="#">.txt</a></li></ul></div>
      ${doc.canEdit ? '<button id="tg" class="btn btn-outline-success btn-sm"></button><button id="sv" class="btn-s" style="margin:0;padding:6px 16px">Save</button>' : '<span class="tag" style="background:#eef2f4">View only</span>'}</div></div>
    <div id="msg" class="small mb-2"></div>
    <div class="ed"><div><div id="tb"></div><div id="qe"></div></div><div class="vh"><b class="small">Version History</b><div id="vl" class="mt-2 small text-muted">Loading…</div></div></div></div>`;
  const fmts = doc.type === 'txt' ? [] : [['bold', 'italic', 'underline'], [{ header: [1, 2, 3, false] }], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote']];
  $('tb').remove();
  const quill = new Quill('#qe', { theme: 'snow', modules: { toolbar: fmts.length ? fmts : false }, formats: doc.type === 'txt' ? [] : ['bold', 'italic', 'underline', 'header', 'list', 'blockquote'], readOnly: !editing });
  quill.setContents({ ops: doc.ops });
  const meta = () => $('meta').textContent = `Version ${doc.currentVersion} · ${doc.groupId?.name || ''}${doc.updatedBy ? ' · last saved by ' + doc.updatedBy.username : ''}`;
  meta();
  const say = (t, cls = 'text-success') => { $('msg').className = 'small mb-2 ' + cls; $('msg').textContent = t; };
  const syncMode = () => { quill.enable(editing); if ($('tg')) $('tg').textContent = editing ? 'Stop editing' : 'Edit'; if ($('sv')) $('sv').style.display = editing ? '' : 'none'; };
  if ($('tg')) $('tg').onclick = () => { editing = !editing; syncMode(); };
  syncMode();

  const loadVersions = async () => {
    const vs = await api(`/api/documents/${id}/versions`);
    $('vl').innerHTML = vs.map((v) => `<div class="v ${v.version === doc.currentVersion ? 'cur' : ''}"><b>Version ${v.version}${v.version === doc.currentVersion ? ' (Current)' : ''}</b>
      <small>${new Date(v.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><small>${esc(v.savedBy?.username)}${v.note ? ' · ' + esc(v.note) : ''}</small>
      ${v.version !== doc.currentVersion ? `<a href="#" data-p="${v.version}">Preview</a>${doc.canEdit ? `<a href="#" data-r="${v.version}">Restore</a>` : ''}` : ''}</div>`).join('');
    $('vl').querySelectorAll('[data-p]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); const v = await api(`/api/documents/${id}/versions/${a.dataset.p}`); quill.setContents({ ops: v.ops }); quill.enable(false); say(`Previewing version ${v.version} (not saved). Click "Stop editing"/reload to return.`, 'text-warning'); });
    $('vl').querySelectorAll('[data-r]').forEach((a) => a.onclick = async (e) => {
      e.preventDefault();
      if (!confirm(`Restore version ${a.dataset.r}? This creates a new version; history is kept.`)) return;
      try { await api(`/api/documents/${id}/restore/${a.dataset.r}`, 'POST'); doc = await api('/api/documents/' + id); quill.setContents({ ops: doc.ops }); syncMode(); meta(); say('Version restored.'); loadVersions(); }
      catch (er) { say(er.message, 'text-danger'); }
    });
  };
  if ($('sv')) $('sv').onclick = async () => {
    try {
      const r = await api('/api/documents/' + id, 'PUT', { ops: quill.getContents().ops, baseVersion: doc.currentVersion });
      doc.currentVersion = r.currentVersion; meta(); say(`Saved as version ${r.currentVersion}.`); loadVersions();
    } catch (er) { say(er.message, 'text-danger'); }
  };
  document.querySelectorAll('[data-x]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const r = await fetch(`/api/documents/${id}/export?format=${a.dataset.x}`, { headers: H });
    if (!r.ok) return say('Export failed', 'text-danger');
    const url = URL.createObjectURL(await r.blob()), l = document.createElement('a'); l.href = url; l.download = `${doc.title}.${a.dataset.x}`; l.click(); URL.revokeObjectURL(url);
  });
  loadVersions();
}

(async () => { try { q.get('id') ? await editor(q.get('id')) : await list(); } catch (e) { view.innerHTML = `<div class="cd text-danger">${esc(e.message)}</div>`; } })();
