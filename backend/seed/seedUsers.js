// Creates test users in the local database.
//
//   node seed/seedUsers.js                       (reads seed/names.txt, password Test@12345)
//   node seed/seedUsers.js --password MyPass123  (choose the shared test password)
//   node seed/seedUsers.js --friends all         (also make everyone friends with everyone)
//   node seed/seedUsers.js --group "3rd year cse B" --admin "Bexalin B A"
//                                                (also create an encrypted group; the admin becomes its Admin,
//                                                 everyone else a Member, and the admin is friends with all of them)
//   add --recreate to rebuild a group that already exists (names.txt: use "Name | Admin" or "Name | Manager" for roles)
//   node seed/seedUsers.js --no-keys             (skip encryption keys; each user then creates them on first login)
//
// Safe to run again: users that already exist are skipped.
// TEST DATA ONLY: for speed the encryption keys are generated here, so don't use this for real accounts.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i === -1 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

const ROLES = ['Admin', 'Manager', 'Member'];

// each line is "Name" or "Name | Role"  (Role = Admin, Manager or Member; default Member)
function parseEntries(text) {
  const seen = new Set(), out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [namePart, rolePart] = line.split('|').map((x) => x.trim());
    const name = namePart;
    const role = rolePart ? ROLES.find((r) => r.toLowerCase() === rolePart.toLowerCase()) : 'Member';
    if (!role) throw new Error(`Unknown role "${rolePart}" for "${name}" (use Admin, Manager or Member)`);
    if (name.length < 2 || name.length > 30 || /[<>"'&]/.test(name)) throw new Error(`Invalid name: "${name}" (2-30 characters, no < > " ' &)`);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate name in the list: "${name}"`);
    seen.add(key); out.push({ name, role });
  }
  return out;
}

const parseNames = (text) => parseEntries(text).map((e) => e.name);

function emailFor(name, used) {
  let base = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '') || 'user';
  let slug = base, n = 2;
  while (used.has(slug)) slug = `${base}${n++}`;
  used.add(slug);
  return `${slug}@test.local`;
}

// One group key, wrapped separately for every member (same scheme the app uses in the browser)
function buildGroupKeys(E2EE, admin, members) {
  const groupKey = E2EE.newGroupKey();
  const wrap = (m) => E2EE.wrapKey(groupKey, m.publicKey, admin.sk, admin.pk);
  return { adminKey: wrap({ publicKey: admin.pk }), memberKeys: members.map((m) => ({ id: m.id, role: m.role || 'Member', key: wrap(m) })) };
}

module.exports = { parseNames, parseEntries, emailFor, buildGroupKeys };
if (require.main !== module) return;

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed test users when NODE_ENV=production.'); process.exit(1); }
  const file = path.resolve(opt('file', path.join(__dirname, 'names.txt')));
  const password = opt('password', 'Test@12345');
  const withKeys = !args.includes('--no-keys');
  if (typeof password !== 'string' || password.length < 6) { console.error('Password must be at least 6 characters.'); process.exit(1); }

  let names, entries;
  try { entries = parseEntries(fs.readFileSync(file, 'utf8')); names = entries.map((e) => e.name); } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
  if (!names.length) { console.error(`❌ No names found in ${file}. Add one name per line and run again.`); process.exit(1); }

  const mongoose = require('mongoose');
  const User = require('../models/User');
  const Friendship = require('../models/Friendship');
  let E2EE = null;
  if (withKeys) { globalThis.nacl = require('tweetnacl'); E2EE = require('../../frontend/js/e2ee.js'); }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const usedSlugs = new Set((await User.find().select('email')).map((u) => u.email.replace('@test.local', '')));
  const rows = [], all = [];
  for (const name of names) {
    const existing = await User.findOne({ username: name });
    if (existing) { all.push(existing._id); rows.push({ name, email: existing.email, status: 'already existed' }); continue; }
    const doc = { username: name, email: emailFor(name, usedSlugs), password };
    if (E2EE) { const k = E2EE.genKeys(); doc.publicKey = k.pk; doc.keyBackup = E2EE.backup(k.sk, password); }
    const u = await User.create(doc);            // password is hashed by the model
    all.push(u._id); rows.push({ name, email: u.email, status: 'created' });
    process.stdout.write('.');
  }
  console.log();

  if (opt('friends', 'none') === 'all') {
    const pairs = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) pairs.push({ requester: all[i], recipient: all[j], status: 'accepted' });
    try { await Friendship.insertMany(pairs, { ordered: false }); } catch (e) { /* pairs that already exist are skipped */ }
    console.log(`Friendships ensured for ${all.length} users.`);
  }

  const groupName = opt('group', null), adminName = opt('admin', null);
  if (groupName && typeof groupName === 'string') {
    if (!E2EE) { console.error('❌ --group needs encryption keys, so do not combine it with --no-keys.'); process.exit(1); }
    const Group = require('../models/Group');
    const GroupMember = require('../models/GroupMember');
    const admin = await User.findOne({ username: typeof adminName === 'string' ? adminName : names[0] });
    if (!admin) { console.error('❌ --admin user was not found. It must be one of the names in the list.'); process.exit(1); }
    const roleOf = new Map(entries.map((e) => [e.name, e.role]));
    const old = await Group.findOne({ name: groupName, createdBy: admin._id });
    if (old && !args.includes('--recreate')) {
      console.log(`Group "${groupName}" already exists, so it was left unchanged.\nTo rebuild it with the current names and roles, run again with --recreate (this deletes that group and its messages).`);
    } else {
      if (old) {
        await require('../models/Message').deleteMany({ groupId: old._id });
        await GroupMember.deleteMany({ groupId: old._id });
        await Group.deleteOne({ _id: old._id });
        console.log(`Old group "${groupName}" deleted.`);
      }
      // the admin's private key comes from their password-protected backup (they were created with the shared password)
      const sk = admin.keyBackup && admin.keyBackup.cipher ? E2EE.unlock(admin.keyBackup, password) : null;
      if (!sk || !admin.publicKey) { console.error('❌ Could not unlock the admin\'s keys with this password. Use the same --password they were created with.'); process.exit(1); }
      const members = (await User.find({ username: { $in: names }, _id: { $ne: admin._id } })).filter((u) => u.publicKey).map((u) => ({ id: u._id, publicKey: u.publicKey, role: roleOf.get(u.username) || 'Member' }));
      const { adminKey, memberKeys } = buildGroupKeys(E2EE, { sk, pk: admin.publicKey }, members);
      const group = await Group.create({ name: groupName, description: '', createdBy: admin._id });
      await GroupMember.insertMany([
        { groupId: group._id, userId: admin._id, role: 'Admin', keys: [{ version: 1, ...adminKey }] },
        ...memberKeys.map((m) => ({ groupId: group._id, userId: m.id, role: m.role, keys: [{ version: 1, ...m.key }] }))
      ]);
      // the admin must be friends with the members to add more people later
      try { await Friendship.insertMany(members.map((m) => ({ requester: admin._id, recipient: m.id, status: 'accepted' })), { ordered: false }); } catch (e) { /* already friends */ }
      const count = (r) => memberKeys.filter((m) => m.role === r).length;
      console.log(`✅ Group "${groupName}" created, end-to-end encrypted: Admins ${1 + count('Admin')} (incl. ${admin.username}), Managers ${count('Manager')}, Members ${count('Member')}.`);
    }
  }

  console.table(rows);
  console.log(`\nLogin with the username or the email shown above.\nShared test password: ${password}`);
  if (!E2EE) console.log('No keys were created: each user must log in once before being added to groups.');
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); });
