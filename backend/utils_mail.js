// E-mail: Nodemailer over (Gmail) SMTP, templates, and "send each e-mail only once" bookkeeping.
// Credentials come only from environment variables and never reach the browser.
const nodemailer = require('nodemailer');
const NotificationLog = require('./models/NotificationLog');

const TZ = process.env.DISPLAY_TZ || 'Asia/Kolkata';
const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
const maxAttempts = () => Number(process.env.EMAIL_MAX_ATTEMPTS) || 3;

const enabled = () => process.env.EMAIL_NOTIFICATIONS !== 'false' && !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport = null;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 465;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') },   // Gmail shows app passwords with spaces
    pool: true, maxConnections: 2, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
  });
  return transport;
}
const setTransport = (t) => { transport = t; };   // tests

async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  return getTransport().sendMail({ from, to, subject, text, html });
}

// Sends one e-mail for a unique `key`. A second call with the same key does nothing (sent, or still pending / out of retries).
// A failed send is retried by later runs, up to EMAIL_MAX_ATTEMPTS, at least 10 minutes apart.
async function sendOnce({ key, type, userId, taskId, groupId, to, subject, text, html }) {
  if (!enabled()) return { status: 'disabled' };
  if (!to) return { status: 'no-address' };
  let log;
  try {
    log = await NotificationLog.create({ key, type, userId, taskId, groupId, to, subject, status: 'pending', attempts: 1, lastAttemptAt: new Date() });
  } catch (e) {
    if (e.code !== 11000) throw e;
    const now = Date.now();
    log = await NotificationLog.findOneAndUpdate({
      key, attempts: { $lt: maxAttempts() },
      $or: [{ status: 'failed', lastAttemptAt: { $lte: new Date(now - 10 * 60000) } }, { status: 'pending', lastAttemptAt: { $lte: new Date(now - 15 * 60000) } }]   // 'pending' this old = the server stopped mid-send
    }, { $set: { status: 'pending', lastAttemptAt: new Date() }, $inc: { attempts: 1 } }, { new: true });
    if (!log) return { status: 'duplicate' };
  }
  try {
    await sendMail({ to, subject, text, html });
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date(), error: '' } });
    return { status: 'sent' };
  } catch (e) {
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: 'failed', error: String(e.message).slice(0, 300) } });
    console.error(`E-mail "${type}" to ${to} failed:`, e.message);
    return { status: 'failed', error: e.message };
  }
}

// ---------- templates ----------
function layout({ heading, intro, rows = [], button, footer }) {
  const trs = rows.filter((r) => r[1]).map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7a86;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#16222b"><b>${esc(v)}</b></td></tr>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16222b">
<div style="font-weight:700;color:#10a463;font-size:18px;margin-bottom:12px">Safe WorkChat</div>
<h2 style="margin:0 0 10px;font-size:20px">${esc(heading)}</h2><p style="margin:0 0 14px;line-height:1.5">${esc(intro)}</p>
${trs ? `<table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">${trs}</table>` : ''}
${button ? `<a href="${esc(button.url)}" style="display:inline-block;background:#10a463;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">${esc(button.label)}</a>` : ''}
<p style="margin:22px 0 0;font-size:12px;color:#8a97a1">${esc(footer || 'You receive this because you use Safe WorkChat.')}</p></div>`;
  const text = [heading, '', intro, '', ...rows.filter((r) => r[1]).map(([k, v]) => `${k}: ${v}`), '', button ? `${button.label}: ${button.url}` : '', '', footer || ''].join('\n');
  return { html, text };
}

const taskRows = (t, assigneeName, groupName) => [['Task', t.title], ['Group', groupName], ['Assigned to', assigneeName], ['Deadline', fmtDate(t.dueDate)], ['Priority', t.priority], ['Status', t.status],
  ['Details', t.description ? String(t.description).slice(0, 300) : '']];
const taskLink = (t) => ({ label: 'Open the task', url: `${appUrl()}/pages/tasks.html?id=${t._id}` });

function taskEmail(kind, { task, assigneeName, groupName, assignerName }) {
  const rows = taskRows(task, assigneeName, groupName);
  const m = {
    task_assigned: { subject: `New task assigned: ${task.title}`, heading: 'A task was assigned to you', intro: `${assignerName || 'A group manager'} assigned you a task in “${groupName}”.` },
    task_due_soon: { subject: `Deadline approaching: ${task.title}`, heading: 'Your task is due soon', intro: `“${task.title}” is due ${fmtDate(task.dueDate)}.` },
    task_overdue: { subject: `Overdue: ${task.title}`, heading: 'Your task is overdue', intro: `“${task.title}” was due ${fmtDate(task.dueDate)} and is not completed yet.` }
  }[kind];
  return { subject: m.subject, ...layout({ heading: m.heading, intro: m.intro, rows, button: taskLink(task) }) };
}

module.exports = { enabled, sendMail, sendOnce, setTransport, layout, taskEmail, fmtDate, appUrl, esc };
