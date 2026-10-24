const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ['txt', 'md', 'docx'], default: 'docx' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentVersion: { type: Number, default: 1 },
  ops: { type: [mongoose.Schema.Types.Mixed], default: [{ insert: '\n' }] }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
