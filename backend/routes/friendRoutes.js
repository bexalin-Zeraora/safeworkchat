const express = require('express');
const router = express.Router();
const c = require('../controllers/friendController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, c.list);
router.get('/requests', protect, c.requests);
router.get('/code', protect, c.myCode);
router.post('/code/reset', protect, c.resetCode);
router.post('/request', protect, c.request);
router.post('/requests/:id/accept', protect, c.respond(true));
router.post('/requests/:id/decline', protect, c.respond(false));
router.delete('/:userId', protect, c.remove);

module.exports = router;
