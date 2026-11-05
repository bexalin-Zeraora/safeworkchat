// Offline tests (no MongoDB, no SMTP, no npm install needed):  npm test
// External packages and Mongoose models are replaced by small in-memory fakes, so this checks OUR logic:
// file validation, path safety, key wrapping, e-mail de-duplication / retry, scheduled jobs and document permissions.
const Module = require('module');
const path = require('path');
const assert = require('assert');
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.EMAIL_NOTIFICATIONS = 'true'; process.env.SMTP_USER = 'a@gmail.com'; process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
process.env.UPLOAD_DIR = path.join(require('os').tmpdir(), 'swc-test-' + process.pid);

// ---------- fakes ----------
const sent = [];
let failNext = 0;
const fakeTransport = { sendMail: async (m) => { if (failNext > 0) { failNext--; throw new Error('SMTP down'); } sent.push(m); return {}; } };
const logs = new Map();                                    // fake NotificationLog collection
let seq = 0;
const FakeLog = {
  async create(o) { if (logs.has(o.key)) throw Object.assign(new Error('dup'), { code: 11000 }); const r = { _id: ++seq, ...o }; logs.set(o.key, r); return r; },
  async findOneAndUpdate(f, u) {
    const r = logs.get(f.key); if (!r || !(r.attempts < f.attempts.$lt)) return null;
    if (!f.$or.some((c) => r.status === c.status && r.lastAttemptAt <= c.lastAttemptAt.$lte)) return null;
    Object.assign(r, u.$set); r.attempts += u.$inc.attempts; return r;
  },
  async updateOne(f, u) { const r = [...logs.values()].find((x) => x._id === f._id); Object.assign(r, u.$set); },
  find(q) { const keys = new Set(q.key.$in); const rows = [...logs.values()].filter((r) => keys.has(r.key) && (r.status === 'sent' || r.attempts >= 3)); return { select: async () => rows }; }
};
const query = (rows) => { const p = { populate: () => p, select: () => p, limit: () => p, then: (ok, no) => Promise.resolve(rows).then(ok, no) }; return p; };
let TASKS = [], USERS = [];
const FakeTask = { find: (f) => query(TASKS.filter((t) => f.dueDate.$gt ? t.dueDate > f.dueDate.$gt && t.dueDate <= f.dueDate.$lte : t.dueDate <= f.dueDate.$lte && t.dueDate >= f.dueDate.$gte)), countDocuments: async () => 2 };
const FakeUser = { find: () => query(USERS) };
const stubs = {
  nodemailer: { createTransport: () => fakeTransport }, 'node-cron': { schedule() {}, validate: () => true },
  tweetnacl: require('../../frontend/vendor/nacl-fast.min.js'),
  docx: { Document: class {}, Packer: {}, Paragraph: class {}, TextRun: class {} }, mammoth: {}
};
const modelStubs = { NotificationLog: FakeLog, Task: FakeTask, User: FakeUser };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs[request]) return stubs[request];
  const m = /(?:^|\/)models\/(\w+)$/.exec(request);
  if (m) return modelStubs[m[1]] || {};
  return origLoad.apply(this, arguments);
};

// ---------- tiny runner ----------
let pass = 0, fail = 0; const todo = [];
const test = (name, fn) => todo.push([name, fn]);
const buf = (...parts) => Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, 'latin1'))));
const PNG = buf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'x'.repeat(20));
const JPG = buf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x'.repeat(20));
const PDF = buf('%PDF-1.7\n', 'x'.repeat(20));
const WEBP = buf('RIFF', Buffer.from([1, 0, 0, 0]), 'WEBPVP8 ');
const DOCX = buf(Buffer.from([0x50, 0x4b, 3, 4]), 'xxxx word/document.xml xxxx');
const f = (name, mimetype, buffer) => ({ originalname: name, mimetype, buffer });

// ---------- file validation ----------
const ft = require('../utils_filetype');
test('accepts real PNG / JPG / WEBP / PDF / DOCX / TXT', () => {
  for (const [n, m, b] of [['a.png', 'image/png', PNG], ['a.JPG', 'image/jpeg', JPG], ['a.jpeg', 'image/jpeg', JPG], ['a.webp', 'image/webp', WEBP], ['a.pdf', 'application/pdf', PDF],
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX], ['a.txt', 'text/plain', Buffer.from('héllo')], ['a.docx', 'application/octet-stream', DOCX]]) {
    assert.ok(ft.validate(f(n, m, b), ft.GROUP_FILE_EXTS).ok, n);
  }
});
test('rejects wrong content, wrong mime, disallowed extensions, empty files', () => {
  const bad = [f('evil.png', 'image/png', Buffer.from('<?php echo 1;')), f('a.pdf', 'application/pdf', PNG), f('a.png', 'application/pdf', PNG), f('x.svg', 'image/svg+xml', Buffer.from('<svg onload=alert(1)>')),
    f('x.html', 'text/html', Buffer.from('<script>')), f('x.exe', 'application/octet-stream', buf('MZ')), f('a.txt', 'text/plain', buf('abc', Buffer.from([0]), 'def')), f('a.png', 'image/png', Buffer.alloc(0)), f('noext', 'text/plain', Buffer.from('a')),
    f('a.docx', 'application/octet-stream', buf(Buffer.from([0x50, 0x4b, 3, 4]), 'xl/workbook.xml'))];
  bad.forEach((x) => assert.strictEqual(ft.validate(x, ft.GROUP_FILE_EXTS).ok, false, x.originalname));
});
test('document uploads allow only the document types', () => {
  assert.ok(ft.validate(f('a.md', 'text/markdown', Buffer.from('# hi')), ft.DOCUMENT_EXTS).ok);
  assert.ok(!ft.validate(f('a.xlsx', 'application/octet-stream', buf(Buffer.from([0x50, 0x4b, 3, 4]), 'xl/')), ft.DOCUMENT_EXTS).ok);
});

// ---------- storage safety ----------
const st = require('../utils_storage');
test('stored names: path traversal refused, own names accepted', async () => {
  for (const bad of ['../../etc/passwd', '..%2f..%2fx.png', 'a/b.png', '/etc/passwd', 'x.png', '', null, '11111111-1111-1111-1111-111111111111.png/../../x', 'C:\\x.png']) assert.strictEqual(st.resolveStored('group-files', bad), null, String(bad));
  const name = await st.saveBuffer('group-files', PNG, 'png');
  const full = st.resolveStored('group-files', name);
  assert.ok(full && full.startsWith(st.dirFor('group-files')) && require('fs').existsSync(full));
  st.remove('group-files', name);
});
test('cleanName strips folders and control characters', () => {
  assert.strictEqual(st.cleanName('../../a\\b/c.txt'), 'c.txt');
  assert.strictEqual(st.cleanName('x\u0000y<z>.png'), 'xyz.png');
  assert.ok(st.cleanName('a'.repeat(400) + '.pdf').length <= 150);
});

// ---------- key wrapping (Google accounts) ----------
const kw = require('../utils_keywrap');
test('server-managed key: round trip, tamper detection, matches public key', () => {
  const k = kw.generate();
  assert.strictEqual(kw.unwrap(k.serverKey), k.secretKey);
  assert.strictEqual(kw.publicFromSecret(k.secretKey), k.publicKey);
  assert.strictEqual(kw.unwrap(k.serverKey.slice(0, -4) + 'AAAA'), null);
  assert.strictEqual(kw.unwrap('garbage'), null);
});

// ---------- e-mail: no duplicates, retry rules, templates ----------
const mail = require('../utils_mail');
const job = require('../jobs/emailJobs');
const m1 = { key: 'k1', type: 'test', userId: 1, to: 'u@gmail.com', subject: 's', text: 't', html: '<b>t</b>' };
test('the same notification key is sent only once', async () => {
  sent.length = 0; logs.clear();
  assert.strictEqual((await mail.sendOnce(m1)).status, 'sent');
  assert.strictEqual((await mail.sendOnce(m1)).status, 'duplicate');
  assert.strictEqual(sent.length, 1); assert.strictEqual(logs.get('k1').status, 'sent');
});
test('failed e-mail is logged, not retried at once, retried later, and stops after the maximum', async () => {
  sent.length = 0; logs.clear(); failNext = 1;
  assert.strictEqual((await mail.sendOnce(m1)).status, 'failed');
  assert.strictEqual(logs.get('k1').status, 'failed');
  assert.strictEqual((await mail.sendOnce(m1)).status, 'duplicate');          // too soon
  logs.get('k1').lastAttemptAt = new Date(Date.now() - 11 * 60000);
  assert.strictEqual((await mail.sendOnce(m1)).status, 'sent');                  // retry succeeded
  assert.strictEqual(logs.get('k1').attempts, 2);
  logs.clear(); failNext = 5;
  for (let i = 0; i < 6; i++) { await mail.sendOnce(m1); logs.get('k1').lastAttemptAt = new Date(Date.now() - 20 * 60000); }
  assert.strictEqual(logs.get('k1').attempts, 3);                                // never more than EMAIL_MAX_ATTEMPTS
  failNext = 0;
});
test('nothing is sent (or logged) when SMTP is not configured', async () => {
  logs.clear(); const u = process.env.SMTP_USER; process.env.SMTP_USER = '';
  assert.strictEqual((await mail.sendOnce(m1)).status, 'disabled'); assert.strictEqual(logs.size, 0); process.env.SMTP_USER = u;
});
test('task e-mail contains task, group, assignee, deadline; HTML is escaped', () => {
  const e = mail.taskEmail('task_assigned', { task: { _id: 'T1', title: 'Fix <b>bug</b>', dueDate: new Date('2030-01-02T10:00:00Z'), priority: 'High', status: 'To Do', description: 'x' }, assigneeName: 'Asha', groupName: 'Team "A"', assignerName: 'Raj' });
  assert.ok(/Fix <b>bug<\/b>/.test(e.text) && /Asha/.test(e.text) && /Team "A"/.test(e.text) && /2030|Jan/.test(e.text) && /tasks.html\?id=T1/.test(e.text));
  assert.ok(!/<b>bug<\/b>/.test(e.html) && /&lt;b&gt;bug/.test(e.html));
});

// ---------- scheduled jobs ----------
const hrs = (h) => new Date(Date.now() + h * 3600000);
const mkTask = (id, due, email = 'asha@gmail.com') => ({ _id: id, title: 'Task ' + id, dueDate: due, priority: 'High', status: 'To Do', assignedTo: { _id: 'u' + id, username: 'Asha', email }, groupId: { _id: 'g1', name: 'Team' } });
test('deadline-approaching and overdue e-mails: once each, even if the job runs again', async () => {
  sent.length = 0; logs.clear();
  TASKS = [mkTask(1, hrs(5)), mkTask(2, hrs(-3)), mkTask(3, hrs(100)), mkTask(4, hrs(-24 * 30)), mkTask(5, hrs(2), 'demo@test.local')];
  assert.strictEqual(await job.checkTasks(), 2);
  assert.strictEqual(await job.checkTasks(), 0); assert.strictEqual(await job.checkTasks(), 0);
  assert.deepStrictEqual(sent.map((m) => m.subject).sort(), ['Deadline approaching: Task 1', 'Overdue: Task 2']);   // far-future, very old and demo-address tasks are skipped
  TASKS[0].dueDate = hrs(8);                                                   // deadline moved -> a new reminder is allowed
  assert.strictEqual(await job.checkTasks(), 1);
});
test('inactivity e-mail: only inactive users, one per inactivity event, again after the user returns', async () => {
  sent.length = 0; logs.clear();
  const last = new Date(Date.now() - 10 * 86400000);
  USERS = [{ _id: 'a', username: 'Old', email: 'old@gmail.com', lastActiveAt: last }, { _id: 'b', username: 'Demo', email: 'x@test.local', lastActiveAt: last }];
  assert.strictEqual(await job.checkInactiveUsers(), 1);
  assert.strictEqual(await job.checkInactiveUsers(), 0);
  assert.ok(/Old/.test(sent[0].text) && /Open tasks assigned to you: 2/.test(sent[0].text));
  USERS[0].lastActiveAt = new Date(Date.now() - 9 * 86400000);                 // came back, left again
  assert.strictEqual(await job.checkInactiveUsers(), 1);
});

// ---------- document permissions ----------
const docs = require('../controllers/documentController')._test;
const FakeTaskModel = require('../models/Task');
FakeTaskModel.findById = () => ({ select: async () => ({ _id: 't1', title: 'T', assignedTo: 'assignee', createdBy: 'boss', groupId: 'g1' }) });
test('ordinary group document: managers edit, members only view (existing rule kept)', async () => {
  const d = { groupId: 'g1' };
  assert.deepStrictEqual(await docs.access(d, { role: 'Admin' }, 'x'), { canView: true, canEdit: true, task: null });
  assert.strictEqual((await docs.access(d, { role: 'Member' }, 'x')).canEdit, false);
  assert.strictEqual((await docs.access(d, { role: 'Member' }, 'x')).canView, true);
});
test('task document: ONLY the assignee edits; managers may view; other members cannot even view', async () => {
  const d = { groupId: 'g1', taskId: 't1' };
  assert.strictEqual((await docs.access(d, { role: 'Member' }, 'assignee')).canEdit, true);
  const admin = await docs.access(d, { role: 'Admin' }, 'boss');
  assert.strictEqual(admin.canEdit, false); assert.strictEqual(admin.canView, true);
  const other = await docs.access(d, { role: 'Member' }, 'someone');
  assert.strictEqual(other.canEdit, false); assert.strictEqual(other.canView, false);
});
test('upload helpers: file kinds, text -> editor content, unsafe content removed', () => {
  assert.deepStrictEqual(docs.classify('docx'), { type: 'docx', kind: 'text' }); assert.strictEqual(docs.classify('jpeg').type, 'jpg');
  assert.strictEqual(docs.classify('pdf').kind, 'pdf'); assert.strictEqual(docs.classify('doc').kind, 'binary');
  assert.deepStrictEqual(docs.textToOps('a\r\nb'), [{ insert: 'a\nb\n' }]);
  assert.strictEqual(docs.cleanOps([{ insert: { image: 'http://x' } }]), null);
});

(async () => {
  for (const [name, fn] of todo) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }
  console.log(`\n${pass} passed, ${fail} failed`);
  require('fs').rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
