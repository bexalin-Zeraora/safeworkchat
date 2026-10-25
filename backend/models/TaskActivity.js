const mongoose = require('mongoose');

const taskActivitySchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // created | status_changed | reassigned | rescheduled
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  stage: { type: String, default: '' },
  stageId: { type: String, default: '' },
  comment: { type: String, default: '' },
  proofType: { type: String, default: '' },
  file: { filename: String, originalName: String, mimetype: String, size: Number }
}, { timestamps: true });

module.exports = mongoose.model('TaskActivity', taskActivitySchema);
