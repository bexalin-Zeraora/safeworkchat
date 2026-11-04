// Checks every minute for tasks whose deadline is close (or passed) and tells the assignee and the group - once per task.
const Task = require('../models/Task');
require('../models/User');   // populate('assignedTo') needs the model registered
require('../models/Group');
const { notifyUser, postSystemMessage, fmtDate } = require('../utils_notify');

const SOON_HOURS = Number(process.env.DUE_SOON_HOURS) || 24;
const User = require('../models/User');
const INACTIVE_DAYS = Number(process.env.INACTIVE_EMAIL_DAYS) || 7;
const { sendEmail } = require('../utils_email');
let lastInactiveCheckAt = 0;

function inWords(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} hour${hrs === 1 ? '' : 's'}` : `${Math.round(hrs / 24)} days`;
}

async function runOnce(io, now = new Date()) {
  let sent = 0;

  // 1) due soon (within SOON_HOURS)
  const soon = await Task.find({ status: { $ne: 'Completed' }, notifiedDueSoon: false, dueDate: { $gt: now, $lte: new Date(now.getTime() + SOON_HOURS * 3600000) } })
    .populate('assignedTo', 'username email');
  for (const t of soon) {
    // claim first so two runs can never send the same reminder twice
    const claim = await Task.updateOne({ _id: t._id, notifiedDueSoon: false }, { $set: { notifiedDueSoon: true } });
    if (claim.modifiedCount !== 1) continue;
    const left = inWords(t.dueDate - now);
    await postSystemMessage(io, t.groupId, t.assignedTo._id, `⏰ Reminder: “${t.title}” assigned to ${t.assignedTo.username} is due in ${left} (${fmtDate(t.dueDate)}).`, `/pages/tasks.html?id=${t._id}`);
    await notifyUser(io, { userId: t.assignedTo._id, type: 'task_due_soon', title: 'Task due soon', body: `“${t.title}” is due in ${left} (${fmtDate(t.dueDate)}).`, link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: t.groupId });
    if (t.assignedTo.email) sendEmail({ to: t.assignedTo.email, subject: `SafeWorkChat deadline approaching: ${t.title}`, text: `Hello ${t.assignedTo.username},\n\nYour task “${t.title}” is due in ${left}.\nDeadline: ${fmtDate(t.dueDate)}\n\nPlease sign in to SafeWorkChat to update your progress.` }).catch(e => console.error('Due-soon email failed:', e.message));
    sent++;
  }

  // 2) overdue
  const late = await Task.find({ status: { $ne: 'Completed' }, notifiedOverdue: false, dueDate: { $lte: now } }).populate('assignedTo', 'username email');
  for (const t of late) {
    const claim = await Task.updateOne({ _id: t._id, notifiedOverdue: false }, { $set: { notifiedOverdue: true, notifiedDueSoon: true } });
    if (claim.modifiedCount !== 1) continue;
    await postSystemMessage(io, t.groupId, t.assignedTo._id, `⚠️ “${t.title}” assigned to ${t.assignedTo.username} is overdue (was due ${fmtDate(t.dueDate)}).`, `/pages/tasks.html?id=${t._id}`);
    await notifyUser(io, { userId: t.assignedTo._id, type: 'task_overdue', title: 'Task overdue', body: `“${t.title}” was due ${fmtDate(t.dueDate)}.`, link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: t.groupId });
    if (t.assignedTo.email) sendEmail({ to: t.assignedTo.email, subject: `Overdue SafeWorkChat task: ${t.title}`, text: `Hello ${t.assignedTo.username},\n\nYour task “${t.title}” is overdue.\nOriginal deadline: ${fmtDate(t.dueDate)}\n\nPlease sign in to SafeWorkChat and update the task.` }).catch(e => console.error('Overdue email failed:', e.message));
    sent++;
  }
  // Email users who have not used the app for the configured number of days. Repeat at most weekly.
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD || Date.now() - lastInactiveCheckAt < 6 * 60 * 60 * 1000) return sent;
  lastInactiveCheckAt = Date.now();
  const cutoff = new Date(now.getTime() - INACTIVE_DAYS * 86400000);
  const repeatBefore = new Date(now.getTime() - 7 * 86400000);
  const inactive = await User.find({ $or: [{ lastActiveAt: { $lte: cutoff } }, { lastActiveAt: { $exists: false }, createdAt: { $lte: cutoff } }], email: { $exists: true, $ne: '' }, $and: [{ $or: [{ inactivityEmailSentAt: null }, { inactivityEmailSentAt: { $lte: repeatBefore } }] }] }).select('_id username email lastActiveAt').limit(100);
  for (const u of inactive) {
    const claim = await User.updateOne({ _id: u._id, $or: [{ inactivityEmailSentAt: null }, { inactivityEmailSentAt: { $lte: repeatBefore } }] }, { $set: { inactivityEmailSentAt: now } });
    if (claim.modifiedCount !== 1) continue;
    sendEmail({ to: u.email, subject: 'We miss you on SafeWorkChat', text: `Hello ${u.username},\n\nIt has been a while since you last used SafeWorkChat. Your groups, conversations and tasks are waiting for you.\n\nSign in when you are ready to continue collaborating.` }).catch(async e => { console.error('Inactivity email failed:', e.message); await User.updateOne({ _id: u._id, inactivityEmailSentAt: now }, { $set: { inactivityEmailSentAt: null } }).catch(() => {}); });
  }
  return sent;
}

function start(io) {
  const tick = () => runOnce(io).catch((e) => console.error('Reminder job failed:', e.message));
  tick();
  return setInterval(tick, 60000);
}

module.exports = { start, runOnce };
