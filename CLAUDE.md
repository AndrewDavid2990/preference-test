# Preference testing tool

Pairwise preference test for short text messages (headlines, value props, subject lines). Participants see every pair of messages, pick one each time, and the choices roll up into a ranking with several analysis views. Built for Tested (tested.agency), a CRO agency for B2B SaaS, to use in messaging engagements.

Commit and push directly to `main` unless Andrew says otherwise for a given change. Don't open a pull request unless asked.

Owner is non-technical. Explain technical choices in plain language. No em dashes in any written output or UI copy.

Documentation is part of every change. When editing docs with search and replace, assert every match and write nothing on a miss: a silent miss once left the README's day to day steps stale for several releases. When you change behaviour, update in the same commit: README.md (setup and day to day use), HOW-IT-WORKS.md (plain language explanation of the machinery), CHANGELOG.md (newest first, dated), and this file (state, decisions, conventions).

## Current state

Plain HTML, CSS and vanilla JS, one Google Font, no build step, no framework. Hosted on GitHub Pages from `main` at https://andrewdavid2990.github.io/preference-test/. Data lives in a Supabase (hosted Postgres) project, accessed through its REST API with plain `fetch`. Setup steps for the owner are in README.md.

Files:
- `index.html`: admin page. `?new` creates a test, `?test=ID` shows results for one test, `?password` changes the password, no query shows the list of tests. Every route except the setup notice requires sign in. On results, `included()` is the single source of which participants feed the views and the summary: not hidden, and matching every set segment dropdown (`(none)` = no answer for that question).
- `survey.html?t=ID`: participant page. Intro (generic welcome, never the test name; scenario; time estimate), optional "about you" screen (one radio list per segment question, email) when the test asks, survey (test's question above every pair), optional closing question (`comment_prompt` with `{top choice}` replaced by the participant's #1, case and spacing tolerant), thank you screen with the participant's personal ranking. The response row is inserted when the last pair is answered, with a client generated uuid (`crypto.randomUUID`), and the comment is attached afterwards via the `add_comment` RPC; browsers without randomUUID skip the closing question. `&preview` runs it with no database write and no localStorage, shows a banner, ignores `closed`, and offers "run again". Static og:title/description for link previews.
- `style.css`: shared styles following the Tested visual identity (tokens mirror `DESIGN.md` in the `tested` repo): white canvas, Ink text and primary buttons, Montserrat 700/800 for h1/h2/h3/.question, Poppins body, 3px corners, no shadows. `--red` only for the wordmark, the picked card, the scenario panel, and data visuals (`.meter`, `.hist`, `.ci`, head to head shading). Never for verdicts or rank positions: the owner finds red as a "good" signal confusing, so `.badge.good` and the summary verdict use an Ink bar, `.badge.warn` a light gray one, and #1 is Ink. Status and flag classes (`.pill`, `.flag`, `.ok`) are typographic, not colored. Light and dark via CSS variables on :root; dark swaps to the reversed logo.
- `tested.svg`, `tested-reversed.svg`: logo lockup copied from the `tested` repo. Never rebuild or recolor the mark by hand; the favicon is a deliberately abstract two bar shape, not the mark.
- `analysis.js`: all the maths, pure functions with no DOM or network. Takes `n` (message count) and `choices` objects. `groupStats(n, parts)` returns everything the group views and the summary need (order, win rates, Bradley-Terry strength with 90% band when P >= 5, Condorcet losses, top two binomial verdict "clear" / "likely" / "tie", per message polarization, skips). renderGroup in index.html only renders from it.
- `summary.js`: builds the client summary as one self contained HTML string (inline CSS, inline logo fetched once at load, Google Fonts link) and opens it as a blob URL in a new tab. A blob URL rather than `window.open('') + document.write` because an about:blank tab has an opaque origin and Chromium refuses its downloads. `open()` must run synchronously inside the click handler for pop up blockers.
- `db.js`: every database call. Sends the admin login token when `auth` is loaded and signed in, otherwise the anon key. Requests use `Prefer: return=representation` except `addResponses`, which uses `return=minimal` because returning rows requires select permission and anon has none on responses (PostgREST reports that as an RLS violation on insert). Swap the backend by changing only this file.
- `auth.js`: admin login via Supabase Auth REST (`/auth/v1/token`, grant types password and refresh_token; `PUT /auth/v1/user` to change password). Session kept in localStorage under `pt-session`; `auth.token()` refreshes when within 60s of expiry, with one shared in-flight refresh so parallel requests do not reuse a refresh token. Loaded by index.html only.
- `config.js`: Supabase URL and anon key. Placeholders until the owner fills them in; pages show a setup notice when unconfigured.
- `supabase/003-scenario-question.sql`: adds `scenario` (default '') and `question` (default 'Which message do you prefer?') to tests. Applied live.
- `supabase/005-timing.sql`: adds `times` jsonb to responses. Applied live.
- `supabase/006-segments-and-comment.sql`: adds `tests.segments` (jsonb list of `{question, options}`), `tests.comment_prompt`, `responses.segments` (list of answers by question index), `responses.comment`, and `add_comment(p_id, p_comment)` (security definer, callable by anon, only fills an empty comment; verified live inside a rolled back transaction). Old single segment columns remain but are unused. Applied live.
- `supabase/004-participant-details.sql`: adds `ask_email` ('off' | 'optional' | 'required'), `segment_question`, `segment_options` (jsonb array) to tests and `segment`, `email` to responses. Applied live.
- `favicon.svg`, `.github/workflows/keepalive.yml` (reads one row every 3 days with the public anon key so the free project does not pause; also runnable by hand from the Actions tab).
- `.github/workflows/test.yml`: runs `node test/smoke.js` on every push to main (installs Playwright pinned to the version used locally, uploads `test/shots/` as an artifact). Check the Actions tab after pushing; a red run means the live site may be broken.
- `supabase/007-policy-performance.sql`: `(select auth.jwt())` in the admins policy and `is_admin()` per the advisor. Applied live. The security advisor's warnings about `add_comment` being anon callable are intentional and documented in 006.
- `test/smoke.js`: Playwright end to end test with a fake PostgREST and auth that mirror the real policies (anon: select tests, insert responses with return=minimal only; admin: everything). Run `node test/smoke.js` from the repo root before every push. Screenshots in `test/shots/` (gitignored).
- `supabase/schema.sql`: tables and the initial fully open policies. `supabase/002-login.sql`: adds `admins (email)` and `is_admin()`, and alters the write and read-responses policies to `authenticated` with `is_admin()`. Net effect: anon can select tests and insert responses; everything else needs a signed in user listed in `admins`. Sign ups are left on (harmless, unlisted users get nothing). Both files have been applied to the live project `eajbqxaamwpqaumncklw`.
- `HOW-IT-WORKS.md`, `CHANGELOG.md`: owner facing docs, keep them current.

Data model:
- `tests { id, name, scenario, question, messages: [string], segments: [{ question, options: [string] }], ask_email, comment_prompt, closed, created_at }`. Messages are immutable after creation because responses refer to them by index. `name` is admin only; participants never see it.
- `responses { id, test_id, choices: { "i-j": winnerIndex | null }, times: { "i-j": ms }, segments: [string], email, comment, simulated, created_at }`. One row per participant. `times` is measured from renderPair to the tap, overwritten if they go back; older rows have `{}`. Simulated participants get a random answer per segment question. Key `"i-j"` always has i < j. `null` means skipped.

Browser-only state (localStorage): participant progress and "already completed" flag per test on the survey page; the set of hidden participant ids per test and the login session on the admin page.

Admin features: sign in and out, change password, tests list with response counts, create test (name, scenario, question, messages, up to 4 segment questions with options, email off/optional/required, closing question), participant link with copy, preview link, one segment filter per question (combined with AND), edit closing question in place (`db.updateTest`, the only editable field after creation besides `closed`), refresh, Comments tab, close/reopen, client summary (new tab, print or download), export CSV (one row per pair per participant), add 15 simulated participants (flagged `simulated`), remove simulated, hide or delete a single participant, delete test (cascades to responses).

## Product decisions already made

- Cap at 8 messages so every participant sees every pair (28 max, about 2 minutes). Rejected a larger cap with random subsets because full round-robin gives a per-person ranking, lets you spot segments, and is easy to explain to clients. For more than 8 candidates, run two rounds (two groups of 8, then a final of the top 4 from each).
- Total wins is the headline ranking. In a full round-robin it equals average rank, so it is fair. The other views exist because total wins hides ties, rivals, splits, and junk responses.
- Participants can step back one pair at a time (Back link) and change an answer. Allowed because mis-taps on phones are common and an uncorrectable slip becomes junk data; showing the earlier pick keeps it a correction rather than re-deliberation.
- Participants can be hidden from the Consistency view (individually, or "Hide all flagged"). Hidden participants drop out of every other view. Thresholds for flagged: more than 15% of triples are cycles, or a median under 1.5 seconds per pair. 7 to 15% cycles is labelled "Some noise" and kept. Timing is a signal, not an automatic exclusion; the owner decides.
- Supabase over browser storage because participants answer on their own devices and results must collect in one place. Plain REST calls over the Supabase JS client so there is nothing to install and the code stays readable.
- Login is Supabase email and password auth called with plain fetch, no SDK, for the same reason. Admin status is an `admins` table checked inside the policies rather than a dashboard toggle, so it is visible in SQL and does not depend on dashboard settings. No roles beyond listed or not. Forgotten passwords are reset from the dashboard (or via the connector) rather than a reset email flow, which would need a Site URL and a reset page.
- Database changes are numbered SQL files in `supabase/`, applied through the Supabase connector (`execute_sql`; `apply_migration` triggers a confirmation prompt that times out, and `drop policy` counts as destructive, so prefer `alter policy`). Never rewrite an already applied file; add a new one. Accounts are created with `POST /auth/v1/signup` using the anon key and then confirmed with `update auth.users set email_confirmed_at = now()`; the signup endpoint is rate limited to one call per minute.

## Analysis methods in the code

- Head to head matrix: share of participants who picked row over column, skipped pairs excluded.
- Bradley-Terry: iterative MM fit, normalized to geometric mean 1, displayed as p/(p+1) = chance of beating an average message. 90% interval from 150 bootstrap resamples of participants, only when 5+ participants.
- Winner check: Condorcet test (does #1 win a majority against every other message) and a two-sided exact binomial test on #1 vs #2 head to head.
- Polarization: per message, histogram of rank positions across participants, mean, standard deviation, and a "split" flag when 30%+ rank it top two and 30%+ rank it bottom two.
- Consistency: count intransitive triples (A>B, B>C, C>A) per participant, plus median seconds per pair (`analysis.medianSeconds`). `analysis.junk(n, pt)` combines them: flagged when cycle rate > 15% or median < `RUSHED_SECONDS` (1.5). Labels: "Rushed and inconsistent", "Rushed", "Check this one", "Some noise", "Consistent".

## Likely next steps

- None queued. Wait for feedback from the first real test runs.

## Conventions

- Keep it simple and readable. The owner will read the code with AI help, not on his own.
- Light and dark mode both supported via CSS variables on :root. Keep that working.
- No small uppercase tracked captions ("eyebrows") anywhere in the tool or the summary, even though the brand guide allows them for axis labels. The owner finds them AI generated looking. Labels, counters, status words and table headers are ordinary sentence case text in muted grey. Form labels are short (Name, Scenario, Question); explanations go in a `.hint.under` line below the field, never in brackets inside the label.
- Visual changes follow the Tested brand rules (no blue or green UI colors, red never as a fill, a warning, or a "good" signal, 0 to 4px radius, no shadows or gradients, sentence case throughout). Hover styles go inside `@media (hover: hover)`.
- Mobile first layout. Pair cards stack on narrow screens.
- Testing: `node test/smoke.js` before every push (fake database, no network); GitHub runs it again on push. For edge cases (320px screens, long messages, 2 messages, dark mode, tap targets under 40px) there is a scratch script pattern in CHANGELOG "getting ready for beta"; rerun that idea after layout changes. For changes to policies or auth, also verify against the live project with curl using the anon key and a real admin token, since the fake cannot catch PostgREST subtleties like return=representation needing select permission. Clean up any test rows afterwards.
- Before committing, grep every text file for the em dash character (U+2014) and make sure there are none, including in UI copy and comments.
- Cache busting: every `.js` and `.css` include in index.html and survey.html carries `?v=N`. Bump N in both files whenever any of those files change (one sed: `sed -i 's/?v=OLD/?v=NEW/g' index.html survey.html`). GitHub Pages caches assets for 10 minutes, and a new HTML page paired with a stale script once sent a malformed create request ("null value in column messages").
