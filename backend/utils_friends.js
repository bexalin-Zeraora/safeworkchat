const Friendship = require('./models/Friendship');

// ids of everyone who has an ACCEPTED friendship with userId
async function friendIds(userId) {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ requester: userId }, { recipient: userId }] });
  return rows.map((r) => String(r.requester) === String(userId) ? String(r.recipient) : String(r.requester));
}

async function areFriends(userId, otherIds) {
  const set = new Set(await friendIds(userId));
  return otherIds.every((id) => set.has(String(id)));
}

module.exports = { friendIds, areFriends };
