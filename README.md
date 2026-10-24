# Safe WorkChat

Offline-first, real-time workplace collaboration app (chat, tasks, calendar, documents) — Node.js, Express, MongoDB, Socket.IO, vanilla JS + Bootstrap 5.

## Run locally
1. Install [MongoDB Community Server](https://www.mongodb.com/try/download/community) and start it.
2. `cd backend && cp .env.example .env` and set `JWT_SECRET` / `SESSION_SECRET`.
3. `npm install && npm start`
4. Open http://localhost:5000

## Features
- Auth (bcrypt + JWT), group chat (Socket.IO), per-group roles (Admin / Manager / Member)
- Tasks with priority, status and activity history
- **Calendar**: month view of task deadlines across groups, overdue highlighting, create/update tasks, live updates, `.ics` export

## API (calendar / tasks)
| Method | Route | Who |
|---|---|---|
| GET | `/api/tasks?groupId=&from=&to=` | group members |
| POST | `/api/tasks` | Admin, Manager |
| PATCH | `/api/tasks/:id` | status: assignee/Admin/Manager; details: Admin/Manager |
| GET | `/api/tasks/:id/activity` | group members |
| GET | `/api/groups/:id/members` | group members |
