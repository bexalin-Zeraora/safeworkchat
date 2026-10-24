// Shared: theme (light/dark) + mobile bottom tab bar + toggle buttons
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem('theme');
  root.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');

  function setTheme(t) { localStorage.setItem('theme', t); root.setAttribute('data-theme', t); sync(); }
  window.toggleTheme = () => setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  const icon = () => root.getAttribute('data-theme') === 'dark' ? 'fa-sun' : 'fa-moon';
  function sync() { document.querySelectorAll('.tgl i').forEach((i) => { i.className = 'fas ' + icon(); }); }

  const here = location.pathname;
  const items = [
    ['/pages/dashboard.html', 'fa-home', 'Home'],
    ['/pages/chat.html', 'fa-comment-dots', 'Chats'],
    ['/pages/groups.html', 'fa-users', 'Groups'],
    ['/pages/tasks.html', 'fa-tasks', 'Tasks'],
    ['/pages/security.html', 'fa-ellipsis-h', 'More']
  ];
  const bn = document.createElement('nav');
  bn.className = 'bn';
  bn.innerHTML = items.map(([h, i, l]) => `<a href="${h}" class="${here === h || (l === 'More' && ['/pages/calendar.html', '/pages/documents.html'].includes(here)) ? 'on' : ''}"><i class="fas ${i}"></i>${l}</a>`).join('');
  document.body.appendChild(bn);

  const tb = document.querySelector('.tb');
  let me = null; try { me = JSON.parse(sess.get('user') || 'null'); } catch (e) {}
  if (tb && me && me.username && window.avImg) {
    const chip = document.createElement('div');
    chip.className = 'uchip';
    chip.innerHTML = window.avImg(me.username, 32) + '<span></span>';
    chip.lastChild.textContent = me.username;
    tb.appendChild(chip);
  }
  if (tb) {
    const b = document.createElement('button');
    b.className = 'tgl'; b.title = 'Toggle dark mode'; b.setAttribute('aria-label', 'Toggle dark mode');
    b.innerHTML = '<i class="fas"></i>'; b.onclick = window.toggleTheme;
    tb.appendChild(b);
  }
  const foot = document.querySelector('.sidebar-footer');
  if (foot) {
    const b = document.createElement('button');
    b.className = 'tgl'; b.title = 'Toggle dark mode'; b.setAttribute('aria-label', 'Toggle dark mode');
    b.style.background = 'rgba(255,255,255,.1)'; b.style.color = '#fff';
    b.innerHTML = '<i class="fas"></i>'; b.onclick = window.toggleTheme;
    foot.appendChild(b);
  }
  sync();

  // ---- connection status banner + socket helper ----
  const bar = document.createElement('div');
  bar.id = 'connBanner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2000;padding:6px 12px;text-align:center;font-size:.8rem;color:#fff;display:none';
  document.body.appendChild(bar);
  let problems = { net: false, server: false, db: false, socket: false }, flashTimer;
  function show() {
    clearTimeout(flashTimer);
    let msg = '', bg = '#e5484d';
    if (problems.net) msg = 'You are offline. Check your Wi-Fi / network cable.';
    else if (problems.server) msg = `Cannot reach the server at ${location.host}. Retrying…`;
    else if (problems.db) { msg = 'The server is running but its database is not connected.'; bg = '#c27d0e'; }
    else if (problems.socket) { msg = 'Live connection lost. Reconnecting…'; bg = '#c27d0e'; }
    bar.style.background = bg; bar.textContent = msg; bar.style.display = msg ? 'block' : 'none';
  }
  window.addEventListener('online', () => { problems.net = false; check(); });
  window.addEventListener('offline', () => { problems.net = true; show(); });

  async function check() {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' });
      const h = await r.json();
      problems.server = false; problems.db = !h.db;
    } catch (e) { problems.server = true; }
    clearTimeout(t); show();
  }
  setInterval(check, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

  // pages call watchSocket(socket) so lost/restored connections show up and expired logins are handled
  window.watchSocket = function (socket, onReconnect) {
    let wasDown = false;
    socket.on('disconnect', () => { wasDown = true; problems.socket = true; show(); });
    socket.on('connect_error', (err) => {
      if (err && err.message === 'Not authorized') { sess.clear(); location.href = '/pages/login.html'; return; }
      problems.socket = true; show();
    });
    socket.on('connect', () => {
      problems.socket = false;
      if (wasDown) {
        bar.style.background = '#10a463'; bar.textContent = 'Reconnected'; bar.style.display = 'block';
        flashTimer = setTimeout(show, 2000);
        if (onReconnect) onReconnect();
      } else show();
      wasDown = false;
    });
  };
  check();
})();

// ================= Notifications: bell, panel, live toast =================
(function () {
  const token = window.sess && sess.get('token');
  if (!token) return;
  const H = { Authorization: 'Bearer ' + token };

  const css = document.createElement('style');
  css.textContent = `
  .bellwrap{position:relative;display:inline-flex;margin-left:auto}
  .bell{position:relative;border:0;background:var(--bg,#f3f6f8);color:#64748b;width:36px;height:36px;border-radius:50%;cursor:pointer}
  .bell .bdg{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e5484d;color:#fff;font-size:.65rem;font-weight:700;line-height:18px;text-align:center}
  .bpanel{position:fixed;z-index:3000;width:min(380px,94vw);max-height:70vh;overflow:auto;background:#fff;color:#1b2a33;border:1px solid #e4eaee;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18)}
  [data-theme=dark] .bpanel{background:#14262a;color:#e6f0ee;border-color:#22393e}
  .bpanel .bh{display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #e4eaee;font-weight:700;font-size:.9rem}
  [data-theme=dark] .bpanel .bh{border-color:#22393e}
  .bpanel .bh button{margin-left:auto;border:0;background:none;color:#0d8a53;font-size:.75rem;font-weight:600;cursor:pointer}
  .bpanel .bi{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid #eef2f4;cursor:pointer;font-size:.8rem}
  [data-theme=dark] .bpanel .bi{border-color:#1d3338}
  .bpanel .bi:hover{background:#f1faf6}[data-theme=dark] .bpanel .bi:hover{background:#1a3036}
  .bpanel .bi.unread{background:#eefaf4}[data-theme=dark] .bpanel .bi.unread{background:#16372f}
  .bpanel .bi .ic{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;font-size:.8rem;color:#fff;background:#10a463}
  .bpanel .bi .ic.task_due_soon{background:#f5a524}.bpanel .bi .ic.task_overdue{background:#e5484d}.bpanel .bi .ic.task_completed{background:#3b82f6}
  .bpanel .bi b{display:block;font-size:.82rem}.bpanel .bi small{color:#7a8a94;font-size:.7rem}
  .bpanel .bi .dot{width:8px;height:8px;border-radius:50%;background:#10a463;margin-left:auto;flex:none;align-self:center}
  .btoast{position:fixed;right:16px;bottom:76px;z-index:3100;max-width:340px;background:#0b3b30;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 10px 28px rgba(0,0,0,.3);cursor:pointer;font-size:.82rem;border-left:4px solid #3ddc97}
  .btoast b{display:block;margin-bottom:2px}`;
  document.head.appendChild(css);

  const wrap = document.createElement('div');
  wrap.className = 'bellwrap';
  wrap.innerHTML = '<button class="bell" aria-label="Notifications" title="Notifications"><i class="fas fa-bell"></i><span class="bdg" hidden></span></button>';
  const panel = document.createElement('div');
  panel.className = 'bpanel'; panel.hidden = true;
  document.body.appendChild(panel);

  const tb = document.querySelector('.tb');
  const chatHead = document.querySelector('.panel-header');
  if (tb) tb.insertBefore(wrap, tb.querySelector('.uchip') || tb.querySelector('.tgl'));
  else if (chatHead) { wrap.style.marginLeft = '0'; chatHead.insertBefore(wrap, chatHead.lastElementChild); }
  else { wrap.style.cssText = 'position:fixed;top:10px;right:12px;z-index:1100'; document.body.appendChild(wrap); }

  const bell = wrap.querySelector('.bell'), badge = wrap.querySelector('.bdg');
  const ICON = { task_assigned: 'fa-clipboard-list', task_reassigned: 'fa-random', task_due_soon: 'fa-clock', task_overdue: 'fa-exclamation', task_completed: 'fa-check' };
  const ago = (d) => { const m = Math.max(0, (Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.floor(m) + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  let items = [], unread = 0;

  function draw() {
    badge.hidden = unread === 0; badge.textContent = unread > 99 ? '99+' : unread;
    panel.textContent = '';
    const head = document.createElement('div'); head.className = 'bh'; head.textContent = 'Notifications';
    const all = document.createElement('button'); all.textContent = 'Mark all read';
    all.onclick = async () => { await fetch('/api/notifications/read-all', { method: 'POST', headers: H }); load(); };
    head.appendChild(all); panel.appendChild(head);
    if (!items.length) { const e = document.createElement('div'); e.className = 'bi'; e.style.cursor = 'default'; e.textContent = 'No notifications yet.'; panel.appendChild(e); }
    items.forEach((n) => {
      const row = document.createElement('div'); row.className = 'bi' + (n.read ? '' : ' unread');
      const ic = document.createElement('div'); ic.className = 'ic ' + n.type; ic.innerHTML = '<i class="fas ' + (ICON[n.type] || 'fa-bell') + '"></i>';
      const txt = document.createElement('div');
      const t = document.createElement('b'); t.textContent = n.title;
      const body = document.createElement('div'); body.textContent = n.body;
      const when = document.createElement('small'); when.textContent = ago(n.createdAt);
      txt.append(t, body, when); row.append(ic, txt);
      if (!n.read) { const d = document.createElement('span'); d.className = 'dot'; row.appendChild(d); }
      row.onclick = async () => { try { await fetch('/api/notifications/' + n._id + '/read', { method: 'POST', headers: H }); } catch (e) {} if (n.link && n.link.startsWith('/')) location.href = n.link; else load(); };
      panel.appendChild(row);
    });
  }

  async function load() {
    try {
      const r = await fetch('/api/notifications', { headers: H });
      if (!r.ok) return;
      const d = await r.json(); items = d.items || []; unread = d.unread || 0; draw();
    } catch (e) { /* offline: the connection banner already tells the user */ }
  }

  function place() {
    const r = bell.getBoundingClientRect();
    panel.style.top = Math.min(r.bottom + 8, window.innerHeight - 120) + 'px';
    const w = Math.min(380, window.innerWidth * 0.94);
    panel.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
  }
  bell.onclick = (e) => {
    e.stopPropagation(); panel.hidden = !panel.hidden;
    if (!panel.hidden) { place(); load(); }
    if (window.Notification && window.isSecureContext && Notification.permission === 'default') Notification.requestPermission();
  };
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true; });
  window.addEventListener('resize', () => { if (!panel.hidden) place(); });

  function toast(n) {
    const el = document.createElement('div'); el.className = 'btoast';
    const t = document.createElement('b'); t.textContent = n.title; const b = document.createElement('div'); b.textContent = n.body;
    el.append(t, b);
    el.onclick = () => { if (n.link && n.link.startsWith('/')) location.href = n.link; else el.remove(); };
    document.body.appendChild(el); setTimeout(() => el.remove(), 8000);
    try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(n.title, { body: n.body }); } catch (e) {}
  }

  // live updates over the socket (loads the socket library when the page does not already have it)
  function connect() {
    const s = io({ auth: { token } });
    if (window.watchSocket) window.watchSocket(s);
    s.on('connect', load);
    s.on('notification', (n) => { load(); toast(n); });
  }
  if (window.io) connect();
  else { const sc = document.createElement('script'); sc.src = '/vendor/socket.io.min.js'; sc.onload = connect; document.body.appendChild(sc); }
  setInterval(load, 60000);
  load();
})();
