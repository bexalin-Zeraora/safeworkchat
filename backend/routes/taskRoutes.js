const express = require('express');
const router = express.Router();
const c = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.get('/', protect, c.getTasks);
router.post('/', protect, c.createTask);
router.get('/:id', protect, c.getTask);
router.patch('/:id', protect, c.updateTask);
router.get('/:id/activity', protect, c.getTaskActivity);
router.put('/:id/phases', protect, c.planPhases);
router.post('/:id/updates', protect, upload.single('proof'), c.addUpdate);
router.post('/:id/comments', protect, c.addComment);
router.get('/:id/files/:activityId', protect, c.downloadFile);

module.exports = router;
