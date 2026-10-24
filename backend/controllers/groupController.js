const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const { cleanWrappedKey } = require('../utils_crypto');
const { areFriends } = require('../utils_friends');

const ROLES = ['Admin', 'Manager', 'Member'];
const escRe = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Create a new group
// @route   POST /api/groups
const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user._id;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    // Optional initial members: [{ userId, role }]
    const wanted = Array.isArray(req.body.members) ? req.body.members : [];
    const seen = new Set([String(userId)]);
    const picked = [];
    for (const m of wanted.slice(0, 100)) {
      const id = typeof m?.userId === 'string' ? m.userId : '';
      if (!/^[a-f0-9]{24}$/i.test(id) || seen.has(id)) continue;
      seen.add(id);
      picked.push({ userId: id, role: ROLES.includes(m.role) ? m.role : 'Member', key: cleanWrappedKey(m.key) });
    }
    const valid = await User.find({ _id: { $in: picked.map((p) => p.userId) } }).select('_id');
    const validIds = new Set(valid.map((u) => String(u._id)));
    if (!(await areFriends(userId, [...validIds]))) {
      return res.status(403).json({ message: 'You can only add people who are your friends' });
    }

    // New groups are always end-to-end encrypted: every member needs a wrapped copy of the group key
    const myKey = cleanWrappedKey(req.body.myKey);
    const extraMembers = picked.filter((p) => validIds.has(p.userId));
    if (!myKey || extraMembers.some((p) => !p.key)) {
      return res.status(400).json({ message: 'Encryption keys are missing for the creator or a member' });
    }

    // 1. Create the group
    const group = await Group.create({
      name: name.trim(),
      description: typeof description === 'string' ? description : '',
      createdBy: userId
    });

    // 2. Add the creator as the Admin of this group
    await GroupMember.create({
      groupId: group._id,
      userId: userId,
      role: 'Admin',
      keys: [{ version: 1, ...myKey }]
    });

    const extra = extraMembers;
    if (extra.length) {
      await GroupMember.insertMany(extra.map((p) => ({ groupId: group._id, userId: p.userId, role: p.role, keys: [{ version: 1, ...p.key }] })));
    }

    res.status(201).json({
      message: 'Group created successfully',
      group
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all groups the current user is a member of
// @route   GET /api/groups/my-groups
const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all group memberships for this user
    const memberships = await GroupMember.find({ userId }).populate('groupId');
    
    // Extract just the group details and the user's role in each
    const groups = memberships.map(m => ({
      _id: m.groupId._id,
      name: m.groupId.name,
      description: m.groupId.description,
      myRole: m.role,
      keyVersion: m.groupId.keyVersion || 1,
      keys: (m.keys || []).map((k) => ({ version: k.version, wrapped: k.wrapped, nonce: k.nonce, senderPk: k.senderPk }))
    }));

    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    List members of a group (for assignee dropdowns)
// @route   GET /api/groups/:id/members
const getGroupMembers = async (req, res) => {
  try {
    const mine = await GroupMember.findOne({ groupId: req.params.id, userId: req.user._id });
    if (!mine) return res.status(403).json({ message: 'Not a member of this group' });
    const members = await GroupMember.find({ groupId: req.params.id }).populate('userId', 'username publicKey');
    res.json(members.map(m => ({ _id: m.userId._id, username: m.userId.username, publicKey: m.userId.publicKey || '', role: m.role })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add a friend to a group (Admin only). The group key is replaced so the newcomer
//          can read only messages sent from now on.
// @route   POST /api/groups/:id/members
//          body: { userId, role, keyVersion, keys: [{ userId, key: {wrapped, nonce, senderPk} }] }
const addMember = async (req, res) => {
  try {
    const groupId = req.params.id;
    const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
    if (!isId(groupId) || !isId(req.body.userId)) return res.status(400).json({ message: 'Invalid request' });

    const me = await GroupMember.findOne({ groupId, userId: req.user._id });
    if (!me || me.role !== 'Admin') return res.status(403).json({ message: 'Only group Admins can add members' });
    if (!(await areFriends(req.user._id, [req.body.userId]))) return res.status(403).json({ message: 'You can only add people who are your friends' });
    if (await GroupMember.findOne({ groupId, userId: req.body.userId })) return res.status(409).json({ message: 'Already a member' });
    const newUser = await User.findById(req.body.userId).select('publicKey');
    if (!newUser || !newUser.publicKey) return res.status(400).json({ message: 'That person has not set up encryption yet (they must log in once)' });

    const group = await Group.findById(groupId);
    const newVersion = group.keyVersion + 1;
    if (Number(req.body.keyVersion) !== newVersion) return res.status(409).json({ message: 'Group changed, please try again' });

    // the new key must be wrapped for every current member plus the newcomer, nobody else
    const current = await GroupMember.find({ groupId });
    const need = new Set([...current.map((m) => String(m.userId)), String(req.body.userId)]);
    const wrapped = new Map();
    for (const k of (Array.isArray(req.body.keys) ? req.body.keys : []).slice(0, 300)) {
      const key = cleanWrappedKey(k && k.key);
      if (isId(k && k.userId) && key && need.has(k.userId)) wrapped.set(k.userId, key);
    }
    if (wrapped.size !== need.size) return res.status(400).json({ message: 'Encryption keys are missing for some members' });

    const claim = await Group.updateOne({ _id: groupId, keyVersion: group.keyVersion }, { $set: { keyVersion: newVersion } });
    if (claim.modifiedCount !== 1) return res.status(409).json({ message: 'Group changed, please try again' });

    await GroupMember.create({ groupId, userId: req.body.userId, role: ROLES.includes(req.body.role) ? req.body.role : 'Member',
      keys: [{ version: newVersion, ...wrapped.get(req.body.userId) }], joinedAt: new Date() });
    await GroupMember.bulkWrite(current.map((m) => ({
      updateOne: { filter: { _id: m._id }, update: { $push: { keys: { version: newVersion, ...wrapped.get(String(m.userId)) } } } }
    })));

    const io = req.app.get('io');
    if (io) { io.to(String(groupId)).emit('groupKeyChanged', { groupId }); io.to('user:' + req.body.userId).emit('groupsChanged'); }
    res.status(201).json({ keyVersion: newVersion });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { createGroup, getMyGroups, getGroupMembers, addMember };