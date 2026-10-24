const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  version: { type: Number, required: true },
  ops: { type: [mongoose.Schema.Types.Mixed], default: [] },
  savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, default: '' }
}, { timestamps: true });

versionSchema.index({ documentId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('DocumentVersion', versionSchema);
