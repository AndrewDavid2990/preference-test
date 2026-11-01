# Preference test

Pairwise preference test for short messages (headlines, value props, subject lines). You create a test with 2 to 8 messages, send participants a link, they pick between every pair, and the results roll up into a ranking with a few analysis views.

Two pages:

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | You | List of tests, create a test, copy the participant link, read results, export CSV. |
| `survey.html?t=ID` | Participants | Opens straight into the survey for one test. Saves their answers when they finish. |

Both are plain HTML, CSS and JavaScript. No build step. Data is stored in a free Supabase database so tests and responses survive refreshes and collect from every participant's device.

## One time setup (about 10 minutes)

### 1. Create the database

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**. Give it any name (for example `preference-tests`), set a database password (you will not need it again), and pick the region closest to you.
2. When the project finishes setting up, open **SQL Editor** in the left sidebar, click **New query**, paste the whole contents of `supabase/schema.sql`, and click **Run**. This creates the two tables (tests and responses) and the access rules.
3. Open **Project Settings** (gear icon), then **API**. Copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon / publishable** key (a long string starting with `eyJ` or `sb_publishable_`)
4. Paste both into `config.js`, replacing the placeholder values. The anon key is designed to be public, so committing it is fine.

### 2. Put the pages online

Participants need a web address for `survey.html`. The simplest free option is GitHub Pages, since this folder already lives in a GitHub repo:

1. On GitHub, open the repo, then **Settings**, then **Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. After a minute, the admin page is at `https://<your-github-username>.github.io/<repo-name>/preference-test/` and the participant links the admin page generates will point to the same place.

GitHub Pages is free for public repos. If the repo is private, GitHub needs a paid plan for Pages; the alternative is dropping the `preference-test` folder on Netlify (free) and using that address instead.

Until it is online, you can still open `index.html` directly from your computer to create tests and view results. The participant link will only work for other people once the pages are hosted.

## Day to day

1. Open the admin page and click **New test**. Name it (participants see the name), enter the messages, click **Create test**.
2. Copy the participant link and send it out. Each participant answers every pair once; their progress is kept if they refresh, and the page remembers when they have finished.
3. Watch results come in with **Refresh results**. The Consistency tab flags random clickers; hiding someone there drops them from every other view (hidden choices are remembered in your browser, not in the database).
4. **Close test** stops new responses. **Export CSV** downloads every choice, one row per pair per participant.
5. **Add 15 simulated** inserts fake participants so you can see how the views behave before real data arrives. **Remove simulated** deletes them again. They are marked as simulated everywhere.

## Good to know

- Messages cannot be edited after a test is created, because responses refer to messages by position. Create a new test instead.
- Anyone with the admin link can see results and create or delete tests, and anyone with a participant link can respond. There is no login yet. That is fine for headline tests; add a login before using it for anything sensitive.
- All analysis maths lives in `analysis.js`, all database calls in `db.js`. Swapping the database later means changing only `db.js`.
