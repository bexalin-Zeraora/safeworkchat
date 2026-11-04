const express = require('express');
const router = express.Router();
const { createGroup, getMyGroups, getGroupMembers, addMember, createDirect } = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');
const groupFileRoutes = require('./groupFileRoutes');

router.post('/', protect, createGroup);
router.use('/:id/files', groupFileRoutes);
router.get('/my-groups', protect, getMyGroups);
router.post('/direct', protect, createDirect);
router.get('/:id/members', protect, getGroupMembers);
router.post('/:id/members', protect, addMember);

module.exports = router;