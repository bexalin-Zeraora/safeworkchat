// Where uploaded files live. Set UPLOAD_DIR to a persistent disk when deploying (Render disks, etc.).
const fs = require('fs');
const path = require('path');
const uuid = () => require('crypto').randomUUID();   // built in: no extra package needed

const BASE = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
fs.mkdirSync(BASE, { recursive: true });

const MAX_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;

const dirFor = (sub) => { const d = path.join(BASE, sub); fs.mkdirSync(d, { recursive: true }); return d; };

// stored names are always "<uuid>.<ext>" that WE generated; anything else is refused (path traversal)
const STORED = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{2,5}$/;
function resolveStored(sub, name) {
  if (typeof name !== 'string' || !STORED.test(name)) return null;
  const dir = dirFor(sub);
  const full = path.resolve(dir, name);
  return full.startsWith(dir + path.sep) ? full : null;
}
async function saveBuffer(sub, buffer, ext) {
  const name = uuid() + '.' + ext;
  await fs.promises.writeFile(path.join(dirFor(sub), name), buffer, { flag: 'wx' });
  return name;
}
const remove = (sub, name) => { const f = resolveStored(sub, name); if (f) fs.unlink(f, () => {}); };

// file name as shown to people: no folders, no control characters, bounded length
function cleanName(original) {
  let n = String(original || 'file').replace(/\\/g, '/').split('/').pop();
  n = n.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  if (n.length > 150) { const ext = path.extname(n); n = n.slice(0, 150 - ext.length) + ext; }
  return n || 'file';
}

module.exports = { BASE, MAX_BYTES, MAX_MB, dirFor, resolveStored, saveBuffer, remove, cleanName };
