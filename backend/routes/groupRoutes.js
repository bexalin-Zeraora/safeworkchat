const express = require('express');
const router = express.Router();
const { createGroup, getMyGroups, getGroupMembers, addMember } = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createGroup);
router.get('/my-groups', protect, getMyGroups);
router.get('/:id/members', protect, getGroupMembers);
router.post('/:id/members', protect, addMember);

module.exports = router;