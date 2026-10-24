// One command that fills the database with everything needed to demo and test the whole app:
//   npm run demo          create users, groups, tasks, chat, documents, notifications
//   npm run demo:reset    delete the demo groups (and their data) and build them again
// Options: --password <pw>  (default Test@12345)
// TEST DATA ONLY: encryption keys are generated here so the accounts work immediately.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseEntries, emailFor, buildGroupKeys } = require('./seedUsers.js');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const PASSWORD = arg('password', 'Test@12345');
const H = 3600000;

const CLASS = '3rd year cse B', PROJECT = 'Mini Project III Team', LAB = 'Lab Group 1';
const PROJECT_MEMBERS = [['Bexalin B A', 'Admin'], ['Radhika', 'Manager'], ['feronica', 'Member'], ['Kavya', 'Member'], ['Pavithra', 'Member'], ['Janani S', 'Member']];
const LAB_MEMBERS = [['nirmala G', 'Admin'], ['stella Inba mary', 'Manager'], ['Harini S', 'Member'], ['Harini V', 'Member'], ['Gopika', 'Member'], ['Ishwarya', 'Member'], ['Kanya', 'Member'], ['Nithya Lakshmi', 'Member']];
const GUESTS = ['Demo Guest 1', 'Demo Guest 2'];

// [creator, assignee, title, description, priority, due (hours from now), stages done (0-8)]
const TASKS = {
  [CLASS]: [
    ['nirmala G', 'Kavya', 'Submit DBMS lab record', 'Complete all experiments and get the staff signature.', 'High', 3, 6],
    ['stella Inba mary', 'Kavya', 'Prepare OS assignment', 'Scheduling algorithms: solve the 10 problems.', 'Medium', -20, 2],
    ['Bexalin B A', 'Kavya', 'Web Technology mini project demo', 'Show the login, chat and task modules.', 'High', 72, 3],
    ['sorna lakshmi', 'Kavya', 'Weekly attendance report', 'Compile attendance for the week.', 'Low', -48, 8],
    ['Bexalin B A', 'Janani S', 'Collect class fee list', 'Collect the list from all students.', 'Medium', 30, 1],
    ['nirmala G', 'Radhika', 'Update project documentation', 'Update the SRS and diagrams.', 'High', 50, 4],
    ['stella Inba mary', 'Gopika', 'Organise seminar hall booking', 'Meet the office and confirm the slot.', 'Low', 120, 0],
    ['Bexalin B A', 'Harini S', 'DBMS assignment 2', 'Normalisation up to BCNF.', 'Medium', 6, 5],
    ['sorna lakshmi', 'Harini V', 'Cloud computing record', 'Write the last two experiments.', 'Medium', -5, 7],
    ['nirmala G', 'Pavithra', 'Collect lab observation notes', 'Collect notes from every batch.', 'Low', 96, 2],
    ['stella Inba mary', 'subha', 'Prepare quiz questions', '20 MCQs for the technical quiz.', 'Medium', 200, 0],
    ['Bexalin B A', 'Nithya Lakshmi', 'Design poster for symposium', 'A3 poster, soft copy by evening.', 'High', 40, 3],
    ['nirmala G', 'feronica', 'Review SRS document', 'Check sections 1 to 4.', 'High', 20, 6],
    ['sorna lakshmi', 'Rubika', 'Submit internal marks sheet', 'Submit to the department office.', 'High', -72, 8],
    ['Bexalin B A', 'Maruthupriyanka', 'Seminar presentation slides', '10 slides on cloud security.', 'Medium', 150, 1]
  ],
  [PROJECT]: [
    ['Bexalin B A', 'Bexalin B A', 'Finish calendar integration', 'Calendar shows only my tasks.', 'High', 10, 5],
    ['Bexalin B A', 'Kavya', 'Write test cases document', 'Cover login, chat, tasks and notifications.', 'High', 48, 2],
    ['Radhika', 'Pavithra', 'Prepare review PPT', 'Architecture, modules, demo screenshots.', 'Medium', 4, 4],
    ['Bexalin B A', 'feronica', 'Create ER diagram', 'Final ER and schema diagrams.', 'Medium', -30, 8],
    ['Radhika', 'Janani S', 'Test chat module', 'Send messages between two accounts.', 'Medium', 70, 1],
    ['Bexalin B A', 'Radhika', 'Deploy project to GitHub', 'Push code and write the README.', 'High', 44, 3]
  ],
  [LAB]: [
    ['nirmala G', 'Harini S', 'Experiment 5 record', 'Write aim, procedure and result.', 'Medium', 30, 2],
    ['stella Inba mary', 'Ishwarya', 'Prepare viva questions', 'Ten questions with answers.', 'Low', 60, 0],
    ['nirmala G', 'Kanya', 'Result analysis', 'Tabulate and analyse the readings.', 'High', -10, 6]
  ]
};

const STAGE_NOTES = ['Started working on it.', 'Environment is ready.', 'Database part is finished.', 'API completed, please check.', 'Testing done, minor fixes pending.', 'Code reviewed with the team.', 'Deployed and verified.', 'All done.'];
const PROOF = ['Photo', 'File', 'Document'];

const CHAT = {
  [CLASS]: [
    ['Bexalin B A', 'Good morning everyone! Please check the new tasks assigned to you in the app.', 2400],
    ['nirmala G', 'Reminder: the internal marks sheet must be submitted by Friday.', 2350],
    ['Kavya', 'Ma\'am, can we get one more day for the OS assignment?', 2200],
    ['stella Inba mary', 'I will check with the faculty and update here.', 2150],
    ['Radhika', 'The documentation draft is ready for review.', 1900],
    ['Pavithra', 'Lab observation notes are uploaded in Documents.', 1700],
    ['Janani S', 'Fee list collection is going on. Please send your amount today.', 1500],
    ['sorna lakshmi', 'Seminar slides should be mailed to the staff before Monday.', 1300],
    ['Gopika', 'Seminar hall is free on Wednesday afternoon.', 1100],
    ['Harini S', 'Is the DBMS assignment 2 to be submitted in the record?', 900],
    ['nirmala G', 'No, submit it as a separate sheet.', 880],
    ['Nithya Lakshmi', 'Poster draft is ready, sharing it in the group soon.', 600],
    ['feronica', 'I reviewed sections 1 and 2 of the SRS. Looks good.', 420],
    ['Rubika', 'Marks sheet submitted to the office.', 300],
    ['Bexalin B A', 'Thank you Rubika! Everyone please keep your task progress updated.', 240],
    ['Kavya', 'DBMS lab record is almost complete, finishing the last experiment.', 90]
  ],
  [PROJECT]: [
    ['Bexalin B A', 'Review is at 1:30. Let us finalise the demo flow today.', 1500],
    ['Radhika', 'I will prepare the deployment steps and README.', 1400],
    ['Pavithra', 'PPT first draft is ready. Need screenshots of the calendar.', 1000],
    ['Kavya', 'Writing the test cases for login and chat now.', 800],
    ['feronica', 'ER diagram is completed and uploaded.', 600],
    ['Janani S', 'Chat messages are working between two accounts.', 300],
    ['Bexalin B A', 'Great work team. Please update your task progress before the review.', 120]
  ],
  [LAB]: [
    ['nirmala G', 'Lab record check is on Thursday. Please be ready.', 900],
    ['Harini S', 'Experiment 5 results are ready.', 500],
    ['stella Inba mary', 'Kanya, please send your result analysis today.', 200],
    ['Kanya', 'Sure, I will submit it this evening.', 150]
  ]
};

const DOCS = {
  [CLASS]: [
    { title: 'Class Timetable', type: 'md', by: 'nirmala G', versions: [['Class Timetable', 'Monday to Friday, 9:00 to 4:00.'], ['Class Timetable', 'Monday to Friday, 9:00 to 4:00.', 'Lab sessions moved to Thursday afternoon.']] },
    { title: 'Lab Instructions', type: 'docx', by: 'stella Inba mary', versions: [['Lab Instructions', 'Bring the record and observation notebook.'], ['Lab Instructions', 'Bring the record and observation notebook.', 'Wear the ID card inside the lab.'], ['Lab Instructions', 'Bring the record and observation notebook.', 'Wear the ID card inside the lab.', 'Submit the record within one week.']] }
  ],
  [PROJECT]: [
    { title: 'SRS Draft', type: 'docx', by: 'Bexalin B A', versions: [['SRS Draft', 'Introduction and scope of Safe WorkChat.'], ['SRS Draft', 'Introduction and scope of Safe WorkChat.', 'Functional requirements: chat, tasks, documents, calendar.'], ['SRS Draft', 'Introduction and scope of Safe WorkChat.', 'Functional requirements: chat, tasks, documents, calendar.', 'Security: end-to-end encrypted chat and role-based access.']] },
    { title: 'Meeting Notes', type: 'md', by: 'Radhika', versions: [['Meeting Notes', 'Review preparation checklist.'], ['Meeting Notes', 'Review preparation checklist.', 'Demo order: login, friends, group chat, tasks, calendar, documents.']] }
  ]
};

const quillOps = (title, ...paras) => [{ insert: title }, { insert: '\n', attributes: { header: 1 } }, ...paras.flatMap((p) => [{ insert: p }, { insert: '\n' }])];

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to run demo seed when NODE_ENV=production.'); process.exit(1); }
  globalThis.nacl = require('tweetnacl');
  const E2EE = require('../../frontend/js/e2ee.js');
  const mongoose = require('mongoose');
  const M = (n) => require('../models/' + n);
  const [User, Group, GroupMember, Friendship, Task, TaskActivity, Message, Notification, Doc, DocVer] =
    ['User', 'Group', 'GroupMember', 'Friendship', 'Task', 'TaskActivity', 'Message', 'Notification', 'Document', 'DocumentVersion'].map(M);
  const { fmtDate } = require('../utils_notify');

  const entries = parseEntries(fs.readFileSync(path.join(__dirname, 'names.txt'), 'utf8'));
  if (!entries.length) { console.error('seed/names.txt is empty.'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  // ---------- users ----------
  const used = new Set((await User.find().select('email')).map((u) => u.email.replace('@test.local', '')));
  const users = {}; let created = 0;
  for (const name of [...entries.map((e) => e.name), ...GUESTS]) {
    let u = await User.findOne({ username: name });
    if (!u) {
      const k = E2EE.genKeys();
      u = await User.create({ username: name, email: emailFor(name, used), password: PASSWORD, publicKey: k.pk, keyBackup: E2EE.backup(k.sk, PASSWORD) });
      created++; process.stdout.write('.');
    }
    users[name] = u;
  }
  console.log(`\nUsers: ${created} created, ${Object.keys(users).length - created} already existed.`);
  const sk = {};   // creator private keys, unlocked from the password-protected backups
  const secretOf = (name) => sk[name] || (sk[name] = E2EE.unlock(users[name].keyBackup, PASSWORD));

  // ---------- groups ----------
  const classMembers = entries.map((e) => [e.name, e.role]);
  const plans = [
    { name: CLASS, admin: 'Bexalin B A', members: classMembers },
    { name: PROJECT, admin: 'Bexalin B A', members: PROJECT_MEMBERS },
    { name: LAB, admin: 'nirmala G', members: LAB_MEMBERS }
  ];
  const now = Date.now(), fresh = [];
  for (const plan of plans) {
    const old = await Group.findOne({ name: plan.name });
    if (old && !flag('reset')) { console.log(`Group "${plan.name}" exists, skipped (use npm run demo:reset to rebuild).`); continue; }
    if (old) {
      const tids = (await Task.find({ groupId: old._id }).select('_id')).map((t) => t._id);
      const dids = (await Doc.find({ groupId: old._id }).select('_id')).map((d) => d._id);
      await Promise.all([Notification.deleteMany({ $or: [{ groupId: old._id }, { taskId: { $in: tids } }] }), TaskActivity.deleteMany({ taskId: { $in: tids } }), Task.deleteMany({ groupId: old._id }),
        DocVer.deleteMany({ documentId: { $in: dids } }), Doc.deleteMany({ groupId: old._id }), Message.deleteMany({ groupId: old._id }), GroupMember.deleteMany({ groupId: old._id }), Group.deleteOne({ _id: old._id })]);
      console.log(`Old "${plan.name}" removed.`);
    }
    const adminU = users[plan.admin], adminSk = secretOf(plan.admin);
    const others = plan.members.filter(([n]) => n !== plan.admin).map(([n, role]) => ({ id: users[n]._id, name: n, role, publicKey: users[n].publicKey }));
    const { adminKey, memberKeys } = buildGroupKeys(E2EE, { sk: adminSk, pk: adminU.publicKey }, others);
    const group = await Group.create({ name: plan.name, description: plan.name === CLASS ? 'Class group for 3rd year CSE B' : plan.name === PROJECT ? 'Project work and review preparation' : 'Lab batch group', createdBy: adminU._id });
    await GroupMember.insertMany([{ groupId: group._id, userId: adminU._id, role: 'Admin', joinedAt: new Date(now - 3 * 24 * H), keys: [{ version: 1, ...adminKey }] },
      ...memberKeys.map((m) => ({ groupId: group._id, userId: m.id, role: m.role, joinedAt: new Date(now - 3 * 24 * H), keys: [{ version: 1, ...m.key }] }))]);
    // everyone who is in a group with the admin is the admin's friend (needed to add people later)
    try { await Friendship.insertMany(others.map((o) => ({ requester: adminU._id, recipient: o.id, status: 'accepted' })), { ordered: false }); } catch (e) { /* already friends */ }
    const groupKey = E2EE.unwrapKey(adminKey, adminSk);
    fresh.push({ plan, group, groupKey });
    console.log(`Group "${plan.name}" created (${plan.members.length} members).`);
  }
  // pending friend request for the friend-flow demo
  try { await Friendship.create({ requester: users['Demo Guest 1']._id, recipient: users['Bexalin B A']._id, status: 'pending' }); } catch (e) { /* exists */ }

  // ---------- data inside the new groups ----------
  const counts = { tasks: 0, activity: 0, messages: 0, notifications: 0, docs: 0, versions: 0 };
  for (const { plan, group, groupKey } of fresh) {
    for (const [creator, assignee, title, description, priority, dueH, done] of TASKS[plan.name] || []) {
      const due = new Date(now + dueH * H), assignedAt = new Date(now - (24 + ((title.length * 7) % 30)) * H);
      const stageNames = require('../models/Task').DEFAULT_STAGES;
      const status = done === 8 ? 'Completed' : done > 0 ? 'In Progress' : 'To Do';
      const stages = stageNames.map((name, i) => i < done ? { name, done: true, proofType: i % 2 ? PROOF[i % 3] : '', doneAt: new Date(assignedAt.getTime() + (i + 1) * 3 * H), doneBy: users[assignee]._id } : { name });
      const t = await Task.create({ groupId: group._id, title, description, assignedTo: users[assignee]._id, createdBy: users[creator]._id, priority, status, dueDate: due, stages,
        notifiedDueSoon: done === 8, notifiedOverdue: done === 8, createdAt: assignedAt });
      counts.tasks++;
      await TaskActivity.create({ taskId: t._id, userId: users[creator]._id, action: 'created', to: 'To Do', createdAt: assignedAt }); counts.activity++;
      for (let i = 0; i < done; i++) {
        await TaskActivity.create({ taskId: t._id, userId: users[assignee]._id, action: 'stage_update', stage: stageNames[i], comment: STAGE_NOTES[i], proofType: stages[i].proofType, createdAt: stages[i].doneAt }); counts.activity++;
      }
      await Message.create({ groupId: group._id, senderId: users[creator]._id, type: 'system', encrypted: false, createdAt: assignedAt,
        content: `📌 ${creator} assigned “${title}” to ${assignee} · ${priority} priority · due ${fmtDate(due)}.` }); counts.messages++;
      if (creator !== assignee) {
        await Notification.create({ userId: users[assignee]._id, type: 'task_assigned', title: 'New task assigned to you', body: `${creator} assigned you “${title}” · due ${fmtDate(due)}.`,
          link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: group._id, read: now - assignedAt > 36 * H, createdAt: assignedAt }); counts.notifications++;
      }
      if (done === 8) {
        const at = new Date(now - 6 * H);
        await Message.create({ groupId: group._id, senderId: users[assignee]._id, type: 'system', encrypted: false, createdAt: at, content: `✅ ${assignee} completed “${title}”.` }); counts.messages++;
        if (creator !== assignee) { await Notification.create({ userId: users[creator]._id, type: 'task_completed', title: 'Task completed', body: `${assignee} completed “${title}”.`, link: `/pages/tasks.html?id=${t._id}`, taskId: t._id, groupId: group._id, read: false, createdAt: at }); counts.notifications++; }
      }
    }
    for (const [who, text, minsAgo] of CHAT[plan.name] || []) {
      await Message.create({ groupId: group._id, senderId: users[who]._id, content: E2EE.encryptMsg(text, groupKey), encrypted: true, keyVersion: 1, type: 'text', createdAt: new Date(now - minsAgo * 60000) }); counts.messages++;
    }
    for (const d of DOCS[plan.name] || []) {
      const last = d.versions[d.versions.length - 1];
      const doc = await Doc.create({ groupId: group._id, title: d.title, type: d.type, createdBy: users[d.by]._id, updatedBy: users[d.by]._id, currentVersion: d.versions.length, ops: quillOps(...last) });
      counts.docs++;
      for (let i = 0; i < d.versions.length; i++) {
        await DocVer.create({ documentId: doc._id, version: i + 1, ops: quillOps(...d.versions[i]), savedBy: users[d.by]._id, note: i === 0 ? 'Created' : `Edit ${i}`, createdAt: new Date(now - (d.versions.length - i) * 5 * H) }); counts.versions++;
      }
    }
  }

  console.log('\nData created:', JSON.stringify(counts));
  console.log(`\nAll accounts use the password: ${PASSWORD}`);
  console.log('Login with the username (e.g. Bexalin B A) or email (e.g. bexalin.b.a@test.local).');
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ Demo seed failed:', e); process.exit(1); });
