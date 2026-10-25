const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { cleanKeyBackup, isPublicKey } = require('../utils_crypto');
const { checkUsername, checkEmail, checkPassword } = require('../utils_validate');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @desc    Register a new user
// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { password } = req.body;
    // plain strings only (an object such as {"$ne": ""} must never reach a query), then format and strength checks
    if (typeof req.body.username !== 'string' || typeof req.body.email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Please provide username, email, and password' });
    }
    const username = req.body.username.trim(), email = req.body.email.trim().toLowerCase();
    const problem = checkUsername(username) || checkEmail(email) || checkPassword(password, { username, email });
    if (problem) return res.status(400).json({ message: problem });

    // 3. Check if user already exists (by email OR username, case-insensitive for the name)
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userExists = await User.findOne({ $or: [{ email }, { username: new RegExp('^' + esc(username) + '$', 'i') }] });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // 4. Create new user
    const publicKey = isPublicKey(req.body.publicKey) ? req.body.publicKey : '';
    const keyBackup = publicKey ? cleanKeyBackup(req.body.keyBackup) : null;
    const user = await User.create({ username, email, password, publicKey, ...(keyBackup ? { keyBackup } : {}) });

    // 5. Send response with token
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    // Log the exact error to the terminal so we can debug it
    console.error("❌ Registration Error Details:", error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    // only plain strings: an object like {"$ne": ""} must never reach the query
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email/username and password are required' });
    }

    // 1. Find user by email OR username (the form says "Email or Username")
    const id = email.trim().slice(0, 100);
    const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, { username: id }] });

    // 2. Check if user exists and password matches
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
        publicKey: user.publicKey || '',
        keyBackup: user.publicKey && user.keyBackup && user.keyBackup.cipher ? user.keyBackup : null,
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// @desc    Set encryption keys once (for accounts created before encryption existed)
// @route   PUT /api/auth/keys
const setKeys = async (req, res) => {
  try {
    if (req.user.publicKey) return res.status(409).json({ message: 'Keys are already set' });
    const keyBackup = cleanKeyBackup(req.body.keyBackup);
    if (!isPublicKey(req.body.publicKey) || !keyBackup) return res.status(400).json({ message: 'Invalid key data' });
    await User.updateOne({ _id: req.user._id, publicKey: '' }, { publicKey: req.body.publicKey, keyBackup });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Check that the current token is still valid (used by the login page)
// @route   GET /api/auth/me
const me = (req, res) => res.json({ ok: true, _id: req.user._id, username: req.user.username });

// @desc    Change password. The browser also sends the private-key backup re-encrypted with the new password.
// @route   PUT /api/auth/password
const attempts = new Map();
const changePassword = async (req, res) => {
  try {
    const now = Date.now(), list = (attempts.get(String(req.user._id)) || []).filter((t) => now - t < 60000);
    list.push(now); attempts.set(String(req.user._id), list);
    if (list.length > 5) return res.status(429).json({ message: 'Too many attempts. Try again in a minute.' });

    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.matchPassword(currentPassword))) return res.status(403).json({ message: 'Current password is wrong' });
    const problem = checkPassword(newPassword, { username: user.username, email: user.email });
    if (problem) return res.status(400).json({ message: problem });
    if (newPassword === currentPassword) return res.status(400).json({ message: 'The new password must be different from the current one' });
    const kb = cleanKeyBackup(req.body.keyBackup);
    if (user.publicKey && !kb) return res.status(400).json({ message: 'Key backup is required. Log out and log in again, then retry.' });
    user.password = newPassword;
    if (kb) user.keyBackup = kb;
    await user.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { registerUser, loginUser, setKeys, me, changePassword };