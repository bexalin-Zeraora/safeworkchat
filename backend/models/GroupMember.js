const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['Admin', 'Manager', 'Member'], default: 'Member' },
  // Group key wrapped for this member (only this member's private key can open it)
  // One wrapped copy of every group key version this member may read (a new key is made whenever someone joins)
  keys: [{ _id: false, version: Number, wrapped: String, nonce: String, senderPk: String }],
  joinedAt: { type: Date, default: Date.now }
});

// Ensure a user can only be added to a group once
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', groupMemberSchema);