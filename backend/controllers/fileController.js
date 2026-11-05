// Group "Files" section: files shared with a group, separate from chat messages and from documents.
const GroupFile = require('../models/GroupFile');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
const storage = require('../utils_storage');
const { validate, GROUP_FILE_EXTS, PREVIEW_EXTS } = require('../utils_filetype');

const SUB = 'group-files';
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const err = (res, e) => { console.error(e); res.status(500).json({ message: 'Server error' }); };
const manage = (m) => m && (m.role === 'Admin' || m.role === 'Manager');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shape = (f, me, m) => ({
  _id: f._id, groupId: f.groupId, originalName: f.originalName, ext: f.ext, mimeType: f.mimeType, kind: f.kind, size: f.size, createdAt: f.createdAt,
  uploadedBy: f.uploadedBy ? { _id: f.uploadedBy._id, username: f.uploadedBy.username } : null,
  canPreview: PREVIEW_EXTS.includes(f.ext),
  canDelete: String(f.uploadedBy && f.uploadedBy._id) === String(me) || manage(m)     // uploader, group Admin or Manager
});

// GET /api/files?groupId=&q=&type=image|document|other&sort=new|old|name|size
exports.list = async (req, res) => {
  try {
    if (!isId(req.query.groupId)) return res.status(400).json({ message: 'groupId is required' });
    const m = await GroupMember.findOne({ groupId: req.query.groupId, userId: req.user._id });
    if (!m) return res.status(403).json({ message: 'Not a member of this group' });
    const filter = { groupId: req.query.groupId };
    if (['image', 'document', 'other'].includes(req.query.type)) filter.kind = req.query.type;
    if (typeof req.query.q === 'string' && req.query.q.trim()) filter.originalName = new RegExp(escRe(req.query.q.trim().slice(0, 60)), 'i');
    const sort = { old: { createdAt: 1 }, name: { originalName: 1 }, size: { size: -1 } }[req.query.sort] || { createdAt: -1 };
    const files = await GroupFile.find(filter).sort(sort).limit(500).populate('uploadedBy', 'username');
    res.json(files.map((f) => shape(f, req.user._id, m)));
  } catch (e) { err(res, e); }
};

// POST /api/files   multipart: groupId, file
exports.upload = async (req, res) => {
  try {
    const groupId = req.body.groupId;
    if (!isId(groupId)) return res.status(400).json({ message: 'groupId is required' });
    const m = await GroupMember.findOne({ groupId, userId: req.user._id });
    if (!m) return res.status(403).json({ message: 'Not a member of this group' });
    const group = await Group.findById(groupId).select('isDirect');
    if (!group || group.isDirect) return res.status(400).json({ message: 'Files can only be shared in groups' });

    const v = validate(req.file, GROUP_FILE_EXTS);
    if (!v.ok) return res.status(400).json({ message: v.message });
    const storedName = await storage.saveBuffer(SUB, req.file.buffer, v.ext === 'jpeg' ? 'jpg' : v.ext);
    try {
      const f = await GroupFile.create({ groupId, uploadedBy: req.user._id, originalName: storage.cleanName(req.file.originalname), storedName, ext: v.ext, mimeType: v.mime, kind: v.kind === 'image' ? 'image' : v.kind === 'document' ? 'document' : 'other', size: req.file.size });
      await f.populate('uploadedBy', 'username');
      res.status(201).json(shape(f, req.user._id, m));
    } catch (e) { storage.remove(SUB, storedName); throw e; }
  } catch (e) { err(res, e); }
};

async function load(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ message: 'File not found' }); return null; }
  const f = await GroupFile.findById(req.params.id).populate('uploadedBy', 'username');
  if (!f) { res.status(404).json({ message: 'File not found' }); return null; }
  const m = await GroupMember.findOne({ groupId: f.groupId, userId: req.user._id });
  if (!m) { res.status(403).json({ message: 'You are not allowed to open this file' }); return null; }
  return { f, m };
}

// GET /api/files/:id/download   (members only; always downloaded, never rendered by the browser)
exports.download = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    const full = storage.resolveStored(SUB, c.f.storedName);
    if (!full) return res.status(404).json({ message: 'File not found' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.download(full, c.f.originalName, (e) => { if (e && !res.headersSent) res.status(404).json({ message: 'File is missing on the server' }); });
  } catch (e) { err(res, e); }
};

// GET /api/files/:id/preview   (images, PDF and plain text only; sandboxed so nothing can run)
exports.preview = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!PREVIEW_EXTS.includes(c.f.ext)) return res.status(415).json({ message: 'No preview for this file type. Download it instead.' });
    const full = storage.resolveStored(SUB, c.f.storedName);
    if (!full) return res.status(404).json({ message: 'File not found' });
    const text = ['txt', 'md', 'csv'].includes(c.f.ext);
    res.set({
      'Content-Type': text ? 'text/plain; charset=utf-8' : c.f.mimeType, 'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    });
    res.sendFile(full, (e) => { if (e && !res.headersSent) res.status(404).json({ message: 'File is missing on the server' }); });
  } catch (e) { err(res, e); }
};

// DELETE /api/files/:id   (the uploader, or a group Admin / Manager)
exports.remove = async (req, res) => {
  try {
    const c = await load(req, res); if (!c) return;
    if (!shape(c.f, req.user._id, c.m).canDelete) return res.status(403).json({ message: 'Only the uploader or a group Admin / Manager can delete this file' });
    await GroupFile.deleteOne({ _id: c.f._id });
    storage.remove(SUB, c.f.storedName);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
};
