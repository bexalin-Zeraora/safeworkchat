const { Document: DocxDocument, Packer, Paragraph, TextRun } = require('docx');
const mammoth = require('mammoth');
const Doc = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const GroupMember = require('../models/GroupMember');
const Task = require('../models/Task');
const storage = require('../utils_storage');
const { validate, DOCUMENT_EXTS, PREVIEW_EXTS } = require('../utils_filetype');
const { postSystemMessage, notifyUser } = require('../utils_notify');

const SUB = 'documents';
const TYPES = ['txt', 'md', 'docx'];                 // types that can be created from scratch
const MAX_OPS_BYTES = 800 * 1024;
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const manage = (m) => m && (m.role === 'Admin' || m.role === 'Manager');
const member = (groupId, userId) => GroupMember.findOne({ groupId, userId });
const err = (res, e) => { console.error(e); res.status(500).json({ message: 'Server error' }); };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TASK_VIEW_MSG = 'This is a task document: only the person the task is assigned to and group Admins / Managers can open it';

// extension -> how the app treats it
function classify(ext) {
  if (['txt', 'md', 'docx'].includes(ext)) return { type: ext, kind: 'text' };
  if (ext === 'pdf') return { type: 'pdf', kind: 'pdf' };
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return { type: ext === 'jpeg' ? 'jpg' : ext, kind: 'image' };
  return { type: 'doc', kind: 'binary' };
}

// What a person may do with a document.
//  - ordinary group document : everyone in the group can view; Admins / Managers edit (the existing rule)
//  - task document (taskId)   : ONLY the person the task is assigned to can edit or update it; they and Admins / Managers can view
async function access(doc, m, userId) {
  if (!doc.taskId) return { canView: true, canEdit: !!manage(m), task: null };
  const task = await Task.findById(doc.taskId).select('title assignedTo createdBy groupId');
  if (!task) return { canView: true, canEdit: !!manage(m), task: null };
  const assignee = String(task.assignedTo) === String(userId);
  return { canView: assignee || !!manage(m), canEdit: assignee, task };
}

const pub = (d) => { const o = d.toObject ? d.toObject() : { ...d }; if (o.file) delete o.file.storedName; return o; };
const pubVersion = (v) => { const o = v.toObject ? v.toObject() : { ...v }; if (o.file) delete o.file.storedName; return o; };

const textToOps = (text) => { const t = String(text).replace(/\r\n?/g, '\n'); return [{ insert: t.endsWith('\n') ? t : t + '\n' }]; };

// Only plain-text inserts (with formatting attributes) are accepted: no embeds / images
function cleanOps(ops) {
  if (!Array.isArray(ops) || !ops.length) return null;
  if (Buffer.byteLength(JSON.stringify(ops)) > MAX_OPS_BYTES) return null;
  const out = [];
  for (const op of ops) {
    if (!op || typeof op.insert !== 'string') return null;
    const clean = { insert: op.insert };
    if (op.attributes && typeof op.attributes === 'object') {
      const a = {};
      for (const k of ['bold', 'italic', 'underline', 'strike', 'header', 'list', 'blockquote', 'code-block', 'indent']) {
        if (op.attributes[k] !== undefined && ['boolean', 'number', 'string'].includes(typeof op.attributes[k])) a[k] = op.attributes[k];
      }
      if (Object.keys(a).length) clean.attributes = a;
    }
    out.push(clean);
  }
  return out;
}

const plain = (ops) => ops.map((o) => o.insert).join('');

function toMarkdown(ops) {
  // line-based conversion: formatting of a line lives on its trailing "\n" op
  let line = [], out = [], listN = 0;
  const flush = (attrs) => {
    let t = line.join('');
    line = [];
    if (attrs.header) t = '#'.repeat(Math.min(attrs.header, 6)) + ' ' + t;
    else if (attrs.list === 'bullet') t = '- ' + t;
    else if (attrs.list === 'ordered') t = `${++listN}. ` + t;
    else if (attrs.blockquote) t = '> ' + t;
    if (attrs.list !== 'ordered') listN = 0;
    out.push(t);
  };
  for (const op of ops) {
    const parts = op.insert.split('\n');
    parts.forEach((p, i) => {
      if (p) {
        const a = op.attributes || {};
        let s = p;
        if (a.bold) s = `**${s}**`;
        if (a.italic) s = `*${s}*`;
        if (a.strike) s = `~~${s}~~`;
        line.push(s);
      }
      if (i < parts.length - 1) flush(op.insert === '\n' ? (op.attributes || {}) : {});
    });
  }
  if (line.length) flush({});
  return out.join('\n');
}


// GET /api/documents?scope=all|shared|mine&q=&groupId=&source=created|uploaded&task=1|0&taskId=
exports.list = async (req, res) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user._id });
    const roles = Object.fromEntries(memberships.map((m) => [String(m.groupId), m]));
    let groupIds = memberships.map((m) => m.groupId);
    if (req.query.groupId !== undefined) {
      if (!isId(req.query.groupId) || !roles[req.query.groupId]) return res.status(403).json({ message: 'Not a member of this group' });
      groupIds = [req.query.groupId];
    }
    const filter = { groupId: { $in: groupIds } };
    if (req.query.scope === 'mine') filter.createdBy = req.user._id;
    if (req.query.scope === 'shared') filter.createdBy = { $ne: req.user._id };
    if (['created', 'uploaded'].includes(req.query.source)) filter.source = req.query.source;
    if (req.query.taskId !== undefined) { if (!isId(req.query.taskId)) return res.status(400).json({ message: 'Invalid task' }); filter.taskId = req.query.taskId; }
    else if (req.query.task === '1') filter.taskId = { $exists: true, $ne: null };
    else if (req.query.task === '0') filter.taskId = { $in: [null] };
    if (typeof req.query.q === 'string' && req.query.q.trim()) filter.title = new RegExp(escRe(req.query.q.trim().slice(0, 40)), 'i');

    const docs = await Doc.find(filter).select('-ops').sort({ updatedAt: -1 }).limit(200)
      .populate('groupId', 'name').populate('updatedBy', 'username').populate('createdBy', 'username');
    const taskIds = [...new Set(docs.filter((d) => d.taskId).map((d) => String(d.taskId)))];
    const tasks = taskIds.length ? await Task.find({ _id: { $in: taskIds } }).select('title assignedTo').populate('assignedTo', 'username') : [];
    const taskById = Object.fromEntries(tasks.map((t) => [String(t._id), t]));

    const out = [];
    for (const d of docs) {
      const m = roles[String(d.groupId._id)], t = d.taskId && taskById[String(d.taskId)];
      let canView = true, canEdit = !!manage(m);
      if (t) { const a = String(t.assignedTo._id) === String(req.user._id); canView = a || !!manage(m); canEdit = a; }
      if (!canView) continue;                       // someone else's task document is not listed
      out.push({ ...pub(d), canEdit, task: t ? { _id: t._id, title: t.title, assignedTo: t.assignedTo.username } : null });
    }
    res.json(out);
  } catch (e) { err(res, e); }
};

// who may add a document to a group, or to one of its tasks
async function mayAdd(req, res, groupId, taskId) {
  if (!isId(String(groupId))) { res.status(400).json({ message: 'groupId is required' }); return null; }
  const m = await member(groupId, req.user._id);
  if (!m) { res.status(403).json({ message: 'Not a member of this group' }); return null; }
  if (taskId !== undefined && taskId !== '' && taskId !== null) {
    if (!isId(String(taskId))) { res.status(400).json({ message: 'Invalid task' }); return null; }
    const task = await Task.findOne({ _id: taskId, groupId }).select('title assignedTo createdBy');
    if (!task) { res.status(404).json({ message: 'Task not found in this group' }); return null; }
    if (!manage(m) && String(task.assignedTo) !== String(req.user._id)) { res.status(403).json({ message: 'Only the assignee or a group Admin / Manager can add a document to this task' }); return null; }
    return { m, task };
  }
  if (!manage(m)) { res.status(403).json({ message: 'Only group Admins or Managers can add documents to a group' }); return null; }
  return { m, task: null };
}

// tell the task's creator when the assignee adds a document (task documents are not announced in the group chat)
async function announce(req, doc, task, verb) {
  const io = req.app.get('io');
  if (!task) {
    return postSystemMessage(io, doc.groupId, req.user._id, `📄 ${req.user.username} ${verb} the document “${doc.title}.${doc.type}”.`, `/pages/documents.html?id=${doc._id}`);
  }
  if (task.createdBy && String(task.createdBy) !== String(req.user._id)) {
    await notifyUser(io, { userId: task.createdBy, type: 'task_update', title: 'Task document', body: `${req.user.username} ${verb} “${doc.title}.${doc.type}” for “${task.title}”.`, link: `/pages/documents.html?id=${doc._id}`, taskId: task._id, groupId: doc.groupId });
  }
}

// POST /api/documents  { groupId, title, type, taskId? }  - create a new empty document
exports.create = async (req, res) => {
  try {
    const { groupId, title, type, taskId } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) return res.status(400).json({ message: 'groupId and a title (up to 120 characters) are required' });
    const ok = await mayAdd(req, res, groupId, taskId); if (!ok) return;
    const doc = await Doc.create({ groupId, title: title.trim(), type: TYPES.includes(type) ? type : 'docx', kind: 'text', source: 'created', taskId: ok.task ? ok.task._id : undefined, createdBy: req.user._id, updatedBy: req.user._id });
    await DocumentVersion.create({ documentId: doc._id, version: 1, ops: doc.ops, savedBy: req.user._id, note: 'Created' });
    await announce(req, doc, ok.task, 'created');
    res.status(201).json(pub(doc));
  } catch (e) { err(res, e); }
};

// POST /api/documents/upload   multipart: groupId, title?, taskId?, file
//   txt / md / docx -> opened in the editor (the original file is kept as version 1)
//   pdf / images / doc -> stored; preview + replace (no pretend text editing)
exports.upload = async (req, res) => {
  try {
    const { groupId, taskId } = req.body;
    const ok = await mayAdd(req, res, groupId, taskId); if (!ok) return;
    const v = validate(req.file, DOCUMENT_EXTS);
    if (!v.ok) return res.status(400).json({ message: v.message });
    const cls = classify(v.ext);

    let ops = [{ insert: '\n' }];
    if (cls.kind === 'text') {
      let text;
      try { text = v.ext === 'docx' ? (await mammoth.extractRawText({ buffer: req.file.buffer })).value.replace(/\n{2,}/g, '\n') : req.file.buffer.toString('utf8'); }
      catch (e) { return res.status(400).json({ message: 'Could not read this Word file. It may be damaged or password-protected.' }); }
      ops = textToOps(text);
      if (Buffer.byteLength(JSON.stringify(ops)) > MAX_OPS_BYTES) return res.status(413).json({ message: 'This document has too much text to edit here (max 800 KB of text).' });
    }
    const originalName = storage.cleanName(req.file.originalname);
    const storedName = await storage.saveBuffer(SUB, req.file.buffer, v.ext === 'jpeg' ? 'jpg' : v.ext);
    const file = { storedName, originalName, mimeType: v.mime, size: req.file.size };
    try {
      const title = (typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : originalName.replace(/\.[^.]+$/, '')).slice(0, 120) || 'Untitled';
      const doc = await Doc.create({ groupId, title, type: cls.type, kind: cls.kind, source: 'uploaded', taskId: ok.task ? ok.task._id : undefined, createdBy: req.user._id, updatedBy: req.user._id, ops, ...(cls.kind === 'text' ? {} : { file }) });
      await DocumentVersion.create({ documentId: doc._id, version: 1, ops: cls.kind === 'text' ? ops : [], file, savedBy: req.user._id, note: `Uploaded ${originalName}`.slice(0, 100) });
      await announce(req, doc, ok.task, 'uploaded');
      res.status(201).json(pub(doc));
    } catch (e) { storage.remove(SUB, storedName); throw e; }
  } catch (e) { err(res, e); }
};

async function load(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ message: 'Document not found' }); return null; }
  const doc = await Doc.findById(req.params.id).populate('groupId', 'name').populate('updatedBy', 'username').populate('createdBy', 'username');
  if (!doc) { res.status(404).json({ message: 'Document not found' }); return null; }
  const m = await member(doc.groupId._id, req.user._id);
  if (!m) { res.status(403).json({ message: 'Not a member of this group' }); return null; }
  const a = await access(doc, m, req.user._id);
  if (!a.canView) { res.status(403).json({ message: TASK_VIEW_MSG }); return null; }
  return { doc, m, canEdit: a.canEdit, task: a.task };
}
const denyEdit = (res, c) => res.status(403).json({ message: c.task ? 'Only the person this task is assigned to can edit or update this document' : 'You have view-only access' });

// POST /api/documents/:id/share  -> puts a link to the document in the group chat (any member; never for task documents)
exports.share = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (c.doc.taskId) return res.status(400).json({ message: 'Task documents are not shared in the group chat' });
    await postSystemMessage(req.app.get('io'), c.doc.groupId._id, req.user._id, `📎 ${req.user.username} shared the document “${c.doc.title}.${c.doc.type}”.`, `/pages/documents.html?id=${c.doc._id}`);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
};

exports.get = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    res.json({ ...pub(c.doc), canEdit: c.canEdit, task: c.task ? { _id: c.task._id, title: c.task.title } : null });
  } catch (e) { err(res, e); }
};

// PUT /api/documents/:id  { ops, baseVersion, note? }  - saves into the SAME document as a new version
exports.save = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!c.canEdit) return denyEdit(res, c);
    if (c.doc.kind !== 'text') return res.status(400).json({ message: 'This file cannot be edited as text. Use "Replace file" instead.' });
    const ops = cleanOps(req.body.ops);
    if (!ops) return res.status(400).json({ message: 'Invalid or too large content (text only, max 800 KB)' });
    const base = Number(req.body.baseVersion);
    // atomic: only succeeds if nobody saved in between
    const updated = await Doc.findOneAndUpdate({ _id: c.doc._id, currentVersion: base }, { $set: { ops, updatedBy: req.user._id }, $inc: { currentVersion: 1 } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'Someone saved a newer version. Reload to see it.', currentVersion: c.doc.currentVersion });
    await DocumentVersion.create({ documentId: c.doc._id, version: updated.currentVersion, ops, savedBy: req.user._id, note: String(req.body.note || '').slice(0, 100) });
    res.json({ currentVersion: updated.currentVersion });
  } catch (e) { err(res, e); }
};

// PUT /api/documents/:id/file   multipart: file, baseVersion   - replace a PDF / image / doc with a new file (new version)
exports.replaceFile = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!c.canEdit) return denyEdit(res, c);
    if (c.doc.kind === 'text') return res.status(400).json({ message: 'Text documents are edited in the editor.' });
    const v = validate(req.file, DOCUMENT_EXTS);
    if (!v.ok) return res.status(400).json({ message: v.message });
    const cls = classify(v.ext);
    if (cls.kind !== c.doc.kind) return res.status(400).json({ message: `Upload a replacement of the same kind (${c.doc.kind === 'pdf' ? 'PDF' : c.doc.kind === 'image' ? 'image' : 'DOC'}).` });
    const base = Number(req.body.baseVersion);
    if (base !== c.doc.currentVersion) return res.status(409).json({ message: 'Someone saved a newer version. Reload to see it.', currentVersion: c.doc.currentVersion });

    const originalName = storage.cleanName(req.file.originalname);
    const storedName = await storage.saveBuffer(SUB, req.file.buffer, v.ext === 'jpeg' ? 'jpg' : v.ext);
    const file = { storedName, originalName, mimeType: v.mime, size: req.file.size };
    const updated = await Doc.findOneAndUpdate({ _id: c.doc._id, currentVersion: base }, { $set: { file, type: cls.type, updatedBy: req.user._id }, $inc: { currentVersion: 1 } }, { new: true });
    if (!updated) { storage.remove(SUB, storedName); return res.status(409).json({ message: 'Someone saved a newer version. Reload to see it.' }); }
    await DocumentVersion.create({ documentId: c.doc._id, version: updated.currentVersion, ops: [], file, savedBy: req.user._id, note: String(req.body.note || `Replaced with ${originalName}`).slice(0, 100) });
    res.json({ currentVersion: updated.currentVersion });
  } catch (e) { err(res, e); }
};

// the stored file of a document: the current one, or the file of a given version
async function serveFile(req, res, c, version, inline) {
  let f = c.doc.file;
  if (version !== undefined) {
    const ver = await DocumentVersion.findOne({ documentId: c.doc._id, version: Number(version) });
    f = ver && ver.file;
  }
  const full = f && f.storedName && storage.resolveStored(SUB, f.storedName);
  if (!full) return res.status(404).json({ message: 'No file for this document' });
  const ext = f.storedName.split('.').pop();
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  if (inline && ['pdf', 'png', 'jpg', 'webp'].includes(ext)) {
    res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" });
    return res.sendFile(full, (e) => { if (e && !res.headersSent) res.status(404).json({ message: 'File is missing on the server' }); });
  }
  res.download(full, f.originalName || 'document', (e) => { if (e && !res.headersSent) res.status(404).json({ message: 'File is missing on the server' }); });
}

// GET /api/documents/:id/file?version=N&inline=1
exports.file = async (req, res) => {
  try { const c = await load(req, res); if (c) await serveFile(req, res, c, req.query.version, req.query.inline === '1'); }
  catch (e) { err(res, e); }
};

exports.versions = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    const v = await DocumentVersion.find({ documentId: c.doc._id }).select('-ops').sort({ version: -1 }).limit(100).populate('savedBy', 'username');
    res.json(v.map(pubVersion));
  } catch (e) { err(res, e); }
};

exports.getVersion = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    const v = await DocumentVersion.findOne({ documentId: c.doc._id, version: Number(req.params.v) });
    if (!v) return res.status(404).json({ message: 'Version not found' });
    res.json(pubVersion(v));
  } catch (e) { err(res, e); }
};

// POST /api/documents/:id/restore/:v  -> a NEW version containing the old content (history is never rewritten)
exports.restore = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!c.canEdit) return denyEdit(res, c);
    const old = await DocumentVersion.findOne({ documentId: c.doc._id, version: Number(req.params.v) });
    if (!old) return res.status(404).json({ message: 'Version not found' });
    const set = { updatedBy: req.user._id };
    if (c.doc.kind === 'text') set.ops = old.ops;
    else if (old.file && old.file.storedName) { set.file = old.file.toObject ? old.file.toObject() : old.file; set.type = classify((old.file.storedName.split('.').pop())).type; }
    else return res.status(400).json({ message: 'That version has no file to restore' });
    const updated = await Doc.findOneAndUpdate({ _id: c.doc._id, currentVersion: c.doc.currentVersion }, { $set: set, $inc: { currentVersion: 1 } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'Someone saved a newer version. Reload and try again.' });
    await DocumentVersion.create({ documentId: c.doc._id, version: updated.currentVersion, ops: c.doc.kind === 'text' ? old.ops : [], file: c.doc.kind === 'text' ? undefined : set.file, savedBy: req.user._id, note: `Restored from version ${old.version}` });
    res.json({ currentVersion: updated.currentVersion });
  } catch (e) { err(res, e); }
};

exports.exportDoc = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (c.doc.kind !== 'text') return serveFile(req, res, c, undefined, false);
    const ops = c.doc.ops;
    const name = c.doc.title.replace(/[^\w\- ]+/g, '').trim() || 'document';
    const fmt = ['txt', 'md', 'docx'].includes(req.query.format) ? req.query.format : c.doc.type;
    if (fmt === 'txt') { res.type('text/plain').attachment(`${name}.txt`).send(plain(ops)); return; }
    if (fmt === 'md') { res.type('text/markdown').attachment(`${name}.md`).send(toMarkdown(ops)); return; }
    const lines = plain(ops).split('\n');
    const file = new DocxDocument({ sections: [{ children: lines.map((l) => new Paragraph({ children: [new TextRun(l)] })) }] });
    const buf = await Packer.toBuffer(file);
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment(`${name}.docx`).send(buf);
  } catch (e) { err(res, e); }
};

// exported only so the test-suite can check the permission rules without a database
exports._test = { access, classify, textToOps, cleanOps };
