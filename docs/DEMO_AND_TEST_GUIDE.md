# Safe WorkChat: demo and test guide

## 1. Load the test data (do this just before the review)
```
cd backend
npm install
npm run demo:reset      # first time you can also use: npm run demo
npm start
```
Open http://localhost:5000. Run `demo:reset` shortly before you present, so the task deadlines ("due in 3 hours", "overdue") are fresh.
Within a minute of starting the server, the reminder messages and notifications appear by themselves.

**Password for every account: `Test@12345`** (log in with the username or the email).

## 2. Accounts to use
| Username | Email | Role / why use it |
|---|---|---|
| Bexalin B A | bexalin.b.a@test.local | Admin of **3rd year cse B** and **Mini Project III Team**. Assign tasks, add members, has a pending friend request |
| nirmala G | nirmala.g@test.local | Admin of **3rd year cse B** and **Lab Group 1** |
| stella Inba mary | stella.inba.mary@test.local | Manager (class group and lab group) |
| sorna lakshmi | sorna.lakshmi@test.local | Manager (class group) |
| Radhika | radhika@test.local | Manager of Mini Project III Team |
| Kavya | kavya@test.local | Plain member with 5 tasks: one due in 3 hours, one overdue, one in progress, one completed. Best account for the assignee demo |
| Pavithra, feronica, Janani S | pavithra@, feronica@, janani.s@test.local | Members of the project team with their own tasks |
| Demo Guest 1 | demo.guest.1@test.local | Sent a friend request to Bexalin B A; in no group |
| Demo Guest 2 | demo.guest.2@test.local | No friends and no groups: use it to test "add friend by code" |
| Everyone else in your class list | name@test.local | Members of 3rd year cse B |

Groups: **3rd year cse B** (39 people), **Mini Project III Team** (6), **Lab Group 1** (8).
Data included: 24 tasks (some overdue, some due soon, some completed), about 54 chat messages (encrypted), 4 documents with 2 to 3 saved versions each, 26 notifications.

Tip: use a different browser tab (or a private window) for each user. Each tab keeps its own login.

## 3. Ten-minute demo order
1. Login page (phone-size window too), then log in as **Bexalin B A**.
2. Dashboard: stats, upcoming tasks, bell icon.
3. Friends: accept **Demo Guest 1**'s request, show the friend code.
4. Chats, **3rd year cse B**: open the chat (shows "End-to-end encrypted") and task notices in the middle of the chat.
5. Tasks (two panels: My Tasks and Assigned to friends), **Assign Task** to Kavya. Show the notice in the group chat.
6. New tab, log in as **Kavya**: the bell shows the new task, the toast pops up live, and the calendar shows only her tasks.
7. As Kavya: Update Status on a stage (proof upload), then show the History tab.
8. As Bexalin: try to update Kavya's task progress (only the Team view, view only).
9. Documents: open "SRS Draft", Version History, Preview and Restore.
10. Security page and dark mode.

## 4. Test cases
| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Login by username | Log in as `Kavya` | Dashboard opens |
| 2 | Login by email | Log in as `kavya@test.local` | Dashboard opens |
| 3 | Wrong password | Wrong password for Kavya | Error message, no login |
| 4 | Tabs are independent | Log in as Kavya in tab 1, Bexalin in tab 2, log out in tab 2 | Tab 1 stays logged in |
| 5 | Back button after logout | Log out, press Back | Login page, no app page |
| 6 | Friend request | Bexalin: Friends, accept Demo Guest 1 | Guest 1 appears in friends |
| 7 | Add friend by code | Demo Guest 2 enters Bexalin's code | Request shows as pending on Bexalin's side |
| 8 | Hidden users | Create Group, type a name that is not your friend | Not listed |
| 9 | Create group | Bexalin: Groups, new group with 2 friends and roles | Group appears in Chats |
| 10 | Add member to group | Chats, group info (i), Add a friend | New member sees only messages sent after joining |
| 11 | Encrypted chat | Send a message in the class group as Kavya | Others read it; the database shows only ciphertext |
| 12 | Non-member blocked | Demo Guest 1 opens the class group chat | No groups listed, access refused |
| 13 | Assign task (Manager) | Bexalin: Tasks, Assign Task to Kavya | Task created, notice in group chat, notification for Kavya |
| 14 | Assign task (Member) | Log in as Kavya | No Assign Task button |
| 15 | Notification live | Kavya is logged in when the task is assigned | Bell badge goes up, toast pops up |
| 16 | Notification persistent | Kavya logs out, logs in again | Unread notifications still there until read |
| 17 | Only assignee updates progress | As Bexalin, open Kavya's task | View only; no Update Status button |
| 18 | Assignee updates progress | As Kavya, Update Status on a stage with a file | Progress and history update; file downloads |
| 19 | Task completed | Finish all 8 stages as Kavya | Status Completed, notice in group chat, assigner notified |
| 20 | Calendar only mine | Kavya opens Calendar | Only her 5 tasks, none of the others |
| 21 | Due-soon reminder | Start the server after `demo:reset` | Chat notice + notification: "Submit DBMS lab record is due in 3 hours" |
| 22 | Overdue notice | Same moment | Chat notice + notification: "Prepare OS assignment is overdue" |
| 23 | No repeat reminders | Wait 2 minutes | No duplicate reminders |
| 24 | Document version | Bexalin: Documents, SRS Draft, edit and Save | New version added to the history |
| 25 | Restore version | Restore version 1 | New version created with the old text |
| 26 | Viewer cannot edit | Kavya opens a document | View only |
| 27 | Export | Download .docx / .md / .txt | File downloads |
| 28 | Dark mode | Click the moon icon | Dark theme on every page, remembered |
| 29 | Mobile layout | Phone-size window | Bottom tab bar, chat list then chat |
| 30 | Connection lost | Stop the server for 10 seconds | Red banner, turns green "Reconnected" afterwards |
| 32 | Two task panels | Bexalin: Tasks, switch between **My Tasks** and **Assigned to friends** | My Tasks lists tasks given to her; Assigned to friends lists tasks she gave to others, with their name and a Friend badge, view only |
| 31 | Other laptop | Open the "Other devices" address from the terminal | App loads and works over the local network |
