const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const dir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(dir, { recursive: true });

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.docx', '.doc', '.xlsx', '.pptx', '.zip', '.json', '.js', '.py', '.sql', '.log']);

module.exports = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(path.extname(file.originalname).toLowerCase()))
});
