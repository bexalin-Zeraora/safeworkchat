// Receives ONE uploaded file in memory (size-limited). Validation + saving to disk is done by the controllers,
// after the real content has been checked, so nothing unchecked ever touches the disk.
const multer = require('multer');
const { MAX_BYTES } = require('../utils_storage');

module.exports = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 2000 } });
