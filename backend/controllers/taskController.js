const Task = require('../models/Task');
const TaskActivity = require('../models/TaskActivity');
const GroupMember = require('../models/GroupMember');
const path = require('path');
const { notifyUser, postSystemMessage, fmtDate } = require('../utils_notify');
const { DEFAULT_STAGES } = Task;

const STATUSES = ['To Do', 'In Progress', 'Completed'];
const PRIORITIES = ['Low', 'Medium', 'High'];

const getMembership = (groupId, userId) => GroupMember.findOne({ groupId, userId });
const canManage = (m) => m && (m.role === 'Admin' || m.role === 'Manager');
const err = (res, e) => res.status(500).json({ message: 'Server error', error: e.message });
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

// GET /api/tasks?groupId=&from=&to=&mine=1
//   mine=1 -> only tasks assigned to the logged-in user (calendar, dashboard)
const getTasks = async (req, res) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user._id });
    let groupIds = memberships.map((m) => m.groupId);

    if (req.query.groupId) {
      if (!groupIds.some((id) => id.equals(req.query.groupId))) {
        return res.status(403).json({ message: 'Not a member of this group' });
      }
      groupIds = [req.query.groupId];
    }

    const filter = { groupId: { $in: groupIds } };
    if (req.query.mine === '1') filter.assignedTo = req.user._id;
    if (req.query.from || req.query.to) {
      filter.dueDate = {};
      if (req.query.from) filter.dueDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.dueDate.$lte = new Date(req.query.to);
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'username')
      .populate('groupId', 'name')
      .sort({ dueDate: 1 });

    const roleByGroup = Object.fromEntries(memberships.map((m) => [String(m.groupId), m.role]));
    res.json(tasks.map((t) => ({ ...t.toObject(), myRole: roleByGroup[String(t.groupId._id)] })));
  } catch (error) { err(res, error); }
};

// POST /api/tasks  (Admin / Manager only)
// -> notifies the assignee and posts a notice in the group chat
const createTask = async (req, res) => {
  try {
    const { groupId, title, description, assignedTo, priority, dueDate } = req.body;
    if (!isId(groupId) || typeof title !== 'string' || !title.trim() || !isId(assignedTo) || !dueDate || isNaN(new Date(dueDate))) {
      return res.status(400).json({ message: 'groupId, title, assignedTo and dueDate are required' });
    }
    if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ message: 'Invalid priority' });
    if (!canManage(await getMembership(groupId, req.user._id))) {
      return res.status(403).json({ message: 'Only group Admins or Managers can create tasks' });
    }
    if (!(await getMembership(groupId, assignedTo))) {
      return res.status(400).json({ message: 'Assignee is not a member of this group' });
    }

    const stageNames = Array.isArray(req.body.stages) && req.body.stages.length
      ? req.body.stages.map((n) => String(n).trim()).filter(Boolean).slice(0, 15) : DEFAULT_STAGES;
    const task = await Task.create({
      groupId, title: title.trim(), description, assignedTo, priority, dueDate, createdBy: req.user._id,
      stages: stageNames.map((name) => ({ name }))
    });
    await TaskActivity.create({ taskId: task._id, userId: req.user._id, action: 'created', to: task.status });

    const io = req.app.get('io');
    const assignee = await require('../models/User').findById(assignedTo).select('username');
    await postSystemMessage(io, groupId, req.user._id,
      `📌 ${req.user.username} assigned “${task.title}” to ${assignee.username} · ${task.priority} priority · due ${fmtDate(task.dueDate)}.`);
    if (String(assignedTo) !== String(req.user._id)) {
      await notifyUser(io, { userId: assignedTo, type: 'task_assigned', title: 'New task assigned to you',
        body: `${req.user.username} assigned you “${task.title}” · due ${fmtDate(task.dueDate)}.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId });
    }
    if (io) io.to(String(groupId)).emit('taskUpdated', { taskId: task._id });

    res.status(201).json(task);
  } catch (error) { err(res, error); }
};

// PATCH /api/tasks/:id
//   progress / status : ONLY the person the task is assigned to
//   details (title, priority, deadline, assignee) : Admin / Manager
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('assignedTo', 'username');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const membership = await getMembership(task.groupId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not a member of this group' });

    const manager = canManage(membership);
    const isAssignee = task.assignedTo._id.equals(req.user._id);
    const { status, dueDate, assignedTo, priority, title, description } = req.body;
    const log = [];
    const io = req.app.get('io');

    if (status !== undefined && status !== task.status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
      if (!isAssignee) return res.status(403).json({ message: 'Only the person this task is assigned to can update its progress' });
      log.push({ action: 'status_changed', from: task.status, to: status });
      task.status = status;
    }

    const detailEdits = dueDate !== undefined || assignedTo !== undefined || priority !== undefined || title !== undefined || description !== undefined;
    if (detailEdits && !manager) return res.status(403).json({ message: 'Only group Admins or Managers can edit task details' });

    let reassignedTo = null;
    if (dueDate !== undefined && (isNaN(new Date(dueDate)) || new Date(dueDate).getTime() !== task.dueDate.getTime())) {
      if (isNaN(new Date(dueDate))) return res.status(400).json({ message: 'Invalid deadline' });
      log.push({ action: 'rescheduled', from: task.dueDate.toISOString(), to: new Date(dueDate).toISOString() });
      task.dueDate = dueDate;
      task.notifiedDueSoon = false; task.notifiedOverdue = false;   // new deadline -> reminders start again
    }
    if (assignedTo !== undefined && !task.assignedTo._id.equals(assignedTo)) {
      if (!isId(String(assignedTo)) || !(await getMembership(task.groupId, assignedTo))) {
        return res.status(400).json({ message: 'Assignee is not a member of this group' });
      }
      log.push({ action: 'reassigned', from: String(task.assignedTo._id), to: String(assignedTo) });
      reassignedTo = assignedTo;
      task.assignedTo = assignedTo;
    }
    if (priority !== undefined) {
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ message: 'Invalid priority' });
      task.priority = priority;
    }
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;

    const oldAssigneeName = task.assignedTo.username;
    await task.save();
    if (log.length) await TaskActivity.insertMany(log.map((l) => ({ ...l, taskId: task._id, userId: req.user._id })));

    if (reassignedTo) {
      const newUser = await require('../models/User').findById(reassignedTo).select('username');
      await postSystemMessage(io, task.groupId, req.user._id, `🔁 ${req.user.username} reassigned “${task.title}” from ${oldAssigneeName} to ${newUser.username} · due ${fmtDate(task.dueDate)}.`);
      if (String(reassignedTo) !== String(req.user._id)) {
        await notifyUser(io, { userId: reassignedTo, type: 'task_reassigned', title: 'A task was assigned to you',
          body: `${req.user.username} assigned you “${task.title}” · due ${fmtDate(task.dueDate)}.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId });
      }
    }
    if (io) io.to(String(task.groupId)).emit('taskUpdated', { taskId: task._id });
    res.json(task);
  } catch (error) { err(res, error); }
};

// GET /api/tasks/:id/activity
const getTaskActivity = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!(await getMembership(task.groupId, req.user._id))) return res.status(403).json({ message: 'Not a member of this group' });
    const activity = await TaskActivity.find({ taskId: task._id }).populate('userId', 'username').sort({ createdAt: -1 });
    res.json(activity);
  } catch (error) { err(res, error); }
};

// helper: load task + membership or send error
async function loadTaskFor(req, res) {
  if (!isId(req.params.id)) { res.status(404).json({ message: 'Task not found' }); return null; }
  const task = await Task.findById(req.params.id).populate('assignedTo', 'username').populate('groupId', 'name');
  if (!task) { res.status(404).json({ message: 'Task not found' }); return null; }
  const membership = await getMembership(task.groupId._id, req.user._id);
  if (!membership) { res.status(403).json({ message: 'Not a member of this group' }); return null; }
  return { task, membership };
}

// GET /api/tasks/:id
const getTask = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const t = ctx.task.toObject();
    if (!t.stages || !t.stages.length) t.stages = DEFAULT_STAGES.map((name) => ({ name, done: false }));
    res.json({ ...t, myRole: ctx.membership.role });
  } catch (error) { err(res, error); }
};

// POST /api/tasks/:id/updates  (multipart: stage, comment, proofType, proof) - ONLY the assignee
const addUpdate = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const { task } = ctx;
    if (!task.assignedTo._id.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the person this task is assigned to can update its progress' });
    }
    if (!task.stages || !task.stages.length) task.stages = DEFAULT_STAGES.map((name) => ({ name }));
    const stage = task.stages.find((s) => s.name === req.body.stage);
    if (!stage) return res.status(400).json({ message: 'Unknown stage' });

    const wasDone = stage.done;
    stage.done = true; stage.doneAt = new Date(); stage.doneBy = req.user._id;
    stage.proofType = ['Photo', 'Document', 'File'].includes(req.body.proofType) ? req.body.proofType : stage.proofType;

    const doneCount = task.stages.filter((s) => s.done).length;
    const newStatus = doneCount === task.stages.length ? 'Completed' : doneCount > 0 ? 'In Progress' : 'To Do';
    const oldStatus = task.status;
    task.status = newStatus;
    await task.save();

    const entry = { taskId: task._id, userId: req.user._id, action: 'stage_update', stage: stage.name,
      comment: String(req.body.comment || '').slice(0, 500), proofType: stage.proofType };
    if (req.file) entry.file = { filename: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size };
    await TaskActivity.create(entry);
    if (oldStatus !== newStatus) {
      await TaskActivity.create({ taskId: task._id, userId: req.user._id, action: 'status_changed', from: oldStatus, to: newStatus });
    }

    const io = req.app.get('io');
    if (newStatus === 'Completed' && oldStatus !== 'Completed') {
      await postSystemMessage(io, task.groupId._id, req.user._id, `✅ ${req.user.username} completed “${task.title}”.`);
      const creator = task.createdBy;
      if (creator && String(creator) !== String(req.user._id)) {
        await notifyUser(io, { userId: creator, type: 'task_completed', title: 'Task completed',
          body: `${req.user.username} completed “${task.title}”.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId._id });
      }
    }
    if (io) io.to(String(task.groupId._id)).emit('taskUpdated', { taskId: task._id });
    res.status(201).json({ ok: true, replaced: wasDone, status: newStatus });
  } catch (error) { err(res, error); }
};

// POST /api/tasks/:id/comments  (any group member)
const addComment = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const text = String(req.body.comment || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ message: 'Comment is empty' });
    await TaskActivity.create({ taskId: ctx.task._id, userId: req.user._id, action: 'comment', comment: text });
    res.status(201).json({ ok: true });
  } catch (error) { err(res, error); }
};

// GET /api/tasks/:id/files/:activityId  (membership-checked download)
const downloadFile = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const act = await TaskActivity.findOne({ _id: req.params.activityId, taskId: ctx.task._id });
    if (!act || !act.file || !act.file.filename) return res.status(404).json({ message: 'File not found' });
    res.download(path.join(__dirname, '..', 'uploads', path.basename(act.file.filename)), act.file.originalName);
  } catch (error) { err(res, error); }
};

module.exports = { getTasks, createTask, updateTask, getTaskActivity, getTask, addUpdate, addComment, downloadFile };
