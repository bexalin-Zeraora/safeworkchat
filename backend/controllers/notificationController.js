const Notification = require('../models/Notification');
const err = (res, e) => res.status(500).json({ message: 'Server error', error: e.message });

// GET /api/notifications  -> latest 50 + unread count
exports.list = async (req, res) => {
  try {
    const [items, unread] = await Promise.all([
      Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ userId: req.user._id, read: false })
    ]);
    res.json({ unread, items });
  } catch (e) { err(res, e); }
};

// POST /api/notifications/read-all
exports.readAll = async (req, res) => {
  try { await Notification.updateMany({ userId: req.user._id, read: false }, { read: true }); res.json({ ok: true }); } catch (e) { err(res, e); }
};

// DELETE /api/notifications/read  -> remove the notifications I have already read
exports.clearRead = async (req, res) => {
  try { const r = await Notification.deleteMany({ userId: req.user._id, read: true }); res.json({ removed: r.deletedCount }); } catch (e) { err(res, e); }
};

// POST /api/notifications/:id/read  (own notifications only)
exports.readOne = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ message: 'Not found' });
    await Notification.updateOne({ _id: req.params.id, userId: req.user._id }, { read: true });
    res.json({ ok: true });
  } catch (e) { err(res, e); }
};
