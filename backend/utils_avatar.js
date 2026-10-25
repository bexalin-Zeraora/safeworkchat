// Finds the uploaded profile picture (if any) for a username. Short cache so avatars load fast.
const User = require('./models/User');
const cache = new Map();   // username -> { file, at }
const TTL = 30000;

async function customAvatar(username) {
  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < TTL) return hit.file;
  const u = await User.findOne({ username }).select('avatar');
  const file = u && u.avatar ? u.avatar : '';
  if (cache.size > 2000) cache.clear();
  cache.set(username, { file, at: Date.now() });
  return file;
}
const forget = (...names) => names.forEach((n) => cache.delete(n));

module.exports = { customAvatar, forget };
