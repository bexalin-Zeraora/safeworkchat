const express = require('express');
const router = express.Router();
const c = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, c.list);
router.post('/', protect, c.create);
router.get('/:id', protect, c.get);
router.put('/:id', protect, c.save);
router.get('/:id/versions', protect, c.versions);
router.get('/:id/versions/:v', protect, c.getVersion);
router.post('/:id/restore/:v', protect, c.restore);
router.get('/:id/export', protect, c.exportDoc);

module.exports = router;
