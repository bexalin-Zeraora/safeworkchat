const express = require('express');
const router = express.Router();
const c = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, c.list);
router.post('/read-all', protect, c.readAll);
router.post('/:id/read', protect, c.readOne);

module.exports = router;
