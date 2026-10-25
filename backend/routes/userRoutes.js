const express = require('express');
const router = express.Router();
const c = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/me', protect, c.me);
router.put('/me', protect, c.update);
router.post('/me/avatar', protect, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), c.setAvatar);
router.delete('/me/avatar', protect, c.removeAvatar);

module.exports = router;
