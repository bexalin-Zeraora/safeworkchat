const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const User = require('../models/User');
const { forget } = require('../utils_avatar');

const DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(DIR, { recursive: true });
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const err = (res, e) => res.status(500).json({ message: 'Server error', error: e.message });

// what a real image looks like, judged by its first bytes (the file name / type sent by the browser is not trusted)
function imageType(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

const shape = (u) => ({ _id: u._id, username: u.username, email: u.email, bio: u.bio || '', hasAvatar: !!u.avatar, createdAt: u.createdAt });

// GET /api/users/me
exports.me = async (req, res) => res.json(shape(await User.findById(req.user._id)));

// PUT /api/users/me   { username?, bio? }
exports.update = async (req, res) => {
  try {
    const u = await User.findById(req.user._id);
    const oldName = u.username;
    if (req.body.username !== undefined) {
      const name = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      if (name.length < 2 || name.length > 30 || /[<>"'&]/.test(name)) return res.status(400).json({ message: 'Username must be 2-30 characters and cannot contain < > " \' &' });
      if (name !== oldName) {
        const taken = await User.findOne({ username: new RegExp('^' + escRe(name) + '$', 'i'), _id: { $ne: u._id } });
        if (taken) return res.status(409).json({ message: 'That username is already taken' });
        u.username = name;
      }
    }
    if (req.body.bio !== undefined) {
      if (typeof req.body.bio !== 'string' || req.body.bio.length > 160) return res.status(400).json({ message: 'About me can be at most 160 characters' });
      u.bio = req.body.bio.trim();
    }
    await u.save();
    forget(oldName, u.username);
    res.json(shape(u));
  } catch (e) { err(res, e); }
};

// POST /api/users/me/avatar   (raw image bytes, max 2 MB, JPEG / PNG / WebP)
exports.setAvatar = async (req, res) => {
  try {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ message: 'Send a JPEG, PNG or WebP image (max 2 MB)' });
    const type = imageType(buf);
    if (!type) return res.status(400).json({ message: 'That file is not a JPEG, PNG or WebP image' });
    const name = uuid() + '.' + type;
    fs.writeFileSync(path.join(DIR, name), buf);
    const u = await User.findById(req.user._id);
    if (u.avatar) fs.unlink(path.join(DIR, path.basename(u.avatar)), () => {});
    u.avatar = name; await u.save();
    forget(u.username);
    res.json(shape(u));
  } catch (e) { err(res, e); }
};

// DELETE /api/users/me/avatar
exports.removeAvatar = async (req, res) => {
  try {
    const u = await User.findById(req.user._id);
    if (u.avatar) fs.unlink(path.join(DIR, path.basename(u.avatar)), () => {});
    u.avatar = ''; await u.save();
    forget(u.username);
    res.json(shape(u));
  } catch (e) { err(res, e); }
};

exports.AVATAR_DIR = DIR;
