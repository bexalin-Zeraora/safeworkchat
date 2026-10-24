const { Document: DocxDocument, Packer, Paragraph, TextRun } = require('docx');
const Doc = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const GroupMember = require('../models/GroupMember');

const TYPES = ['txt', 'md', 'docx'];
const MAX_OPS_BYTES = 800 * 1024;
const manage = (m) => m && (m.role === 'Admin' || m.role === 'Manager');
const member = (groupId, userId) => GroupMember.findOne({ groupId, userId });
const err = (res, e) => res.status(500).json({ message: 'Server error', error: e.message });

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

// GET /api/documents?scope=all|shared|mine&q=
exports.list = async (req, res) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user._id });
    const filter = { groupId: { $in: memberships.map((m) => m.groupId) } };
    if (req.query.scope === 'mine') filter.createdBy = req.user._id;
    if (req.query.scope === 'shared') filter.createdBy = { $ne: req.user._id };
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      filter.title = new RegExp(req.query.q.trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const docs = await Doc.find(filter).select('-ops').sort({ updatedAt: -1 }).limit(200)
      .populate('groupId', 'name').populate('updatedBy', 'username');
    const roles = Object.fromEntries(memberships.map((m) => [String(m.groupId), m.role]));
    res.json(docs.map((d) => ({ ...d.toObject(), canEdit: manage({ role: roles[String(d.groupId._id)] }) })));
  } catch (e) { err(res, e); }
};

// POST /api/documents  (Admin / Manager)
exports.create = async (req, res) => {
  try {
    const { groupId, title, type } = req.body;
    if (typeof title !== 'string' || !title.trim() || !/^[a-f0-9]{24}$/i.test(String(groupId))) {
      return res.status(400).json({ message: 'groupId and title are required' });
    }
    if (!manage(await member(groupId, req.user._id))) {
      return res.status(403).json({ message: 'Only group Admins or Managers can create documents' });
    }
    const doc = await Doc.create({ groupId, title: title.trim(), type: TYPES.includes(type) ? type : 'docx', createdBy: req.user._id, updatedBy: req.user._id });
    await DocumentVersion.create({ documentId: doc._id, version: 1, ops: doc.ops, savedBy: req.user._id, note: 'Created' });
    res.status(201).json(doc);
  } catch (e) { err(res, e); }
};

async function load(req, res) {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) { res.status(404).json({ message: 'Document not found' }); return null; }
  const doc = await Doc.findById(req.params.id).populate('groupId', 'name').populate('updatedBy', 'username');
  if (!doc) { res.status(404).json({ message: 'Document not found' }); return null; }
  const m = await member(doc.groupId._id, req.user._id);
  if (!m) { res.status(403).json({ message: 'Not a member of this group' }); return null; }
  return { doc, canEdit: manage(m) };
}

exports.get = async (req, res) => {
  try { const c = await load(req, res); if (c) res.json({ ...c.doc.toObject(), canEdit: c.canEdit }); } catch (e) { err(res, e); }
};

// PUT /api/documents/:id  { ops, baseVersion }
exports.save = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!c.canEdit) return res.status(403).json({ message: 'You have view-only access' });
    const ops = cleanOps(req.body.ops);
    if (!ops) return res.status(400).json({ message: 'Invalid or too large content (text only, max 800 KB)' });
    if (Number(req.body.baseVersion) !== c.doc.currentVersion) {
      return res.status(409).json({ message: 'Someone saved a newer version. Reload to see it.', currentVersion: c.doc.currentVersion });
    }
    c.doc.ops = ops; c.doc.currentVersion += 1; c.doc.updatedBy = req.user._id;
    await c.doc.save();
    await DocumentVersion.create({ documentId: c.doc._id, version: c.doc.currentVersion, ops, savedBy: req.user._id, note: String(req.body.note || '').slice(0, 100) });
    res.json({ currentVersion: c.doc.currentVersion });
  } catch (e) { err(res, e); }
};

exports.versions = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    const v = await DocumentVersion.find({ documentId: c.doc._id }).select('-ops').sort({ version: -1 }).limit(100).populate('savedBy', 'username');
    res.json(v);
  } catch (e) { err(res, e); }
};

exports.getVersion = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    const v = await DocumentVersion.findOne({ documentId: c.doc._id, version: Number(req.params.v) });
    if (!v) return res.status(404).json({ message: 'Version not found' });
    res.json(v);
  } catch (e) { err(res, e); }
};

// POST /api/documents/:id/restore/:v  -> new version containing the old content (history is never rewritten)
exports.restore = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!c.canEdit) return res.status(403).json({ message: 'You have view-only access' });
    const old = await DocumentVersion.findOne({ documentId: c.doc._id, version: Number(req.params.v) });
    if (!old) return res.status(404).json({ message: 'Version not found' });
    c.doc.ops = old.ops; c.doc.currentVersion += 1; c.doc.updatedBy = req.user._id;
    await c.doc.save();
    await DocumentVersion.create({ documentId: c.doc._id, version: c.doc.currentVersion, ops: old.ops, savedBy: req.user._id, note: `Restored from version ${old.version}` });
    res.json({ currentVersion: c.doc.currentVersion });
  } catch (e) { err(res, e); }
};

exports.exportDoc = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
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
