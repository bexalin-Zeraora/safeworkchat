// npm run test:email -- you@example.com     (sends one test e-mail with the Resend API or SMTP settings from .env)
require('dotenv').config();
const mail = require('../utils_mail');
(async () => {
  const to = process.argv[2] || process.env.TEST_EMAIL_TO || process.env.SMTP_USER;
  if (!mail.enabled()) { console.error('❌ Set RESEND_API_KEY and MAIL_FROM (or SMTP_USER and SMTP_PASS), and EMAIL_NOTIFICATIONS=true.'); process.exit(1); }
  try {
    const e = mail.layout({ heading: 'Test e-mail', intro: 'If you can read this, Safe WorkChat can send e-mail.', rows: [['Sent at', mail.fmtDate(new Date())]] });
    await mail.sendMail({ to, subject: 'Safe WorkChat test e-mail', ...e });
    console.log('✅ Test e-mail sent to', to);
  } catch (err) { console.error('❌ Could not send:', err.message, '\n   Check the Resend API key, verified sender domain, and MAIL_FROM value.'); process.exit(1); }
})();
