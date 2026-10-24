const Message = require('../models/Message');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
const { isCipher } = require('../utils_crypto');

// @desc    Get messages for a specific group
// @route   GET /api/chat/:groupId
const getMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Security Check: Ensure user is a member of this group
    const isMember = await GroupMember.findOne({ groupId, userId });
    if (!isMember) {
      return res.status(403).json({ message: 'Not authorized to view this group' });
    }

    // Fetch messages, sorted by oldest first
    // newer members only see messages sent after they joined
    const messages = await Message.find({ groupId, createdAt: { $gte: isMember.joinedAt } })
      .populate('senderId', 'username')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send a new message (Called by Socket.IO or API)
// @route   POST /api/chat/:groupId
const sendMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, type = 'text' } = req.body;
    const userId = req.user._id;

    // Security Check
    const isMember = await GroupMember.findOne({ groupId, userId });
    if (!isMember) {
      return res.status(403).json({ message: 'Not authorized to send messages here' });
    }

    const group = await Group.findById(groupId).select('keyVersion');
    const needsEnc = !!(isMember.keys && isMember.keys.length);
    const kv = Number(req.body.keyVersion);
    if (needsEnc ? (req.body.encrypted !== true || !isCipher(content) || kv !== group.keyVersion || !isMember.keys.some((k) => k.version === kv)) : typeof content !== 'string') {
      return res.status(400).json({ message: needsEnc ? 'Messages in this group must be encrypted with the current key' : 'Invalid message' });
    }

    const message = await Message.create({
      groupId,
      senderId: userId,
      content,
      type: 'text',
      encrypted: needsEnc,
      keyVersion: needsEnc ? kv : 1
    });

    const populatedMessage = await Message.findById(message._id).populate('senderId', 'username');
    
    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getMessages, sendMessage };