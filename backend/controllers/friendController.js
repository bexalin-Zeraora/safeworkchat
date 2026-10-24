const crypto = require('crypto');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { friendIds } = require('../utils_friends');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
const CODE_RE = /^SWC-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const err = (res, e) => res.status(500).json({ message: 'Server error', error: e.message });

function newCode() {
  const b = crypto.randomBytes(8);
  const c = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return `SWC-${c.slice(0, 4)}-${c.slice(4)}`;
}

async function ensureCode(user) {
  if (user.friendCode) return user.friendCode;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try { await User.updateOne({ _id: user._id, friendCode: { $in: [null, ''] } }, { friendCode: code }); const u = await User.findById(user._id); if (u.friendCode) return u.friendCode; }
    catch (e) { /* duplicate code, try again */ }
  }
  throw new Error('Could not create a friend code');
}

// simple in-memory limiter so nobody can probe usernames/codes quickly
const hits = new Map();
function limited(userId) {
  const now = Date.now(), list = (hits.get(String(userId)) || []).filter((t) => now - t < 60000);
  list.push(now); hits.set(String(userId), list);
  return list.length > 10;
}

// GET /api/friends -> accepted friends (username + public key only; no emails)
exports.list = async (req, res) => {
  try {
    const ids = await friendIds(req.user._id);
    const users = await User.find({ _id: { $in: ids } }).select('username publicKey').sort({ username: 1 });
    res.json(users);
  } catch (e) { err(res, e); }
};

// GET /api/friends/requests
exports.requests = async (req, res) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      Friendship.find({ recipient: req.user._id, status: 'pending' }).populate('requester', 'username'),
      Friendship.find({ requester: req.user._id, status: 'pending' }).populate('recipient', 'username')
    ]);
    res.json({
      incoming: incoming.map((r) => ({ _id: r._id, username: r.requester.username })),
      outgoing: outgoing.map((r) => ({ _id: r._id, username: r.recipient.username }))
    });
  } catch (e) { err(res, e); }
};

// GET /api/friends/code
exports.myCode = async (req, res) => {
  try { res.json({ code: await ensureCode(req.user) }); } catch (e) { err(res, e); }
};

// POST /api/friends/code/reset
exports.resetCode = async (req, res) => {
  try {
    for (let i = 0; i < 5; i++) {
      try { await User.updateOne({ _id: req.user._id }, { friendCode: newCode() }); break; } catch (e) { /* retry on duplicate */ }
    }
    const u = await User.findById(req.user._id);
    res.json({ code: u.friendCode });
  } catch (e) { err(res, e); }
};

// POST /api/friends/request  { identifier: exact username OR friend code }
// The answer is always the same so it can't be used to find out who has an account.
exports.request = async (req, res) => {
  const generic = { message: 'If that person exists, your friend request has been sent.' };
  try {
    if (limited(req.user._id)) return res.status(429).json({ message: 'Too many attempts. Try again in a minute.' });
    const id = typeof req.body.identifier === 'string' ? req.body.identifier.trim().slice(0, 40) : '';
    if (!id) return res.status(400).json({ message: 'Enter a username or friend code' });

    const target = CODE_RE.test(id.toUpperCase())
      ? await User.findOne({ friendCode: id.toUpperCase() })
      : await User.findOne({ username: new RegExp('^' + escRe(id) + '$', 'i') });
    if (!target || String(target._id) === String(req.user._id)) return res.json(generic);

    const existing = await Friendship.findOne({ $or: [
      { requester: req.user._id, recipient: target._id },
      { requester: target._id, recipient: req.user._id }] });
    if (!existing) {
      await Friendship.create({ requester: req.user._id, recipient: target._id });
      const io = req.app.get('io'); if (io) io.to('user:' + target._id).emit('friendsChanged');
    } else if (existing.status === 'pending' && String(existing.recipient) === String(req.user._id)) {
      existing.status = 'accepted'; await existing.save(); // they had already asked you
    }
    res.json(generic);
  } catch (e) { err(res, e); }
};

// POST /api/friends/requests/:id/accept | decline  (recipient only)
exports.respond = (accept) => async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ message: 'Not found' });
    const f = await Friendship.findOne({ _id: req.params.id, recipient: req.user._id, status: 'pending' });
    if (!f) return res.status(404).json({ message: 'Request not found' });
    if (accept) { f.status = 'accepted'; await f.save(); } else { await f.deleteOne(); }
    const io = req.app.get('io'); if (io) io.to('user:' + f.requester).emit('friendsChanged');
    res.json({ ok: true });
  } catch (e) { err(res, e); }
};

// DELETE /api/friends/:userId  (unfriend or cancel your own pending request)
exports.remove = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) return res.status(404).json({ message: 'Not found' });
    await Friendship.deleteOne({ $or: [
      { requester: req.user._id, recipient: req.params.userId },
      { requester: req.params.userId, recipient: req.user._id }] });
    res.json({ ok: true });
  } catch (e) { err(res, e); }
};
