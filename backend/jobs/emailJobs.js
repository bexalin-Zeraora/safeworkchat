// Scheduled e-mails (node-cron): deadline approaching, overdue, and inactive users.
// Safe to run on several servers at once: every e-mail has a unique key in NotificationLog.
const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const NotificationLog = require('../models/NotificationLog');
require('../models/Group');
const mail = require('../utils_mail');

const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
const FAKE = /@(example\.(com|org|net)|.*\.(test|local|invalid|example))$/i;   // never e-mail demo / reserved addresses

// keys we do not need to try again (already sent, or out of retries)
async function finished(keys) {
  if (!keys.length) return new Set();
  const rows = await NotificationLog.find({ key: { $in: keys }, $or: [{ status: 'sent' }, { attempts: { $gte: num(process.env.EMAIL_MAX_ATTEMPTS, 3) } }] }).select('key');
  return new Set(rows.map((r) => r.key));
}

async function emailTasks(now = new Date(), kind, tasks) {
  const type = kind === 'soon' ? 'task_due_soon' : 'task_overdue';
  const items = tasks.filter((t) => t.assignedTo && t.assignedTo.email && t.groupId && !FAKE.test(t.assignedTo.email))
    .map((t) => ({ t, key: `${type}:${t._id}:${new Date(t.dueDate).getTime()}` }));   // a new deadline = a new e-mail
  const done = await finished(items.map((i) => i.key));
  let sent = 0, budget = num(process.env.EMAIL_MAX_PER_RUN, 50);
  for (const { t, key } of items) {
    if (done.has(key)) continue;
    if (budget-- <= 0) break;
    const e = mail.taskEmail(type, { task: t, assigneeName: t.assignedTo.username, groupName: t.groupId.name });
    const r = await mail.sendOnce({ key, type, userId: t.assignedTo._id, taskId: t._id, groupId: t.groupId._id, to: t.assignedTo.email, ...e });
    if (r.status === 'sent') sent++;
  }
  return sent;
}

async function checkTasks(now = new Date()) {
  if (!mail.enabled()) return 0;
  const soonMs = num(process.env.DUE_SOON_HOURS, 24) * 3600000, lateMs = num(process.env.OVERDUE_EMAIL_DAYS, 7) * 86400000;
  const pop = (q) => q.populate('assignedTo', 'username email').populate('groupId', 'name');
  const soon = await pop(Task.find({ status: { $ne: 'Completed' }, dueDate: { $gt: now, $lte: new Date(now.getTime() + soonMs) } }));
  const late = await pop(Task.find({ status: { $ne: 'Completed' }, dueDate: { $lte: now, $gte: new Date(now.getTime() - lateMs) } }));
  return (await emailTasks(now, 'soon', soon)) + (await emailTasks(now, 'late', late));
}

// One e-mail per inactivity event. The event is identified by the last time the user was active:
// the key stays the same until the user comes back (then lastActiveAt changes and a later absence can be e-mailed again).
async function checkInactiveUsers(now = new Date()) {
  if (!mail.enabled()) return 0;
  const days = num(process.env.INACTIVITY_DAYS, 7), cutoff = new Date(now.getTime() - days * 86400000);
  const users = await User.find({ email: { $nin: ['', null] }, $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: { $exists: false }, createdAt: { $lt: cutoff } }] })
    .select('username email lastActiveAt createdAt').limit(500);
  const items = users.filter((u) => !FAKE.test(u.email)).map((u) => { const last = u.lastActiveAt || u.createdAt; return { u, last, key: `user_inactive:${u._id}:${new Date(last).getTime()}` }; });
  const done = await finished(items.map((i) => i.key));
  let sent = 0, budget = num(process.env.EMAIL_MAX_PER_RUN, 50);
  for (const { u, last, key } of items) {
    if (done.has(key)) continue;
    if (budget-- <= 0) break;
    const open = await Task.countDocuments({ assignedTo: u._id, status: { $ne: 'Completed' } });
    const e = mail.layout({
      heading: 'We have not seen you in a while', intro: `Hi ${u.username}, you have not been active on Safe WorkChat for ${days} days or more.`,
      rows: [['Last active', mail.fmtDate(last)], ['Open tasks assigned to you', String(open)]], button: { label: 'Open Safe WorkChat', url: mail.appUrl() + '/pages/dashboard.html' }
    });
    const r = await mail.sendOnce({ key, type: 'user_inactive', userId: u._id, to: u.email, subject: 'We miss you on Safe WorkChat', ...e });
    if (r.status === 'sent') sent++;
  }
  return sent;
}

function start() {
  const guard = (name, fn) => { let busy = false; return async () => { if (busy) return; busy = true; try { const n = await fn(); if (n) console.log(`📧 ${name}: ${n} e-mail(s) sent`); } catch (e) { console.error(`${name} failed:`, e.message); } finally { busy = false; } }; };
  const opts = process.env.DISPLAY_TZ ? { timezone: process.env.DISPLAY_TZ } : {};
  const sched = (expr, fallback, fn) => { const ok = cron.validate(expr || ''); if (expr && !ok) console.warn(`Invalid cron "${expr}", using "${fallback}"`); return cron.schedule(ok ? expr : fallback, fn, opts); };
  const tasksJob = guard('Task e-mails', () => checkTasks()), inactiveJob = guard('Inactivity e-mails', () => checkInactiveUsers());
  sched(process.env.EMAIL_TASK_CRON, '* * * * *', tasksJob);
  sched(process.env.INACTIVITY_CHECK_CRON, '0 * * * *', inactiveJob);
  setTimeout(() => { tasksJob(); inactiveJob(); }, 10000).unref();
  console.log(mail.enabled() ? '📧 E-mail notifications ON (task checks + inactivity checks scheduled)' : '📧 E-mail notifications OFF (set SMTP_USER and SMTP_PASS in backend/.env to turn them on)');
}

module.exports = { start, checkTasks, checkInactiveUsers };
