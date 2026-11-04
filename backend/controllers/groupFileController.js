const path = require('path');
const fs = require('fs');
const GroupMember = require('../models/GroupMember');
const GroupFile = require('../models/GroupFile');
const upload = require('../middleware/upload');
const uploadOne = upload.single('file');
const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));

exports.list = async (req, res) => {
  try {
    if (!isId(req.params.id) || !(await GroupMember.findOne({ groupId: req.params.id, userId: req.user._id }))) return res.status(403).json({ message: 'You are not a member of this group' });
    const files = await GroupFile.find({ groupId: req.params.id }).sort({ createdAt: -1 }).populate('uploadedBy', 'username');
    res.json(files.map(f => ({ _id: f._id, originalName: f.originalName, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt, uploadedBy: f.uploadedBy?.username || 'Member' })));
  } catch (e) { res.status(500).json({ message: 'Could not load group files' }); }
};

exports.upload = (req, res) => uploadOne(req, res, async (err) => {
  if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
  try {
    if (!isId(req.params.id) || !(await GroupMember.findOne({ groupId: req.params.id, userId: req.user._id }))) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ message: 'You are not a member of this group' });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a supported file (maximum 10 MB)' });
    const file = await GroupFile.create({ groupId: req.params.id, uploadedBy: req.user._id, originalName: path.basename(req.file.originalname).slice(0, 255), filename: req.file.filename, mimeType: req.file.mimetype, size: req.file.size });
    res.status(201).json({ _id: file._id, originalName: file.originalName, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt });
  } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); res.status(500).json({ message: 'Could not save uploaded file' }); }
});

exports.download = async (req, res) => {
  try {
    const member = await GroupMember.findOne({ groupId: req.params.id, userId: req.user._id });
    if (!member) return res.status(403).json({ message: 'Not a group member' });
    const file = await GroupFile.findOne({ _id: req.params.fileId, groupId: req.params.id });
    if (!file) return res.status(404).json({ message: 'File not found' });
    const target = path.join(__dirname, '..', 'uploads', path.basename(file.filename));
    if (!fs.existsSync(target)) return res.status(410).json({ message: 'File is no longer available on this server' });
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.download(target, file.originalName);
  } catch (e) { res.status(500).json({ message: 'Could not download file' }); }
};

exports.remove = async (req, res) => {
  try {
    const file = await GroupFile.findOne({ _id: req.params.fileId, groupId: req.params.id });
    if (!file) return res.status(404).json({ message: 'File not found' });
    const member = await GroupMember.findOne({ groupId: req.params.id, userId: req.user._id });
    if (!member || (member.role !== 'Admin' && member.role !== 'Manager' && String(file.uploadedBy) !== String(req.user._id))) return res.status(403).json({ message: 'You cannot delete this file' });
    await GroupFile.deleteOne({ _id: file._id });
    fs.unlink(path.join(__dirname, '..', 'uploads', path.basename(file.filename)), () => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Could not delete file' }); }
};
