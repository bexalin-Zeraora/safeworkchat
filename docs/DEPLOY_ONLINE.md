# Deploying Safe WorkChat online (MongoDB Atlas + Google sign-in)

## 1. MongoDB Atlas
1. Create a free cluster (M0) at https://cloud.mongodb.com.
2. **Database Access**: add a database user with a strong password.
3. **Network Access**: allow your server's IP. While testing you can use `0.0.0.0/0` (anyone with the password can connect), then tighten it.
4. **Connect, Drivers**: copy the connection string and put the database name in it:
   `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/safe-workchat?retryWrites=true&w=majority`
   (If the password has special characters, URL-encode them, for example `@` becomes `%40`.)

## 2. Google sign-in (Google Cloud Console)
1. https://console.cloud.google.com, create or choose a project.
2. **APIs & Services, OAuth consent screen**: choose External, fill the app name and your email. While the app is in *Testing*, only the Google accounts you add under **Test users** can sign in. Click **Publish app** when you want everyone to be able to.
3. **APIs & Services, Credentials, Create credentials, OAuth client ID**, type **Web application**.
4. **Authorized JavaScript origins** (exact, no trailing slash, no path):
   - `https://your-app.example.com` (your deployed address)
   - `http://localhost:5000` (for testing on your own laptop)
5. Copy the **Client ID** (looks like `123456-abc.apps.googleusercontent.com`). You do not need the client secret or a redirect URI.

## 3. Environment variables on your host
| Name | Value |
|---|---|
| `MONGODB_URI` | the Atlas connection string from step 1 |
| `JWT_SECRET` | a long random string, `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | the Client ID from step 2 (leave empty to hide the Google button) |
| `NODE_ENV` | `production` (turns on HTTPS-only headers) |
| `DISPLAY_TZ` | optional, for dates in chat notices, default `Asia/Kolkata` |

Never commit `.env` to git. `PORT` is normally set by the host.

## 4. Hosting
Use a Node host that supports WebSockets (Render, Railway, Fly.io, a VPS, ...). Typical settings:
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Run **one** instance (live chat keeps connections in the server's memory).
- The host provides HTTPS. Desktop notification pop-ups also work only over HTTPS (or localhost).

## 5. Things to know
- **Uploaded files** (task proof documents and profile pictures) are saved in `backend/uploads` on the server's disk. Many free hosts erase that disk on every restart or deploy. Attach a persistent disk to that folder, or ask for a change to cloud file storage. Messages, tasks, documents and notifications are in Atlas and are safe.
- **Google accounts and chat encryption:** Google proves who the person is, but the chat keys are protected by a secret only the user knows. A new Google user therefore creates an **encryption passphrase** at first sign-in and types it each time they sign in. If it is forgotten, old messages cannot be recovered (the server cannot help; that is what end-to-end encryption means).
- **Existing password accounts are never merged automatically** with a Google account that has the same email (the app does not verify email addresses, so merging could let a stranger take over an account). The user logs in with their password and presses **Connect Google** on the Profile page.
- **Demo data** (`npm run demo`) refuses to run when `NODE_ENV=production`. To fill Atlas with test accounts, run it from your laptop with `MONGODB_URI` pointing at Atlas and `NODE_ENV` not set. Those accounts share a known password, so delete them before real use.
- Messages, group keys and passphrases never reach the server in readable form. Tasks, documents and uploaded files are stored as normal data (protected by login and group roles).

## 6. Troubleshooting
| Problem | Likely cause |
|---|---|
| No Google button | `GOOGLE_CLIENT_ID` is empty, or the browser blocks `accounts.google.com` |
| "origin_mismatch" or "The given origin is not allowed" | the deployed address is missing from **Authorized JavaScript origins** (step 2.4) |
| "Access blocked: app has not completed verification" | the consent screen is in Testing: add your Google account as a **Test user** or publish the app |
| Google pop-up closes with no sign-in | the browser blocked the pop-up, allow pop-ups for the site |
| Server exits at start: "MongoDB Connection Error" | wrong password in `MONGODB_URI`, or Atlas **Network Access** does not allow the server's IP |
| "Missing JWT_SECRET, MONGODB_URI" | environment variables are not set on the host |
