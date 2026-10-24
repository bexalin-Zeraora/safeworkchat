const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  keyVersion: { type: Number, default: 1 },
  encrypted: { type: Boolean, default: false },
  type: { type: String, enum: ['text', 'file', 'system'], default: 'text' },
}, { timestamps: true });

// Index for faster message retrieval in chat
messageSchema.index({ groupId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);