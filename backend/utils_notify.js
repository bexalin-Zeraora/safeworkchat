const Notification = require('./models/Notification');
const Message = require('./models/Message');

const TZ = process.env.DISPLAY_TZ || 'Asia/Kolkata';
const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });

// stored in the database (persistent) and pushed live to the user if they are online
async function notifyUser(io, data) {
  const n = await Notification.create(data);
  if (io) io.to('user:' + data.userId).emit('notification', n);
  return n;
}

// plain-text notice in the group chat (shown centred, not encrypted: it only says what happened to a task)
async function postSystemMessage(io, groupId, senderId, content) {
  const m = await Message.create({ groupId, senderId, content: String(content).slice(0, 500), type: 'system', encrypted: false });
  if (io) {
    const populated = await Message.findById(m._id).populate('senderId', 'username');
    io.to(String(groupId)).emit('receiveMessage', populated);
  }
  return m;
}

module.exports = { notifyUser, postSystemMessage, fmtDate };
