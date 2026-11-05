const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const storage = require('../utils_storage');
const dir = storage.BASE;

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.docx', '.doc', '.xlsx', '.pptx', '.zip', '.json', '.js', '.py', '.sql', '.log']);

module.exports = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: storage.MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(path.extname(file.originalname).toLowerCase()))
});
