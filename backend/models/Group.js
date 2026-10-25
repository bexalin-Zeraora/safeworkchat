const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  // one-to-one chat between two friends (hidden from task / document / group pickers)
  isDirect: { type: Boolean, default: false },
  directKey: { type: String, unique: true, sparse: true },
  keyVersion: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);