const token = sess.get('token');
if (!token || !sess.get('user')) location.href = '/pages/login.html';
function logout() { sess.clear(); location.href = '/pages/login.html'; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const H = { Authorization: 'Bearer ' + token };
const sz = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.ceil(b / 1024)) + ' KB';
const when = (d) => new Date(d).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const ICON = { jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', webp: 'fa-file-image', pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', txt: 'fa-file-alt', md: 'fa-file-code', csv: 'fa-file-csv', xlsx: 'fa-file-excel', pptx: 'fa-file-powerpoint' };
let groupId = new URLSearchParams(location.search).get('groupId') || '';
let timer;

async function call(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (r.status === 401) return logout();
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Request failed');
  return r;
}
const say = (t, cls = 'text-success') => { $('msg').className = 'small mb-2 ' + cls; $('msg').textContent = t; };

async function load() {
  try {
    const p = new URLSearchParams({ groupId, q: $('q').value.trim(), type: $('kind').value, sort: $('sort').value });
    const files = await (await call('/api/files?' + p)).json();
    $('list').innerHTML = files.length ? files.map((f) => `<div class="frow"><div class="fi ${f.kind === 'image' ? 'image' : f.ext === 'pdf' ? 'pdf' : ''}"><i class="far ${ICON[f.ext] || 'fa-file'}"></i></div>
      <div><div class="nm">${esc(f.originalName)}</div><small>${esc(f.ext.toUpperCase())} · ${sz(f.size)} · ${esc(f.uploadedBy?.username || 'Unknown')} · ${when(f.createdAt)}</small></div>
      <div class="ac">${f.canPreview ? `<button data-pv="${esc(f._id)}"><i class="far fa-eye"></i> Preview</button>` : ''}<button data-dl="${esc(f._id)}"><i class="fas fa-download"></i></button>${f.canDelete ? `<button class="del" data-rm="${esc(f._id)}" aria-label="Delete"><i class="far fa-trash-alt"></i></button>` : ''}</div></div>`).join('')
      : '<div class="text-muted small py-3 text-center">No files here yet.</div>';
    const byId = Object.fromEntries(files.map((f) => [f._id, f]));
    document.querySelectorAll('[data-dl]').forEach((b) => b.onclick = () => download(byId[b.dataset.dl]));
    document.querySelectorAll('[data-pv]').forEach((b) => b.onclick = () => preview(byId[b.dataset.pv]));
    document.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      if (!confirm(`Delete “${byId[b.dataset.rm].originalName}”? This cannot be undone.`)) return;
      try { await call('/api/files/' + b.dataset.rm, { method: 'DELETE' }); say('File deleted.'); load(); } catch (e) { say(e.message, 'text-danger'); }
    });
  } catch (e) { $('list').innerHTML = `<div class="text-danger small">${esc(e.message)}</div>`; }
}

// files are fetched with the login token and shown from a temporary in-browser address (they are never public links)
async function download(f) {
  try {
    const blob = await (await call(`/api/files/${f._id}/download`)).blob();
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = f.originalName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { say(e.message, 'text-danger'); }
}
let pvUrl = null;
async function preview(f) {
  $('pvTitle').textContent = f.originalName; $('pvBody').textContent = 'Loading…';
  const modal = bootstrap.Modal.getOrCreateInstance($('pvModal')); modal.show();
  if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; }
  try {
    const r = await call(`/api/files/${f._id}/preview`);
    if (['txt', 'md', 'csv'].includes(f.ext)) { $('pvBody').innerHTML = '<pre class="pvtxt"></pre>'; $('pvBody').firstChild.textContent = await r.text(); return; }
    pvUrl = URL.createObjectURL(await r.blob());
    $('pvBody').innerHTML = f.kind === 'image' ? '<img class="pvimg" alt="">' : '<iframe class="pv" title="Preview"></iframe>';
    $('pvBody').firstChild.src = pvUrl;
    $('pvBody').firstChild.alt = f.originalName;
  } catch (e) { $('pvBody').textContent = e.message; }
}
$('pvModal').addEventListener('hidden.bs.modal', () => { $('pvBody').innerHTML = ''; if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } });

async function upload(file) {
  if (!file) return;
  const fd = new FormData(); fd.append('groupId', groupId); fd.append('file', file);   // groupId first, then the file
  say(`Uploading ${file.name}…`, 'text-muted');
  try { await call('/api/files', { method: 'POST', body: fd }); say('Uploaded.'); $('pick').value = ''; load(); }
  catch (e) { say(e.message, 'text-danger'); }
}
$('pick').onchange = () => upload($('pick').files[0]);
['dragover', 'dragenter'].forEach((ev) => $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', (e) => upload(e.dataTransfer.files[0]));
$('q').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
$('kind').onchange = $('sort').onchange = load;
$('grp').onchange = () => { groupId = $('grp').value; history.replaceState(null, '', '?groupId=' + groupId); load(); };

(async () => {
  try {
    const groups = (await (await call('/api/groups/my-groups')).json()).filter((g) => !g.isDirect);
    if (!groups.length) { $('list').innerHTML = '<div class="text-muted small">You are not in any group yet. <a href="/pages/groups.html">Create one</a>.</div>'; $('drop').hidden = true; return; }
    $('grp').innerHTML = groups.map((g) => `<option value="${esc(g._id)}">${esc(g.name)}</option>`).join('');
    if (!groups.some((g) => g._id === groupId)) groupId = groups[0]._id;
    $('grp').value = groupId; load();
  } catch (e) { $('list').textContent = e.message; }
})();
