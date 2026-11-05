// npm run test:email -- you@example.com     (sends one test e-mail with the SMTP settings from .env)
require('dotenv').config();
const mail = require('../utils_mail');
(async () => {
  const to = process.argv[2] || process.env.SMTP_USER;
  if (!mail.enabled()) { console.error('❌ Set SMTP_USER and SMTP_PASS (and EMAIL_NOTIFICATIONS=true) in backend/.env first.'); process.exit(1); }
  try {
    const e = mail.layout({ heading: 'Test e-mail', intro: 'If you can read this, Safe WorkChat can send e-mail.', rows: [['Sent at', mail.fmtDate(new Date())]] });
    await mail.sendMail({ to, subject: 'Safe WorkChat test e-mail', ...e });
    console.log('✅ Test e-mail sent to', to);
  } catch (err) { console.error('❌ Could not send:', err.message, '\n   Gmail needs an App Password (not your normal password): https://myaccount.google.com/apppasswords'); process.exit(1); }
})();
