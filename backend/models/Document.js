const mongoose = require('mongoose');

const fileSub = { _id: false, storedName: String, originalName: String, mimeType: String, size: Number };

const documentSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  // txt / md / docx are edited in the browser; pdf / png / jpg / webp / doc are stored files (preview + replace)
  type: { type: String, enum: ['txt', 'md', 'docx', 'pdf', 'png', 'jpg', 'webp', 'doc'], default: 'docx' },
  kind: { type: String, enum: ['text', 'pdf', 'image', 'binary'], default: 'text' },
  source: { type: String, enum: ['created', 'uploaded'], default: 'created' },
  // set for a task document: only the person the task is assigned to may edit it
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentVersion: { type: Number, default: 1 },
  ops: { type: [mongoose.Schema.Types.Mixed], default: [{ insert: '\n' }] },
  file: fileSub          // current stored file (pdf / image / doc kinds)
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
