const express = require('express');
const router = express.Router();
const { registerUser, loginUser, setKeys, me, changePassword, config, googleLogin, googleLink, googleUnlink } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.put('/keys', protect, setKeys);
router.get('/me', protect, me);
router.get('/config', config);
router.post('/google', googleLogin);
router.post('/google/link', protect, googleLink);
router.delete('/google', protect, googleUnlink);
router.put('/password', protect, changePassword);

// Protected route example (we will use this later for getting user profile)
router.get('/me', protect, (req, res) => {
  res.json({ message: 'This is a protected route!', user: req.user });
});

module.exports = router;