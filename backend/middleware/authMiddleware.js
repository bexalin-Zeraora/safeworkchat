const jwt = require('jsonwebtoken');
const User = require('../models/User');
const lastSeenWrite = new Map();

const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    // a valid token for a user that no longer exists (database was reset) must not get through
    if (!user) return res.status(401).json({ message: 'Not authorized, user no longer exists' });
    req.user = user;
    // Throttle activity writes so ordinary API traffic does not cause a DB write per request.
    const key = String(user._id), now = Date.now(), previous = lastSeenWrite.get(key) || 0;
    if (now - previous > 5 * 60 * 1000) {
      lastSeenWrite.set(key, now);
      User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date(), inactivityEmailSentAt: null } }).catch(() => {});
    }
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };
