const express = require('express');
const router = express.Router();
const c = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/memoryUpload');

router.get('/', protect, c.list);
router.post('/', protect, c.create);
router.post('/upload', protect, upload.single('file'), c.upload);
router.get('/:id', protect, c.get);
router.put('/:id', protect, c.save);
router.put('/:id/file', protect, upload.single('file'), c.replaceFile);
router.get('/:id/file', protect, c.file);
router.post('/:id/share', protect, c.share);
router.get('/:id/versions', protect, c.versions);
router.get('/:id/versions/:v', protect, c.getVersion);
router.post('/:id/restore/:v', protect, c.restore);
router.get('/:id/export', protect, c.exportDoc);

module.exports = router;
