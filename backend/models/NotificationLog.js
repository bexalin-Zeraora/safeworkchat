const mongoose = require('mongoose');

// One row per e-mail. The unique `key` is what prevents duplicates (e.g. "due_soon:<taskId>:<deadline ms>").
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, enum: ['task_assigned', 'task_due_soon', 'task_overdue', 'user_inactive', 'password_reset', 'test'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  to: { type: String, default: '' },
  subject: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  error: { type: String, default: '' },
  lastAttemptAt: Date,
  sentAt: Date
}, { timestamps: true });

schema.index({ userId: 1, type: 1, createdAt: -1 });
module.exports = mongoose.model('NotificationLog', schema);
