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
// phases: either a list of names, or a count (2-100); default is the 8 standard phases
function buildPhases(body) {
  let names;
  if (body.stages === undefined && body.phaseCount === undefined) return [];        // none: the assignee plans them
  if (Array.isArray(body.stages) && body.stages.length) names = body.stages.map((n) => String(n).trim()).filter(Boolean);
  else if (body.phaseCount !== undefined && body.phaseCount !== '') {
    const n = Number(body.phaseCount);
    if (!Number.isInteger(n)) return null;
    names = n === DEFAULT_STAGES.length ? DEFAULT_STAGES.slice() : Array.from({ length: Math.max(0, Math.min(n, 1000)) }, (_, i) => `Phase ${i + 1}`);
  } else names = DEFAULT_STAGES.slice();
  if (names.length < 2 || names.length > 100 || names.some((x) => x.length > 60)) return null;
  return names;
}
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

    const stageNames = buildPhases(req.body);
    if (!stageNames) return res.status(400).json({ message: 'A task needs between 2 and 100 phases (names up to 60 characters)' });
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
    const membership = await getMembership(task.groupId, req.user._id);
    const mayOpenFiles = canManage(membership) || String(task.assignedTo) === String(req.user._id);
    const activity = (await TaskActivity.find({ taskId: task._id }).populate('userId', 'username').sort({ createdAt: -1 })).map((a) => {
      const o = a.toObject();
      if (!mayOpenFiles && o.file && o.file.filename) { o.file = undefined; o.fileHidden = true; }
      return o;
    });
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
    res.json({ ...t, myRole: ctx.membership.role });
  } catch (error) { err(res, error); }
};

const recount = (task) => {
  const done = task.stages.filter((s) => s.done).length;
  const working = task.stages.some((s) => s.state === 'in_progress');
  return done > 0 && done === task.stages.length ? 'Completed' : (done > 0 || working) ? 'In Progress' : 'To Do';
};

// PUT /api/tasks/:id/phases  { phases: [{ _id?, name, description }] }   - ONLY the assignee
// The assigned person decides how many phases the work needs (2-100) and describes each one.
// Completed phases stay as they are; the rest of the plan is replaced by the list sent.
const planPhases = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const { task } = ctx;
    if (!task.assignedTo._id.equals(req.user._id)) return res.status(403).json({ message: 'Only the person this task is assigned to can plan its phases' });
    if (task.status === 'Completed') return res.status(409).json({ message: 'This task is already completed' });
    if (!Array.isArray(req.body.phases)) return res.status(400).json({ message: 'phases must be a list' });

    const doneStages = task.stages.filter((s) => s.done);
    const pendingById = new Map(task.stages.filter((s) => !s.done).map((s) => [String(s._id), s]));
    const doneIds = new Set(doneStages.map((s) => String(s._id)));
    const next = [];
    for (const p of req.body.phases.slice(0, 200)) {
      const name = typeof (p && p.name) === 'string' ? p.name.trim() : '';
      const description = typeof (p && p.description) === 'string' ? p.description.trim() : '';
      if (!name || name.length > 60) return res.status(400).json({ message: 'Every phase needs a name of up to 60 characters' });
      if (description.length > 300) return res.status(400).json({ message: 'A phase description can be at most 300 characters' });
      if (p._id && doneIds.has(String(p._id))) return res.status(400).json({ message: 'Completed phases cannot be changed' });
      const old = p._id && pendingById.get(String(p._id));
      next.push(old ? { _id: old._id, name, description, state: old.state, done: false } : { name, description, state: 'pending', done: false });
    }
    const total = doneStages.length + next.length;
    if (total < 2 || total > 100) return res.status(400).json({ message: 'A task needs between 2 and 100 phases' });

    const first = task.stages.length === 0;
    task.stages = [...doneStages.map((s) => s.toObject()), ...next];
    task.status = recount(task);
    await task.save();
    await TaskActivity.create({ taskId: task._id, userId: req.user._id, action: 'plan_updated', comment: `${total} phases planned` });

    const io = req.app.get('io');
    if (first) {
      await postSystemMessage(io, task.groupId._id, req.user._id, `🗂️ ${req.user.username} planned ${total} phases for “${task.title}”.`);
      if (task.createdBy && String(task.createdBy) !== String(req.user._id)) {
        await notifyUser(io, { userId: task.createdBy, type: 'task_plan', title: 'Phases planned',
          body: `${req.user.username} planned ${total} phases for “${task.title}”.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId._id });
      }
    }
    if (io) io.to(String(task.groupId._id)).emit('taskUpdated', { taskId: task._id });
    res.json({ ok: true, phases: task.stages.length, status: task.status });
  } catch (error) { err(res, error); }
};

// POST /api/tasks/:id/updates  (multipart: stageId, action = working | done, comment, proofType, proof) - ONLY the assignee
// The assignee says which phase they are on ("working") and which phase is OK ("done").
const addUpdate = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    const { task } = ctx;
    if (!task.assignedTo._id.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the person this task is assigned to can update its progress' });
    }
    if (task.stages.length < 2) return res.status(409).json({ message: 'Plan your phases first (a task needs 2 to 100 phases).' });

    const action = req.body.action === 'working' ? 'working' : 'done';
    let stage = null;
    if (isId(req.body.stageId)) stage = task.stages.id(req.body.stageId);
    else if (req.body.stage) stage = task.stages.find((s) => !s.done && s.name === req.body.stage);
    else stage = task.stages.find((s) => s.state === 'in_progress') || task.stages.find((s) => !s.done);
    if (!stage) return res.status(404).json({ message: 'Phase not found' });
    if (stage.done) return res.status(409).json({ message: 'That phase is already completed' });

    const number = task.stages.indexOf(stage) + 1, total = task.stages.length;
    const oldStatus = task.status;
    const comment = String(req.body.comment || '').slice(0, 500);
    const io = req.app.get('io');
    const creator = task.createdBy && String(task.createdBy) !== String(req.user._id) ? task.createdBy : null;

    if (action === 'working') {
      task.stages.forEach((s) => { if (s.state === 'in_progress') s.state = 'pending'; });
      stage.state = 'in_progress';
      task.status = recount(task);
      await task.save();
      await TaskActivity.create({ taskId: task._id, userId: req.user._id, action: 'stage_working', stage: stage.name, stageId: String(stage._id), comment });
      if (creator) await notifyUser(io, { userId: creator, type: 'task_update', title: 'Phase started',
        body: `${req.user.username} is working on phase ${number} of ${total}, “${stage.name}”, of “${task.title}”.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId._id });
    } else {
      stage.done = true; stage.state = 'done'; stage.doneAt = new Date(); stage.doneBy = req.user._id;
      stage.proofType = ['Photo', 'Document', 'File'].includes(req.body.proofType) ? req.body.proofType : stage.proofType;
      task.status = recount(task);
      await task.save();
      const entry = { taskId: task._id, userId: req.user._id, action: 'stage_update', stage: stage.name, stageId: String(stage._id), comment, proofType: stage.proofType };
      if (req.file) entry.file = { filename: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size };
      await TaskActivity.create(entry);
      if (oldStatus !== task.status) await TaskActivity.create({ taskId: task._id, userId: req.user._id, action: 'status_changed', from: oldStatus, to: task.status });
      if (creator) await notifyUser(io, { userId: creator, type: 'task_update', title: req.file ? 'Document uploaded' : 'Phase completed',
        body: `${req.user.username} completed phase ${number} of ${total}, “${stage.name}”, of “${task.title}”${req.file ? ` and uploaded “${req.file.originalname}”` : ''}.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId._id });
      if (task.status === 'Completed' && oldStatus !== 'Completed') {
        await postSystemMessage(io, task.groupId._id, req.user._id, `✅ ${req.user.username} completed “${task.title}”.`);
        if (creator) await notifyUser(io, { userId: creator, type: 'task_completed', title: 'Task completed',
          body: `${req.user.username} completed all ${total} phases of “${task.title}”.`, link: `/pages/tasks.html?id=${task._id}`, taskId: task._id, groupId: task.groupId._id });
      }
    }
    if (io) io.to(String(task.groupId._id)).emit('taskUpdated', { taskId: task._id });
    res.status(201).json({ ok: true, status: task.status, action });
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

// GET /api/tasks/:id/files/:activityId[?inline=1]
// Uploaded documents can be opened by the assignee and by group Admins / Managers only.
const INLINE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };
const downloadFile = async (req, res) => {
  try {
    const ctx = await loadTaskFor(req, res); if (!ctx) return;
    if (!canManage(ctx.membership) && !ctx.task.assignedTo._id.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the assignee and group Admins or Managers can open uploaded files' });
    }
    if (!isId(req.params.activityId)) return res.status(404).json({ message: 'File not found' });
    const act = await TaskActivity.findOne({ _id: req.params.activityId, taskId: ctx.task._id });
    if (!act || !act.file || !act.file.filename) return res.status(404).json({ message: 'File not found' });
    const file = path.join(__dirname, '..', 'uploads', path.basename(act.file.filename));
    const ext = path.extname(file).toLowerCase();
    if (req.query.inline === '1' && INLINE[ext]) {            // safe types can be previewed in the browser
      res.set({ 'Content-Type': INLINE[ext], 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
      return res.sendFile(file);
    }
    res.download(file, act.file.originalName);
  } catch (error) { err(res, error); }
};

module.exports = { getTasks, createTask, updateTask, getTaskActivity, getTask, addUpdate, planPhases, addComment, downloadFile };
