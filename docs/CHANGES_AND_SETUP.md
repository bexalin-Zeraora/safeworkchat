# Safe WorkChat – enhancements: setup, deployment, testing

## 1. What was added / changed

| Area | Summary |
|---|---|
| E-mail notifications | Resend HTTPS API (recommended) or Nodemailer SMTP fallback. E-mails for: task assigned, deadline approaching, task overdue, inactive user, password reset. Scheduler = `node-cron`. Every e-mail has a unique key in the `notificationlogs` collection, so nothing is sent twice. Failed sends are retried (default max 3, ≥10 min apart). |
| Group creation | Search friends by **name or e-mail**, tick several people (the list stays open), chips with ✕, "select all shown", per-person role, duplicates impossible, members shown on the Groups page. Backend creates group + all members in one step and removes the group if anything fails. |
| Authentication | Email/password register + login (bcrypt, JWT) unchanged. **New:** forgot / reset password by e-mailed one-time token (SHA-256 hashed in DB, 60 min, single use). **Google sign-in no longer asks for a passphrase/password** (see §6 for how encryption keys are handled). |
| Group files | New **Files** page (sidebar + folder button in the chat header). Upload, list, search, filter by type, sort, preview (images, PDF, text), download, delete. Stored outside the web root, served only through authenticated routes. |
| Existing documents | Upload TXT / MD / DOCX (opens in the editor), PDF / images / DOC (preview, download, **replace file**). Saving updates the **same** document as a new version. History shows who and when; restore creates a new version. |
| Task documents | A document can belong to a task. **Only the assignee can edit / replace / restore it.** Managers may view and download; other members cannot see it; it is never posted into group chat. Task page has a new **Documents** tab. |
| Group documents | Documents page now separates *Created in Safe WorkChat*, *Uploaded* and *Task documents*, with group / source filters. |
| Security | Extension + browser MIME + real file bytes (magic numbers) must agree; stored under random UUID names; path-traversal safe resolver; size limit; sandboxed preview headers; no public file URLs; atomic version saves; rate limits on forgot/reset. |

## 2. New and modified files

**New (backend):** `controllers/fileController.js`, `routes/fileRoutes.js`, `models/GroupFile.js`, `models/NotificationLog.js`, `middleware/memoryUpload.js`, `jobs/emailJobs.js`, `utils_mail.js`, `utils_storage.js`, `utils_filetype.js`, `utils_keywrap.js`, `utils_active.js`, `scripts/sendTestEmail.js`, `tests/run.js`
**New (frontend):** `pages/files.html`, `js/files.js`, `css/files.css`, `pages/reset-password.html`, `js/reset-password.js`
**Modified (backend):** `server.js`, `package.json`, `.env.example`, `controllers/{authController,documentController,groupController,taskController,userController,friendController}.js`, `middleware/{authMiddleware,upload}.js`, `models/{User,Document,DocumentVersion}.js`, `routes/{authRoutes,documentRoutes}.js`
**Modified (frontend):** `js/{auth,groups,documents,tasks,chat,nav}.js`; `pages/login.html`, `groups.html`, `documents.html`, `chat.html`; every page's sidebar (new "Files" link).

## 3. npm packages

New: `nodemailer`, `node-cron`, `mammoth` (reads .docx on the server). Run `npm install` in `backend/` (use `npm install`, not `npm ci`, because `package-lock.json` has to pick up the new packages).

## 4. Environment variables (`backend/.env.example` has all of them)

| Variable | Purpose |
|---|---|
| `SMTP_USER`, `SMTP_PASS` | Gmail address and a Gmail **App Password** (Google account → Security → 2-Step Verification → App passwords). Server-side only. |
| `SMTP_HOST/PORT/SECURE`, `MAIL_FROM` | Default `smtp.gmail.com`, `465`, `true`. |
| `EMAIL_NOTIFICATIONS` | `false` switches all e-mail off. E-mail is also off automatically when both Resend and SMTP credentials are empty. |
| `APP_URL` | Public address, used for links in e-mails (e.g. `https://your-app.onrender.com`). |
| `DUE_SOON_HOURS` (24), `OVERDUE_EMAIL_DAYS` (7) | "Deadline approaching" window; stop e-mailing about tasks overdue longer than this. |
| `INACTIVITY_DAYS` (7), `INACTIVITY_CHECK_CRON` (`0 * * * *`), `EMAIL_TASK_CRON` (`* * * * *`) | Inactivity threshold and schedules. |
| `EMAIL_MAX_ATTEMPTS`, `EMAIL_MAX_PER_RUN`, `PASSWORD_RESET_MINUTES` | Retry cap, per-run cap, reset-link lifetime. |
| `KEY_WRAP_SECRET` | 32+ random characters. Protects the encryption keys of Google-created accounts. **Set once, never change.** Falls back to `JWT_SECRET`. |
| `MAX_UPLOAD_MB` (10), `UPLOAD_DIR` | Upload size limit; folder for all uploads (use a persistent disk on Render). |
| `GOOGLE_CLIENT_ID` | As before. Authorised JavaScript origins in Google Cloud must include your site URL. |

## 5. MongoDB changes (no manual migration needed)

Mongoose creates everything on first use; existing data keeps working.
- **users**: new optional fields `lastActiveAt`, `resetTokenHash`, `resetTokenExpires`, `serverKey`. Existing users without `lastActiveAt` are treated as active since `createdAt` and get updated on their next request.
- **documents**: new `kind` (default `text`), `source` (default `created`), `taskId`, `file`; `type` accepts `pdf/png/jpg/webp/doc` too. Old documents behave as before.
- **documentversions**: new optional `file`.
- **New collections**: `groupfiles`, `notificationlogs`.

## 6. Authentication and encryption keys (please read)

Chats are end-to-end encrypted with a private key that was always locked with the user's **password**. Google gives the app no secret to lock a key with, which is why Google sign-in used to ask for a separate "passphrase". Now:
- **Accounts created with Google**: the server generates the key pair and stores the private key wrapped with `KEY_WRAP_SECRET` (AES-256-GCM); it is handed to the browser after a successful Google login. Nothing extra is asked. *Trade-off:* for these accounts the server operator could technically decrypt their key, so they are not "zero-knowledge" like password accounts.
- **Password accounts**: unchanged; key locked by the password in the browser.
- **Older Google-only accounts that already have a passphrase**: asked once more, then offered a switch to automatic unlock.
- **Password reset on a password account**: the key backup is still locked with the *old* password. At the next login the app asks for the old password once and re-locks the key with the new one. If the old password is also forgotten, the user can "start with new keys" (old encrypted history becomes unreadable, and they must be re-added to groups to read new messages).
- A Google email that already has a password account is **not auto-merged** (prevents account take-over); the user logs in with the password and connects Google from Profile.

## 7. Local setup

```bash
cd backend
cp .env.example .env        # fill MONGODB_URI, JWT_SECRET, SMTP_*, APP_URL ...
npm install
npm run test                # offline logic tests (no database needed)
npm run test:email -- you@gmail.com   # sends one test e-mail
npm start                   # http://localhost:5000
```

### Manual test checklist
1. **Register / login** with e-mail + password; log out; log in again.
2. **Forgot password**: login page → "Forgot Password?" → check inbox → link → new password → log in (you will be asked for the old password once if the account is password-based).
3. **Google**: with `GOOGLE_CLIENT_ID` set, sign in with a new Google account → goes straight to the dashboard, no prompt.
4. **Group with several members**: become friends with 3 users, Groups → search by name/e-mail → tick several → remove one with ✕ → Create → open Groups page → "Members".
5. **E-mails**: as a manager assign a task to another user → they get an e-mail. Set a task deadline ~1 h ahead → e-mail within a minute (check `notificationlogs`). Set a past deadline → overdue e-mail once. Set `INACTIVITY_DAYS=0.0007` (~1 min) temporarily or edit a user's `lastActiveAt` in MongoDB to 10 days ago → inactivity e-mail once, not again.
6. **Files**: Files page → upload png/pdf/docx/txt → search, filter, preview, download; a non-member gets 403; delete as uploader/manager; try renaming `.exe` to `.png` → rejected.
7. **Documents**: Upload a .txt and .docx → edit → Save → history shows new version, who and when → Restore. Upload a PDF → preview → Replace file → version list.
8. **Task document permission**: on a task, Documents tab → New document as the assignee. Log in as the group Admin: can open, no Edit / Replace / Restore; API `PUT` returns 403. A plain member: 403 on open.
9. **Regression**: chat (encrypted), task assignment + phases, notifications, calendar.

## Resend email setup (no SMTP)
1. Create a Resend account at https://resend.com and generate an API key at https://resend.com/api-keys.
2. Add a sending domain in Resend and publish the DNS records Resend provides (SPF/DKIM). Wait until the domain is verified.
3. In Render → your Web Service → Environment, add `RESEND_API_KEY` (the API key) and `MAIL_FROM` (for example `Safe WorkChat <notifications@your-domain.com>` using the verified domain). Keep `EMAIL_NOTIFICATIONS=true`.
4. Set `APP_URL` to your exact Render HTTPS URL. Redeploy/restart the service.
5. Test from the backend shell with `npm run test:email -- your-real-address@example.com`. The app uses Resend over HTTPS; no SMTP host, port, Gmail password, or app password is needed.
6. Keep the API key private: never put it in frontend JavaScript or commit it to Git.

## 8. Deploying on Render

1. Push the repo; create a **Web Service**, root directory `backend`, build `npm install`, start `npm start`.
2. Add a **Persistent Disk** (e.g. mount `/var/data`) and set `UPLOAD_DIR=/var/data/uploads` – otherwise uploaded files disappear on every deploy.
3. Environment: everything in the table above. `NODE_ENV=production`, `APP_URL=https://<service>.onrender.com`, `MONGODB_URI` (Atlas, allow Render's IPs / 0.0.0.0/0), long random `JWT_SECRET`, `SESSION_SECRET`, `KEY_WRAP_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`.
4. Google: add the Render URL under *Authorised JavaScript origins*.
5. Free Render instances sleep when idle: scheduled e-mails only run while the service is awake. Use a paid instance (or an external pinger) for dependable reminders. Several instances are safe: e-mail keys are unique in the database.

## 9. Limitations

- These changes were written and unit-tested offline (`npm test`, 15 tests with fakes). They have **not** been run against a real MongoDB, Gmail account or Google OAuth client – please run the checklist in §7 once.
- DOCX upload keeps the **text** (paragraphs); fonts, tables and images are not carried into the editor. The original file stays downloadable as version 1.
- No annotation tool for PDF/images: they can be previewed, downloaded and replaced (each replacement is a version).
- Group member search is limited to your friends (existing rule: only friends can be added, needed for end-to-end encryption). E-mail addresses of friends are now returned by `/api/friends` so they can be searched.
- Chat-message attachments are intentionally not touched; group files live only in the Files section.
- Task documents of a task are visible only to its assignee and group Admins/Managers.
- E-mail delivery is at-least-once in the rare case the server dies between sending and writing the log.
