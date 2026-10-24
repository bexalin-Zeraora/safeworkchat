const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['task_assigned', 'task_reassigned', 'task_due_soon', 'task_overdue', 'task_completed'], required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, default: '', maxlength: 300 },
  link: { type: String, default: '' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

// stays in the database until the user reads it, so it survives logout / restarts
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
