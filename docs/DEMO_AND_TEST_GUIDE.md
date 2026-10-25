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
New accounts and password changes must follow the password rules (8+ characters with upper, lower, number and special character). Existing demo accounts are not affected.

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
Data included: 27 tasks (some overdue, some due soon, some completed), about 57 chat messages (encrypted), 3 direct chats, 4 documents with 2 to 3 saved versions each, about 29 notifications.
Two tasks have **no phases yet** (Organise seminar hall booking for Gopika, Prepare quiz questions for subha): the assigned person plans them.
Special tasks: **Run all feature test cases** (100 phases, 37 done, assigned to Bexalin B A), **Semester project report** (20 phases, Kavya), **Collect screenshots for review** (2 phases, Pavithra).
Uploaded documents to open: Kavya's **Submit DBMS lab record**, feronica's **Create ER diagram**, feronica's **Review SRS document**.
Direct chats: Bexalin B A with Kavya and Radhika, Kavya with Pavithra.

Tip: use a different browser tab (or a private window) for each user. Each tab keeps its own login.

## 3. Ten-minute demo order
1. Login page (phone-size window too), then log in as **Bexalin B A**.
2. Dashboard: stats, upcoming tasks, bell icon.
3. Friends: accept **Demo Guest 1**'s request, show the friend code, press **Message** next to Kavya (direct chat).
4. Chats, **3rd year cse B**: open the chat (shows "End-to-end encrypted") and task notices in the middle of the chat.
5. Tasks (two panels: My Tasks and Assigned to friends), **Assign Task** to Kavya. Show the notice in the group chat.
6. New tab, log in as **Kavya**: the bell shows the new task, the toast pops up live, and the calendar shows only her tasks.
7. As Kavya: Update Status on a stage (proof upload), then show the History tab.
8. As Bexalin: try to update Kavya's task progress (only the Team view, view only).
9. Tasks: open the 100-phase task, then Kavya's DBMS task, Files tab, View (document opens).
10. Profile: change the picture or username.
11. Documents: open "SRS Draft", Version History, Preview and Restore.
12. Security page and dark mode.

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
| 52 | Password rules on register | Create account page, type `abc`, then `Abcdefg1!` | A live checklist shows 7 rules (8+ characters, lowercase, uppercase, number, special, not common, not your name); the strength bar goes Weak, then Good |
| 53 | Weak password blocked | Submit `weakpass` | Refused with the rule that failed; no account is created |
| 54 | Confirm password | Type different passwords in the two boxes | "Passwords do not match" and the form is not submitted |
| 55 | Password contains username | Username `Ui Tester`, password `UiTester#2026` | Flagged: "Does not contain your username or email name" |
| 56 | Change password rules | Profile, Change password, try a weak one, the old one, a strong new one | Weak and "same as old" refused; strong accepted; old chats still open |
| 57 | Chat looks like the rest of the app | Open Chats | Same green sidebar, top bar with bell and your picture, same colours as Tasks and Friends; works on phone and in dark mode |
| 47 | Persistent notification cards | Assign Kavya a task; Kavya is on any page | A green card stays in the bottom-right corner on every page, even after reloading, until she opens it or presses the cross |
| 48 | Survives logout | Kavya logs out and in | Unread cards are still shown |
| 49 | Tab title | Look at the browser tab | Shows the unread count, e.g. (3) Safe WorkChat |
| 50 | Notifications page | Open Notifications in the sidebar | All notifications, Unread filter, Mark all read, Clear read |
| 51 | Desktop pop-ups | On localhost: Notifications page, Turn on desktop pop-ups, then assign a task | An OS pop-up that stays until clicked (only on localhost or https) |
| 33 | Start a direct chat | Bexalin: Chats, Direct tab, tap a friend under "Start a new chat" (or Friends, Message) | Chat opens, header says "End-to-end encrypted"; the friend sees it in their Direct tab |
| 34 | Direct chat is private | Log in as another class member | They cannot see or open that direct chat |
| 35 | Direct chat unread badge | Kavya is in the class group while Bexalin sends her a direct message | Green unread number on Kavya's Direct chat; clears when opened |
| 36 | Assignee plans the phases | Log in as **subha**, Tasks, "Prepare quiz questions", Plan phases; add 3 phases with names and descriptions, Save | The task shows her 3 phases; the assigner (stella Inba mary) gets a "Phases planned" notification |
| 37 | Phase limits | In Plan phases try to save 1 phase, then add more than 100 | Refused: a task needs 2 to 100 phases |
| 38 | Say which phase you are on | subha: Update Status, choose Phase 1, "I am working on this phase" | Phase 1 shows "In progress"; task becomes In Progress; assigner notified |
| 39 | Say which phase is OK | Update Status, choose any phase, "This phase is OK (completed)" | That phase turns green; when every phase is OK the task is Completed |
| 40 | Upload a document with a phase | Kavya: Update Status, Upload Document, Submit | Phase done; Bexalin gets a "Document uploaded" notification |
| 41 | Admin/Manager views the document | Bexalin: open Kavya's DBMS task, Files tab, View | The document opens in a new tab; Download also works |
| 42 | Other members cannot | Log in as Harini V, open the same task | File shown as locked; opening it directly is refused |
| 43 | Edit profile | Profile: change username and About me, Save | Name changes everywhere (top bar, chats, tasks) |
| 44 | Profile picture | Profile: Upload new picture | Your picture replaces the generated one everywhere; "Use default" restores it |
| 45 | Taken / unsafe username | Try a username that exists, or one containing < > | Refused with a message |
| 46 | Change password | Profile: Change password, then log out and in with the new one | Works, and old chats still decrypt |
| 32 | Two task panels | Bexalin: Tasks, switch between **My Tasks** and **Assigned to friends** | My Tasks lists tasks given to her; Assigned to friends lists tasks she gave to others, with their name and a Friend badge, view only |
| 31 | Other laptop | Open the "Other devices" address from the terminal | App loads and works over the local network |
