// Upload validation: the extension, the type the browser claims AND the real bytes must all agree.
const path = require('path');

const startsWith = (b, sig) => b.length >= sig.length && sig.every((x, i) => b[i] === x);
const ascii = (b, from, to) => b.slice(from, to).toString('latin1');
const isUtf8Text = (b) => {
  if (b.subarray(0, 8000).includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true; } catch (e) { return false; }
};
const zipWith = (needle) => (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && b.includes(Buffer.from(needle));
const OCTET = 'application/octet-stream';

// ext -> { mime (what the server stores/serves), accept (browser values allowed), kind, check(buffer) }
const TYPES = {
  jpg:  { mime: 'image/jpeg', accept: ['image/jpeg', 'image/pjpeg'], kind: 'image', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', accept: ['image/jpeg', 'image/pjpeg'], kind: 'image', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  png:  { mime: 'image/png', accept: ['image/png'], kind: 'image', check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  webp: { mime: 'image/webp', accept: ['image/webp'], kind: 'image', check: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  pdf:  { mime: 'application/pdf', accept: ['application/pdf'], kind: 'document', check: (b) => ascii(b, 0, 5) === '%PDF-' },
  doc:  { mime: 'application/msword', accept: ['application/msword', OCTET], kind: 'document', check: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', OCTET], kind: 'document', check: zipWith('word/') },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', accept: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', OCTET], kind: 'document', check: zipWith('xl/') },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', accept: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', OCTET], kind: 'document', check: zipWith('ppt/') },
  txt:  { mime: 'text/plain', accept: ['text/plain', OCTET], kind: 'document', check: isUtf8Text },
  md:   { mime: 'text/markdown', accept: ['text/markdown', 'text/x-markdown', 'text/plain', OCTET], kind: 'document', check: isUtf8Text },
  csv:  { mime: 'text/csv', accept: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', OCTET], kind: 'document', check: isUtf8Text }
};

const GROUP_FILE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'txt', 'xlsx', 'pptx', 'csv', 'md'];
const DOCUMENT_EXTS = ['txt', 'md', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc'];
// safe to show inside the page (never HTML / SVG / scripts)
const PREVIEW_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt', 'md', 'csv'];

// -> { ok, ext, mime, kind } or { ok:false, message }
function validate(file, allowedExts) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) return { ok: false, message: 'Choose a file to upload (empty files are not accepted)' };
  const ext = path.extname(String(file.originalname || '')).slice(1).toLowerCase();
  const t = TYPES[ext];
  if (!t || !allowedExts.includes(ext)) return { ok: false, message: `This file type is not allowed. Allowed: ${allowedExts.join(', ').toUpperCase()}` };
  const claimed = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (claimed && !t.accept.includes(claimed)) return { ok: false, message: `The file type (${claimed}) does not match its extension .${ext}` };
  if (!t.check(file.buffer)) return { ok: false, message: `The content of this file is not a valid .${ext} file` };
  return { ok: true, ext, mime: t.mime, kind: t.kind };
}

module.exports = { validate, TYPES, GROUP_FILE_EXTS, DOCUMENT_EXTS, PREVIEW_EXTS };
