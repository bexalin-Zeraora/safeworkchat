const mongoose = require('mongoose');

const DEFAULT_STAGES = ['Started', 'Setup Environment', 'Database Integration', 'API Development', 'Testing', 'Code Review', 'Deployment', 'Completed'];

const taskSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['To Do', 'In Progress', 'Completed'], default: 'To Do' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  dueDate: { type: Date, required: true },
  // reminder bookkeeping: each reminder is sent once (reset when the deadline changes)
  notifiedDueSoon: { type: Boolean, default: false },
  notifiedOverdue: { type: Boolean, default: false },
  stages: {
    type: [{
      name: { type: String, required: true, maxlength: 60 },
      description: { type: String, default: '', maxlength: 300 },
      // pending -> in_progress ("I am working on this phase") -> done ("this phase is OK")
      state: { type: String, enum: ['pending', 'in_progress', 'done'], default: 'pending' },
      done: { type: Boolean, default: false },
      proofType: { type: String, default: '' },
      doneAt: Date,
      doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    default: () => []     // the assigned person plans the phases themselves (2-100)
  },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
module.exports.DEFAULT_STAGES = DEFAULT_STAGES;