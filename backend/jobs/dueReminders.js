// Checks every minute for tasks whose deadline is close (or passed) and tells the assignee and the group - once per task.
const Task = require('../models/Task');
require('../models/User');   // populate('assignedTo') needs the model registered
require('../models/Group');
const { notifyUser, postSystemMessage, fmtDate } = require('../utils_notify');

const SOON_HOURS = Number(process.env.DUE_SOON_HOURS) || 24;

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
    .populate('assignedTo', 'username');
  for (const t of soon) {
    // claim first so two runs can never send the same reminder twice
    const claim = await Task.updateOne({ _id: t._id, notifiedDueSoon: false }, { $set: { notifiedDueSoon: true } });
    if (claim.modifiedCount !== 1) continue;
    const left = inWords(t.dueDate - now);
    await postSystemMessage(io, t.groupId, t.assignedTo._id, `⏰ Reminder: “${t.title}” assigned to ${t.assignedTo.username} is due in ${left} (${fmtDate(t.dueDate)}).`);
    await notifyUser(io, { userId: t.assignedTo._id, type: 'task_due_soon', title: 'Task due soon', body: `“${t.title}” is due in ${left} (${fmtDate(t.dueDate)}).`, link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: t.groupId });
    sent++;
  }

  // 2) overdue
  const late = await Task.find({ status: { $ne: 'Completed' }, notifiedOverdue: false, dueDate: { $lte: now } }).populate('assignedTo', 'username');
  for (const t of late) {
    const claim = await Task.updateOne({ _id: t._id, notifiedOverdue: false }, { $set: { notifiedOverdue: true, notifiedDueSoon: true } });
    if (claim.modifiedCount !== 1) continue;
    await postSystemMessage(io, t.groupId, t.assignedTo._id, `⚠️ “${t.title}” assigned to ${t.assignedTo.username} is overdue (was due ${fmtDate(t.dueDate)}).`);
    await notifyUser(io, { userId: t.assignedTo._id, type: 'task_overdue', title: 'Task overdue', body: `“${t.title}” was due ${fmtDate(t.dueDate)}.`, link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: t.groupId });
    sent++;
  }
  return sent;
}

function start(io) {
  const tick = () => runOnce(io).catch((e) => console.error('Reminder job failed:', e.message));
  tick();
  return setInterval(tick, 60000);
}

module.exports = { start, runOnce };
