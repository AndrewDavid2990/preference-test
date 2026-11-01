# Preference testing tool

Pairwise preference test for short text messages (headlines, value props, subject lines). Participants see every pair of messages, pick one each time, and the choices roll up into a ranking with several analysis views. Built for Tested (tested.agency), a CRO agency for B2B SaaS, to use in messaging engagements.

Commit and push directly to `main` unless Andrew says otherwise for a given change. Don't open a pull request unless asked.

Owner is non-technical. Explain technical choices in plain language. No em dashes in any written output or UI copy.

Documentation is part of every change. When you change behaviour, update in the same commit: README.md (setup and day to day use), HOW-IT-WORKS.md (plain language explanation of the machinery), CHANGELOG.md (newest first, dated), and this file (state, decisions, conventions).

## Current state

Plain HTML, CSS and vanilla JS, one Google Font, no build step, no framework. Hosted on GitHub Pages from `main` at https://andrewdavid2990.github.io/preference-test/. Data lives in a Supabase (hosted Postgres) project, accessed through its REST API with plain `fetch`. Setup steps for the owner are in README.md.

Files:
- `index.html`: admin page. `?new` creates a test, `?test=ID` shows results for one test, `?password` changes the password, no query shows the list of tests. Every route except the setup notice requires sign in.
- `survey.html?t=ID`: participant page. Intro, survey, thank you screen with the participant's personal ranking.
- `style.css`: shared styles, light and dark via CSS variables on :root.
- `analysis.js`: all the maths, pure functions with no DOM or network. Takes `n` (message count) and `choices` objects.
- `db.js`: every database call. Sends the admin login token when `auth` is loaded and signed in, otherwise the anon key. Requests use `Prefer: return=representation` except `addResponses`, which uses `return=minimal` because returning rows requires select permission and anon has none on responses (PostgREST reports that as an RLS violation on insert). Swap the backend by changing only this file.
- `auth.js`: admin login via Supabase Auth REST (`/auth/v1/token`, grant types password and refresh_token; `PUT /auth/v1/user` to change password). Session kept in localStorage under `pt-session`; `auth.token()` refreshes when within 60s of expiry, with one shared in-flight refresh so parallel requests do not reuse a refresh token. Loaded by index.html only.
- `config.js`: Supabase URL and anon key. Placeholders until the owner fills them in; pages show a setup notice when unconfigured.
- `supabase/schema.sql`: tables and the initial fully open policies. `supabase/002-login.sql`: adds `admins (email)` and `is_admin()`, and alters the write and read-responses policies to `authenticated` with `is_admin()`. Net effect: anon can select tests and insert responses; everything else needs a signed in user listed in `admins`. Sign ups are left on (harmless, unlisted users get nothing). Both files have been applied to the live project `eajbqxaamwpqaumncklw`.
- `HOW-IT-WORKS.md`, `CHANGELOG.md`: owner facing docs, keep them current.

Data model:
- `tests { id, name, messages: [string], closed, created_at }`. Messages are immutable after creation because responses refer to them by index.
- `responses { id, test_id, choices: { "i-j": winnerIndex | null }, simulated, created_at }`. One row per participant. Key `"i-j"` always has i < j. `null` means skipped.

Browser-only state (localStorage): participant progress and "already completed" flag per test on the survey page; the set of hidden participant ids per test and the login session on the admin page.

Admin features: sign in and out, tests list with response counts, create test, participant link with copy, refresh, close/reopen, export CSV (one row per pair per participant), add 15 simulated participants (flagged `simulated`), remove simulated, delete test (cascades to responses).

## Product decisions already made

- Cap at 8 messages so every participant sees every pair (28 max, about 2 minutes). Rejected a larger cap with random subsets because full round-robin gives a per-person ranking, lets you spot segments, and is easy to explain to clients. For more than 8 candidates, run two rounds (two groups of 8, then a final of the top 4 from each).
- Total wins is the headline ranking. In a full round-robin it equals average rank, so it is fair. The other views exist because total wins hides ties, rivals, splits, and junk responses.
- Participants can be hidden from the Consistency view (individually, or "Hide all flagged"). Hidden participants drop out of every other view. Threshold for flagged: more than 15% of triples are cycles. 7 to 15% is labelled "Some noise" and kept.
- Supabase over browser storage because participants answer on their own devices and results must collect in one place. Plain REST calls over the Supabase JS client so there is nothing to install and the code stays readable.
- Login is Supabase email and password auth called with plain fetch, no SDK, for the same reason. Admin status is an `admins` table checked inside the policies rather than a dashboard toggle, so it is visible in SQL and does not depend on dashboard settings. No roles beyond listed or not. Forgotten passwords are reset from the dashboard (or via the connector) rather than a reset email flow, which would need a Site URL and a reset page.
- Database changes are numbered SQL files in `supabase/`, applied through the Supabase connector (`execute_sql`; `apply_migration` triggers a confirmation prompt that times out, and `drop policy` counts as destructive, so prefer `alter policy`). Never rewrite an already applied file; add a new one. Accounts are created with `POST /auth/v1/signup` using the anon key and then confirmed with `update auth.users set email_confirmed_at = now()`; the signup endpoint is rate limited to one call per minute.

## Analysis methods in the code

- Head to head matrix: share of participants who picked row over column, skipped pairs excluded.
- Bradley-Terry: iterative MM fit, normalized to geometric mean 1, displayed as p/(p+1) = chance of beating an average message. 90% interval from 150 bootstrap resamples of participants, only when 5+ participants.
- Winner check: Condorcet test (does #1 win a majority against every other message) and a two-sided exact binomial test on #1 vs #2 head to head.
- Polarization: per message, histogram of rank positions across participants, mean, standard deviation, and a "split" flag when 30%+ rank it top two and 30%+ rank it bottom two.
- Consistency: count intransitive triples (A>B, B>C, C>A) per participant.

## Likely next steps

- A client-ready summary export (the CSV is raw choices).
- Optional: time per choice as another junk-response signal.
- Optional: participant metadata (segment, email) collected before the survey.

## Conventions

- Keep it simple and readable. The owner will read the code with AI help, not on his own.
- Light and dark mode both supported via CSS variables on :root. Keep that working.
- Mobile first layout. Pair cards stack on narrow screens.
- Testing: there is no automated test in the repo. To check a change, serve the folder locally and fake the Supabase REST endpoints (Playwright route interception works well), or point `config.js` at a throwaway Supabase project.
