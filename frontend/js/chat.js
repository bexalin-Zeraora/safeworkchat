const API_URL = '/api';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let allGroups = [];
let currentGroupName = '';
const groupKeys = {}; // groupId -> group key (only ever in memory, unwrapped with this device's private key)
const mySk = () => sess.get('e2ee_sk');
let tab = 'All';
let socket;
let currentGroupId = null;
let currentUser = null;
let authToken = null;
let myFriends = [];          // accepted friends (for starting direct chats)
const unread = {};           // groupId -> number of new messages while looking at another chat
const nameOf = (g) => (g.isDirect && g.peer ? g.peer.username : g.name);
const openGroup = (g) => selectGroup(g._id, nameOf(g), g.myRole);
const joinAll = () => { if (socket && socket.connected) allGroups.forEach((g) => socket.emit('joinRoom', g._id)); };

function init() {
  try {
    const userStr = sess.get('user');
    authToken = sess.get('token');

    if (!userStr || !authToken) {
      window.location.href = '/pages/login.html';
      return;
    }

    currentUser = JSON.parse(userStr);
    
    // Update Sidebar User Info

    if (typeof io !== 'undefined') {
      socket = io({ auth: { token: authToken } });
      socket.on('connect', () => {
        console.log('✅ Socket connected');
        // after a reconnect the server has forgotten our rooms, so join the open group again
        joinAll();   // rooms are forgotten on reconnect: join all my chats again
      });
      if (window.watchSocket) window.watchSocket(socket);
      socket.on('receiveMessage', (msg) => {
        if (msg.groupId === currentGroupId) { appendMessage(msg); return; }
        // a message in a chat I am not looking at: show an unread badge
        if (msg.type !== 'system') { unread[msg.groupId] = (unread[msg.groupId] || 0) + 1; renderGroups(); }
      });
    }

    loadGroups();
    loadFriends();
    setupEventListeners();
  } catch (error) {
    console.error("Init Error:", error);
    window.location.href = '/pages/login.html';
  }
}

async function loadGroups() {
  try {
    const res = await fetch(`${API_URL}/groups/my-groups`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    allGroups = await res.json();
    allGroups.forEach((g) => {
      groupKeys[g._id] = {};
      (g.keys || []).forEach((kk) => {
        const k = mySk() && E2EE.unwrapKey(kk, mySk());
        if (k) groupKeys[g._id][kk.version] = k;
      });
    });
    renderGroups();
    joinAll();
    const params = new URLSearchParams(location.search);
    // opened from a notification: /pages/chat.html?group=<id>
    const wanted = params.get('group');
    if (wanted && !currentGroupId) { const g = allGroups.find((x) => x._id === wanted); if (g) openGroup(g); }
    // opened from the Friends page: /pages/chat.html?dm=<userId>
    const dm = params.get('dm');
    if (dm && !currentGroupId && !loadGroups.dmDone) {
      loadGroups.dmDone = true;
      await loadFriends();
      const f = myFriends.find((x) => x._id === dm);
      if (f) { tab = 'Direct'; document.querySelectorAll('#chatTabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === 'Direct')); renderGroups(); startDirect(f); }
    }
  } catch (error) {
    console.error("Load Groups Error:", error);
  }
}

async function loadFriends() {
  try {
    const r = await fetch(`${API_URL}/friends`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const d = await r.json(); myFriends = Array.isArray(d) ? d : [];
  } catch (e) { /* offline */ }
  renderGroups();
}

// open the one-to-one chat with a friend (creates it the first time, with its own encryption key)
async function startDirect(friend) {
  const existing = allGroups.find((g) => g.isDirect && g.peer && g.peer._id === friend._id);
  if (existing) return openGroup(existing);
  const myPk = sess.get('e2ee_pk'), sk = mySk();
  if (!friend.publicKey) return alert(`${friend.username} must log in once before you can message them (to set up encryption).`);
  if (!myPk || !sk) return alert('Your encryption key is missing on this device. Please log out and log in again.');
  const gk = E2EE.newGroupKey();
  try {
    const r = await fetch(`${API_URL}/groups/direct`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: friend._id, myKey: E2EE.wrapKey(gk, myPk, sk, myPk), friendKey: E2EE.wrapKey(gk, friend.publicKey, sk, myPk) }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Could not start the chat');
    await loadGroups();
    const g = allGroups.find((x) => x._id === d.groupId);
    if (g) openGroup(g);
  } catch (e) { alert(e.message); }
}

function renderGroups() {
  const list = document.getElementById('groupList');
  const q = (document.getElementById('groupSearch').value || '').toLowerCase();
  list.innerHTML = '';
  const inTab = allGroups.filter((g) => tab === 'Direct' ? g.isDirect : tab === 'Groups' ? !g.isDirect : true)
    .filter((g) => nameOf(g).toLowerCase().includes(q));

  inTab.forEach((g) => {
    const div = document.createElement('div');
    div.className = 'group-item' + (g._id === currentGroupId ? ' active' : '');
    const n = unread[g._id] || 0;
    div.innerHTML = `
      <div class="group-avatar">${g.isDirect ? avImg(nameOf(g), 46) : avImg(g.name, 46, 'group')}</div>
      <div class="group-details"><h6>${esc(nameOf(g))}</h6><small>${esc(g.isDirect ? 'Direct message' : (g.description || g.myRole))}</small></div>
      ${n ? `<span class="ubadge">${n > 99 ? '99+' : n}</span>` : ''}`;
    div.onclick = () => { openGroup(g); };
    list.appendChild(div);
  });

  if (tab === 'Direct') {
    // friends I have not started a chat with yet
    const have = new Set(allGroups.filter((g) => g.isDirect && g.peer).map((g) => g.peer._id));
    const fresh = myFriends.filter((f) => !have.has(f._id) && f.username.toLowerCase().includes(q));
    if (fresh.length) {
      const h = document.createElement('div'); h.className = 'dm-head'; h.textContent = 'Start a new chat'; list.appendChild(h);
      fresh.forEach((f) => {
        const d = document.createElement('div'); d.className = 'group-item';
        d.innerHTML = `<div class="group-avatar">${avImg(f.username, 46)}</div><div class="group-details"><h6>${esc(f.username)}</h6><small>${f.publicKey ? 'Friend · tap to message' : 'Needs to log in once'}</small></div>`;
        d.onclick = () => startDirect(f);
        list.appendChild(d);
      });
    }
    if (!inTab.length && !fresh.length) list.innerHTML = '<div class="p-3 text-center text-muted small">No friends yet.<br><a href="/pages/friends.html">Add friends</a> to start chatting.</div>';
  } else if (!inTab.length) {
    list.innerHTML = '<div class="p-3 text-center text-muted small">' + (allGroups.length ? 'No matches.' : 'No chats yet.<br>Create a group or message a friend!') + '</div>';
  }
}

function groupInfo(id) { return allGroups.find((g) => g._id === id) || {}; }
const isEnc = (info) => !!(info.keys && info.keys.length);
const curKey = (id) => (groupKeys[id] || {})[groupInfo(id).keyVersion];

function showText(msg) {
  // decrypt when needed; never show raw ciphertext
  if (!msg.encrypted) return msg.content;
  const k = (groupKeys[currentGroupId] || {})[msg.keyVersion || 1];
  const t = k ? E2EE.decryptMsg(msg.content, k) : null;
  return t === null ? '🔒 Unable to decrypt this message on this device' : t;
}

async function selectGroup(groupId, name, role) {
  currentGroupId = groupId;
  currentGroupName = name;
  const info0 = groupInfo(groupId);
  const hv = document.getElementById('hdrAv'); if (hv) hv.src = info0.isDirect ? avUrl(name) : avUrl(name, 'group');
  delete unread[groupId];
  renderGroups();
  document.querySelector('.chat-container').classList.add('show-chat');
  document.body.classList.add('in-chat');
  
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('inputArea').style.display = 'flex';
  document.getElementById('currentGroupName').textContent = name;
  const badge = document.getElementById('encBadge');
  const info = groupInfo(groupId);
  if (isEnc(info) && curKey(groupId)) { badge.className = 'enc-badge ok'; badge.innerHTML = '<i class="fas fa-lock"></i> End-to-end encrypted'; }
  else if (isEnc(info)) { badge.className = 'enc-badge bad'; badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Key missing on this device. Log out and log in again.'; }
  else { badge.className = 'enc-badge warn'; badge.innerHTML = '<i class="fas fa-unlock"></i> Not encrypted (created before encryption was added)'; }
  const direct = !!info.isDirect;
  document.getElementById('rolePills').style.display = direct ? 'none' : '';
  document.getElementById('infoBtn').style.display = direct ? 'none' : '';
  const shownRole = role === 'Member' ? 'User' : role;
  document.querySelectorAll('#rolePills .pill').forEach((p) => p.classList.toggle('on', p.dataset.r === shownRole));
  document.getElementById('currentGroupRole').textContent = direct ? 'Direct message' : 'Loading members…';
  if (!direct) fetch(`${API_URL}/groups/${groupId}/members`, { headers: { 'Authorization': `Bearer ${authToken}` } })
    .then((r) => r.ok ? r.json() : [])
    .then((m) => {
      const admin = m.find((x) => x.role === 'Admin');
      document.getElementById('currentGroupRole').textContent = `${m.length} member${m.length === 1 ? '' : 's'}${admin ? ' · Admin: ' + admin.username : ''}`;
    });

  const area = document.getElementById('messagesArea');
  area.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading messages...</p></div>';

  socket.emit('joinRoom', groupId);

  try {
    const res = await fetch(`${API_URL}/chat/${groupId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const messages = await res.json();
    area.innerHTML = '';
    
    if (messages.length === 0) {
      area.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages yet. Say hi!</p></div>';
    } else {
      messages.forEach(appendMessage);
    }
    area.scrollTop = area.scrollHeight;
  } catch (error) {
    console.error("Load Messages Error:", error);
  }
}

function appendMessage(msg) {
  const area = document.getElementById('messagesArea');
  if (area.querySelector('.empty-state')) area.innerHTML = '';

  if (msg.type === 'system') {
    // task notices from the server (assigned / reminder / overdue / completed)
    const note = document.createElement('div');
    note.className = 'system-msg';
    note.textContent = msg.content;
    area.appendChild(note); area.scrollTop = area.scrollHeight;
    return;
  }
  const isMe = msg.senderId._id === currentUser._id || msg.senderId === currentUser._id;
  const div = document.createElement('div');
  div.className = `message-bubble ${isMe ? 'sent' : 'received'}`;
  
  const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const sender = isMe ? 'You' : (msg.senderId.username || 'User');
  
  div.innerHTML = `
    ${!isMe ? `<div class="msg-sender">${avImg(sender, 18)}${esc(sender)}</div>` : ''}
    <div class="msg-content">${esc(showText(msg))}</div>
    <div class="msg-time">${time}${isMe ? ' <i class="fas fa-check-double"></i>' : ''}</div>
  `;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content || !currentGroupId) return;

  const info = groupInfo(currentGroupId);
  const gid = currentGroupId;
  if (!socket || !socket.connected) return alert('Not connected to the server right now. Your message was not sent. Please wait for it to reconnect.');
  const send = (retry) => {
    if (!isEnc(groupInfo(gid))) return socket.emit('sendMessage', { groupId: gid, content });
    const k = curKey(gid);
    if (!k) return alert('Your encryption key for this group is missing on this device. Please log out and log in again.');
    socket.timeout(8000).emit('sendMessage', { groupId: gid, content: E2EE.encryptMsg(content, k), encrypted: true, keyVersion: groupInfo(gid).keyVersion }, async (timeoutErr, r) => {
      if (timeoutErr) return alert('The server did not respond. Your message may not have been sent.');
      if (r && r.reason === 'key-outdated' && retry) { await loadGroups(); send(false); }
      else if (r && !r.ok) alert('Message could not be sent. Please try again.');
    });
  };
  send(true);
  input.value = '';
}

async function openInfo() {
  if (!currentGroupId) return;
  const gid = currentGroupId, info = groupInfo(gid);
  document.getElementById('mmTitle').textContent = currentGroupName;
  document.getElementById('mmBody').textContent = 'Loading…';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('membersModal')).show();
  try {
    const h = { 'Authorization': `Bearer ${authToken}` };
    const m = await (await fetch(`${API_URL}/groups/${gid}/members`, { headers: h })).json();
    let html = `<div class="small text-muted mb-2">${m.length} member${m.length === 1 ? '' : 's'}</div>` +
      m.map((x) => `<div class="d-flex align-items-center gap-2 py-2 border-bottom">${avImg(x.username, 32)}<span>${esc(x.username)}</span><span class="pill on ms-auto" data-r="${esc(x.role === 'Member' ? 'User' : x.role)}">${esc(x.role === 'Member' ? 'User' : x.role)}</span></div>`).join('');
    let friendsToAdd = [];
    if (info.myRole === 'Admin' && isEnc(info)) {
      const fr = await (await fetch(`${API_URL}/friends`, { headers: h })).json();
      const inGroup = new Set(m.map((x) => x._id));
      friendsToAdd = (Array.isArray(fr) ? fr : []).filter((u) => !inGroup.has(u._id) && u.publicKey);
      html += friendsToAdd.length
        ? `<div class="mt-3"><div class="small fw-bold mb-1">Add a friend</div><div class="d-flex gap-2"><select id="addWho" class="form-select form-select-sm">${friendsToAdd.map((u) => `<option value="${esc(u._id)}">${esc(u.username)}</option>`).join('')}</select><select id="addRole" class="form-select form-select-sm" style="max-width:110px"><option value="Member">User</option><option>Manager</option><option>Admin</option></select><button id="addBtn" class="btn btn-success btn-sm">Add</button></div><div class="small text-muted mt-1">They will see only messages sent after they join.</div><div id="addErr" class="small text-danger mt-1"></div></div>`
        : `<div class="small text-muted mt-3">No friends to add. <a href="/pages/friends.html">Manage friends</a></div>`;
    }
    document.getElementById('mmBody').innerHTML = html;
    const btn = document.getElementById('addBtn');
    if (btn) btn.onclick = async () => {
      const friend = friendsToAdd.find((u) => u._id === document.getElementById('addWho').value);
      const myPk = sess.get('e2ee_pk');
      if (!friend || !myPk || !mySk()) return;
      // make a NEW group key and wrap it for every member + the newcomer
      const newKey = E2EE.newGroupKey();
      const recipients = [...m.map((x) => ({ userId: x._id, pk: x.publicKey })), { userId: friend._id, pk: friend.publicKey }];
      if (recipients.some((r) => !r.pk)) { document.getElementById('addErr').textContent = 'A member has no encryption key yet.'; return; }
      btn.disabled = true;
      try {
        const r = await fetch(`${API_URL}/groups/${gid}/members`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: friend._id, role: document.getElementById('addRole').value, keyVersion: info.keyVersion + 1,
            keys: recipients.map((x) => ({ userId: x.userId, key: E2EE.wrapKey(newKey, x.pk, mySk(), myPk) })) }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'Failed');
        await loadGroups(); openInfo();
      } catch (e) { document.getElementById('addErr').textContent = e.message; btn.disabled = false; }
    };
  } catch (e) { document.getElementById('mmBody').textContent = 'Could not load members.'; }
}

function setupEventListeners() {
  const refresh = async () => { await loadGroups(); if (currentGroupId) { const g = groupInfo(currentGroupId); if (g._id) openGroup(g); } };
  socket.on('groupKeyChanged', refresh);
  socket.on('groupsChanged', loadGroups);
  socket.on('friendsChanged', loadFriends);
  document.getElementById('backBtn').onclick = () => {
    document.querySelector('.chat-container').classList.remove('show-chat');
    document.body.classList.remove('in-chat');
    document.getElementById('chatHeader').style.display = 'none';
    document.getElementById('inputArea').style.display = 'none';
  };
  document.getElementById('infoBtn').onclick = openInfo;  document.getElementById('sendBtn').onclick = sendMessage;
  document.getElementById('groupSearch').addEventListener('input', renderGroups);
  document.querySelectorAll('#chatTabs button').forEach((b) => b.onclick = () => {
    tab = b.dataset.t;
    document.querySelectorAll('#chatTabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderGroups();
  });
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function logout() {
  sess.clear();
  window.location.href = '/pages/login.html';
}

init();