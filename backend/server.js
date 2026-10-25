require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const chatRoutes = require('./routes/chatRoutes');
const taskRoutes = require('./routes/taskRoutes');
const documentRoutes = require('./routes/documentRoutes');
const Message = require('./models/Message');
const GroupMember = require('./models/GroupMember');
const jwt = require('jsonwebtoken');
const { isCipher } = require('./utils_crypto');
const Group = require('./models/Group');
const friendRoutes = require('./routes/friendRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const { customAvatar } = require('./utils_avatar');
const { AVATAR_DIR } = require('./controllers/userController');
const dueReminders = require('./jobs/dueReminders');
const { createAvatar } = require('@dicebear/core');
const { lorelei, shapes } = require('@dicebear/collection');

// Fail early with a clear message instead of mysterious errors later
const missing = ['JWT_SECRET', 'MONGODB_URI'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing ${missing.join(', ')} in backend/.env (copy backend/.env.example to backend/.env and fill it in).`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Same-origin sockets: the pages are served by this same server, so no wildcard CORS is needed.
// Ping settings let the server notice dead clients (closed laptop, dropped Wi-Fi) within ~30s.
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });
io.engine.on('connection_error', (err) => console.warn('Socket handshake failed:', err.code, err.message));

// Security headers, tuned so the app also works over plain http on a local network:
//  - upgrade-insecure-requests / HSTS would force https, which a LAN host does not have
//  - the pages use inline scripts/handlers, so those are allowed (all output is escaped separately)
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'upgrade-insecure-requests': null
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Generated avatars (CC0 styles). The picture is derived only from the name, so no personal data is needed.
const avatarCache = new Map();
app.get('/avatars/:file', async (req, res) => {
  const m = /^(.{1,60})\.svg$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  const group = req.query.kind === 'group';
  if (!group) {   // an uploaded profile picture wins over the generated one
    const custom = await customAvatar(m[1]).catch(() => '');
    if (custom) {
      const ext = custom.split('.').pop();
      res.set({ 'Content-Type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.sendFile(require('path').join(AVATAR_DIR, require('path').basename(custom)), (e) => { if (e && !res.headersSent) res.status(404).end(); });
    }
  }
  const key = (group ? 'g:' : 'u:') + m[1];
  let svg = avatarCache.get(key);
  if (!svg) {
    svg = createAvatar(group ? shapes : lorelei, { seed: m[1], backgroundColor: group ? ['10a463', '3b82f6', 'f5a524', '7c5cff', 'e5484d'] : ['d1f0e1', 'dbe7ff', 'ffe9c7', 'e9dcff', 'ffd9d9'] }).toString();
    if (avatarCache.size > 1000) avatarCache.delete(avatarCache.keys().next().value);
    avatarCache.set(key, svg);
  }
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.send(svg);
});

app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders: (res, filePath) => { if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store'); }
}));

app.set('io', io);
connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/documents', documentRoutes);

app.get('/', (req, res) => {
  res.redirect('/pages/login.html');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Safe WorkChat Backend is running!', db: mongoose.connection.readyState === 1 });
});

// Only logged-in users may open a socket
io.use((socket, next) => {
  try {
    const decoded = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
    socket.userId = String(decoded.id);
    next();
  } catch (err) {
    next(new Error('Not authorized'));
  }
});

const getMember = (groupId, userId) => GroupMember.findOne({ groupId, userId });
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);
  socket.join('user:' + socket.userId); // private room for personal notifications

  socket.on('joinRoom', async (groupId) => {
    if (!isId(groupId) || !(await getMember(groupId, socket.userId))) return;
    socket.join(groupId);
  });

  socket.on('sendMessage', async (data, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    try {
      const { groupId, content, encrypted } = data || {};
      if (!isId(groupId) || typeof content !== 'string') return done({ ok: false, reason: 'invalid' });
      const m = await getMember(groupId, socket.userId);
      if (!m) return done({ ok: false, reason: 'forbidden' });
      // sender comes from the verified token; groups with keys only accept ciphertext made with the CURRENT key
      const needsEnc = !!(m.keys && m.keys.length);
      let text = content, kv = 1;
      if (needsEnc) {
        const group = await Group.findById(groupId).select('keyVersion');
        kv = Number(data.keyVersion);
        if (encrypted !== true || !isCipher(content)) return done({ ok: false, reason: 'invalid' });
        if (kv !== group.keyVersion || !m.keys.some((k) => k.version === kv)) return done({ ok: false, reason: 'key-outdated' });
      } else {
        text = content.trim().slice(0, 2000);
        if (!text) return done({ ok: false, reason: 'invalid' });
      }

      const newMessage = await Message.create({ groupId, senderId: socket.userId, content: text, type: 'text', encrypted: needsEnc, keyVersion: kv });
      const populated = await Message.findById(newMessage._id).populate('senderId', 'username');
      io.to(groupId).emit('receiveMessage', populated);
      done({ ok: true });
    } catch (error) {
      console.error('Socket message error:', error);
      done({ ok: false, reason: 'error' });
    }
  });

  socket.on('disconnect', () => console.log(`User disconnected: ${socket.id}`));
});

// ---- central error handling ----
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON in request' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File is too large (max 10 MB)' });
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));
process.on('uncaughtException', (err) => { console.error('Fatal error:', err); process.exit(1); });
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected (the driver will keep trying to reconnect)'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

const PORT = process.env.PORT || 5000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} is already in use. Close the other copy of the server or change PORT in backend/.env.`);
  else console.error('Server error:', err);
  process.exit(1);
});

// Listen on every network interface so other laptops on the same Wi-Fi can connect
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Safe WorkChat main server is running`);
  console.log(`   This computer : http://localhost:${PORT}`);
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`   Other devices : http://${i.address}:${PORT}   (same Wi-Fi / network)`));
  console.log('Socket.IO is active');
});

// deadline reminders (group message + notification) start once the database is connected
const startReminders = () => { dueReminders.start(io); console.log('⏰ Deadline reminder job running (checks every minute)'); };
if (mongoose.connection.readyState === 1) startReminders(); else mongoose.connection.once('open', startReminders);

// Close cleanly on Ctrl+C
const shutdown = () => { console.log('\nShutting down…'); io.close(); server.close(() => mongoose.connection.close().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
