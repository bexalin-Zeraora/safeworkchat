// Minimal Gmail SMTP client using Node's built-in TLS module (no extra runtime dependency).
// Configure SMTP_USER and SMTP_APP_PASSWORD with a Gmail address and a Google App Password.
const tls = require('tls');

function sendEmail({ to, subject, text }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) return Promise.resolve({ skipped: true, reason: 'SMTP is not configured' });
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Promise.resolve({ skipped: true, reason: 'Invalid recipient email' });

  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT) || 465, servername: process.env.SMTP_HOST || 'smtp.gmail.com' });
    let buffer = '', pending = null, replies = [], closed = false;
    const fail = (e) => { if (closed) return; closed = true; socket.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    socket.setTimeout(20000, () => fail(new Error('SMTP connection timed out')));
    const response = () => new Promise((res, rej) => {
      if (replies.length) { res(replies.shift()); return; }
      pending = { res, rej };
      const timer = setTimeout(() => { pending = null; rej(new Error('SMTP response timed out')); }, 15000);
      const old = pending.res;
      pending.res = (v) => { clearTimeout(timer); old(v); };
    });
    const command = async (line, expected) => {
      const p = response(); socket.write(line + '\r\n');
      const reply = await p;
      if (!expected.includes(Number(reply.slice(0, 3)))) throw new Error('SMTP rejected command: ' + reply.slice(0, 300));
      return reply;
    };
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/); buffer = lines.pop();
      for (const line of lines) {
        if (/^\d{3} /.test(line)) { if (pending) { const p = pending; pending = null; p.res(line); } else replies.push(line); }
      }
    });
    socket.on('error', fail);
    socket.on('secureConnect', async () => {
      try {
        await response(); // greeting
        await command('EHLO safeworkchat.local', [250]);
        await command('AUTH LOGIN', [334]);
        await command(Buffer.from(user).toString('base64'), [334]);
        await command(Buffer.from(pass).toString('base64'), [235]);
        await command(`MAIL FROM:<${user}>`, [250]);
        await command(`RCPT TO:<${to}>`, [250, 251]);
        await command('DATA', [354]);
        const clean = (v) => String(v || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
        const body = String(text || '').replace(/^\./gm, '..');
        socket.write(`From: SafeWorkChat <${user}>\r\nTo: ${to}\r\nSubject: ${clean(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`);
        const p = response();
        const reply = await p;
        if (!reply.startsWith('250')) throw new Error('SMTP could not accept message: ' + reply);
        await command('QUIT', [221]);
        closed = true; socket.end(); resolve({ sent: true });
      } catch (e) { fail(e); }
    });
  });
}

module.exports = { sendEmail };
