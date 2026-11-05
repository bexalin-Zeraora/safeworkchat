const express = require('express');
const router = express.Router();
const c = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/memoryUpload');

router.get('/', protect, c.list);
router.post('/', protect, upload.single('file'), c.upload);
router.get('/:id/download', protect, c.download);
router.get('/:id/preview', protect, c.preview);
router.delete('/:id', protect, c.remove);

module.exports = router;
