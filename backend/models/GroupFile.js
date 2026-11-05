const mongoose = require('mongoose');

// Files shared in a group's "Files" section (separate from chat messages and from documents).
const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalName: { type: String, required: true, maxlength: 150 },
  storedName: { type: String, required: true },          // random name on disk, never the user's file name
  ext: { type: String, required: true },
  mimeType: { type: String, required: true },            // decided by the server from the real content
  kind: { type: String, enum: ['image', 'document', 'other'], default: 'other' },
  size: { type: Number, required: true }
}, { timestamps: true });

schema.index({ groupId: 1, createdAt: -1 });
module.exports = mongoose.model('GroupFile', schema);
