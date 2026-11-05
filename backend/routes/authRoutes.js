const express = require('express');
const router = express.Router();
const { registerUser, loginUser, setKeys, me, changePassword, config, googleLogin, googleLink, googleUnlink,
  forgotPassword, resetPassword, replaceKeyBackup, resetKeys, makeServerManaged } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot', forgotPassword);
router.post('/reset', resetPassword);
router.get('/config', config);
router.post('/google', googleLogin);

// Logged-in routes
router.put('/keys', protect, setKeys);
router.put('/key-backup', protect, replaceKeyBackup);
router.post('/keys/reset', protect, resetKeys);
router.post('/keys/server-managed', protect, makeServerManaged);
router.get('/me', protect, me);
router.post('/google/link', protect, googleLink);
router.delete('/google', protect, googleUnlink);
router.put('/password', protect, changePassword);

module.exports = router;
