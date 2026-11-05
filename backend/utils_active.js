// Remembers when a user was last seen (at most one write every 5 minutes per user). Feeds the inactivity e-mail.
const User = require('./models/User');
const last = new Map();
function touch(userId) {
  const id = String(userId), now = Date.now();
  if (now - (last.get(id) || 0) < 5 * 60000) return;
  last.set(id, now);
  if (last.size > 5000) last.clear();
  User.updateOne({ _id: id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
}
module.exports = { touch };
