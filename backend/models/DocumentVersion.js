const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  version: { type: Number, required: true },
  ops: { type: [mongoose.Schema.Types.Mixed], default: [] },
  file: { _id: false, storedName: String, originalName: String, mimeType: String, size: Number },   // file of this version (uploaded original, or a replaced pdf / image)
  savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, default: '' }
}, { timestamps: true });

versionSchema.index({ documentId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('DocumentVersion', versionSchema);
