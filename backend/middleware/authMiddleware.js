const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { touch } = require('../utils_active');

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
    touch(user._id);   // remembers when the user was last active (inactivity e-mail)
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };
