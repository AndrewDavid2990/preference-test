# Preference test

Pairwise preference test for short messages (headlines, value props, subject lines). You create a test with 2 to 8 messages, send participants a link, they pick between every pair, and the results roll up into a ranking with a few analysis views.

Two pages:

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | You (sign in required) | List of tests, create a test, copy the participant link, read results, export CSV. |
| `survey.html?t=ID` | Participants | Opens straight into the survey for one test. Saves their answers when they finish. Add `&preview` to run it without saving. |

Both are plain HTML, CSS and JavaScript. No build step. Built for [Tested](https://tested.agency); the brand guide and other agency material live in the separate `tested` repo. Data is stored in a free Supabase database so tests and responses survive refreshes and collect from every participant's device.

More docs: [HOW-IT-WORKS.md](HOW-IT-WORKS.md) explains the machinery in plain language, [CHANGELOG.md](CHANGELOG.md) lists what changed and when.

## One time setup (about 15 minutes)

### 1. Create the database

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**. Give it any name (for example `preference-tests`), set a database password (you will not need it again), and pick the region closest to you.
2. When the project finishes setting up, open **SQL Editor** in the left sidebar, click **New query**, paste the whole contents of `supabase/schema.sql`, and click **Run**. This creates the two tables (tests and responses) and the access rules.
3. Open **Project Settings** (gear icon), then **API**. Copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon / publishable** key (a long string starting with `eyJ` or `sb_publishable_`)
4. Paste both into `config.js`, replacing the placeholder values. The anon key is designed to be public, so committing it is fine.

### 2. Create the admin login

Already done for this project (the connector in Claude can run these steps). For the record, or for a fresh project:

1. In the **SQL Editor**, run `supabase/002-login.sql`. It creates an `admins` table and changes the access rules so results and admin actions need a signed in user whose email is listed there. Participants can still load a test and submit answers without a login.
2. Add each admin's email to the table: `insert into admins (email) values ('name@example.com');`
3. Create their account: Supabase sidebar, **Authentication**, **Users**, **Add user**, **Create new user**, with **Auto Confirm User** ticked. Or ask Claude to do it through the connector.

Each admin changes their own password from the **Change password** link at the top of the admin page. If a password is lost, reset it from Authentication, Users in the dashboard, or ask Claude.

### 3. Put the pages online

Participants need a web address for `survey.html`. This repo is public, so GitHub Pages hosts it for free:

1. On GitHub, open this repo, then **Settings**, then **Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. After a minute, the admin page is at `https://andrewdavid2990.github.io/preference-test/` and the participant links it generates point to the same place.

Until it is online, you can still open `index.html` directly from your computer to create tests and view results. The participant link will only work for other people once the pages are hosted.

## Day to day

1. Open the admin page and sign in (you stay signed in on that browser until you sign out). **Change password** at the top of the page is where you set your own. Click **New test**.
2. Name the test (only you see the name; participants get a generic "You have been invited to a quick survey" welcome), optionally write a **scenario** (framing shown once before the first pair, for example "Imagine you run marketing at a B2B software company and are looking for help improving conversions"), set the **question** shown above every pair (default "Which message do you prefer?"), and enter the messages.
3. Optionally ask participants about themselves, once, before the first pair: up to four **segment questions**, each with answers to pick from (for example "Which best describes you?" with Founder, Marketing, Sales; "Company size" with Under 50, 50 or more), and an **email address** (off, optional or required). On the results page there is one dropdown per segment question and they combine, the client summary gets a "By segment" table per question, and the CSV carries a column per question. Emails are only ever visible to signed in admins.
4. The **closing question** is asked after the last pair, with a text box. It is prefilled with "Your top rated message was {top choice}. What made you choose that message?" where {top choice} becomes that person's own number one. Edit the wording or clear it to skip, at creation or later from the results page (Edit next to the closing question; applies to participants from then on). Answers appear on the Comments tab, in the client summary under "In their words", and in the CSV. Participants' choices are saved before this question, so closing the tab here loses nothing.
5. Click **Preview** to run through the survey yourself or show a client. Previews save nothing. Then copy the participant link and send it out. Each participant answers every pair once (with a Back link to fix a slip); their progress is kept if they refresh, and the page remembers when they have finished.
6. Watch results come in with **Refresh results**. The Consistency tab flags random clickers two ways: contradictory answers (cycles) and speed (a median under 1.5 seconds per pair is "Rushed"). **Hide** drops someone from every view without deleting (remembered in your browser only); **Hide all flagged** does it for everyone flagged; **Delete** removes their response for good.
7. **Client summary** opens a one page, branded write up in a new tab: the verdict in plain language, the ranking with win rates and strength scores, the head to head grid, by segment tables, participants' comments, things to watch (divisive messages, skips, rushed participants, small samples), sample size guidance (how many people it takes to confirm a winner, with a reading for this test's size), and a short note on method. Use **Save as PDF** to send it, or **Download** for a standalone web page that opens anywhere without a login. Remove simulated participants and hide junk responses first; the summary says if simulated data is included.
8. **Close test** stops new responses (previews still work). **Export CSV** downloads every choice, one row per pair per participant, with their segment answers, email, comment and timing.
9. **Add 15 simulated** inserts fake participants so you can see how the views behave before real data arrives. **Remove simulated** deletes them again. They are marked as simulated everywhere.

## Good to know

- Messages cannot be edited after a test is created, because responses refer to messages by position. Create a new test instead.
- The admin page needs a login, and only emails in the `admins` table get in. Anyone with a participant link can respond, and the link is unguessable but not secret, so send it to a known list.
- Supabase free projects pause after about a week of no activity. A scheduled job in this repo (`.github/workflows/keepalive.yml`) reads one row every three days to prevent that. If the admin page ever cannot connect after a quiet spell, open the Supabase dashboard and click Restore project.
- To check a change without touching the real database, run `node test/smoke.js` (needs Node and Playwright). It drives both pages through the whole flow against a fake database and saves screenshots, including phone size, in `test/shots/`.
- All analysis maths lives in `analysis.js`, all database calls in `db.js`. Swapping the database later means changing only `db.js`.
