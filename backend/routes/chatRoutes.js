const express = require('express');
const router = express.Router();
const { getMessages, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:groupId', protect, getMessages);
router.post('/:groupId', protect, sendMessage);

module.exports = router;