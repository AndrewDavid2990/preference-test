# Changelog

Newest first. Dates are when the change went live on `main`.

## 2026-11-02: back to the instructions

- An Edit link next to the scenario on the results page opens the same edit form as Edit test.
- Paragraph breaks typed into the scenario are kept on the participant's welcome screen, the results page and the summary.

- On the first pair, Back reads "Back to the instructions" and returns to the welcome screen; Continue picks up at the same pair.

## 2026-11-02: one final screen

- The segment questions and email field moved from before the first pair to after the last one, on the same screen as the closing question (closing question first, then segments, then email). Participants now start choosing straight away. Choices are still saved before this screen; its answers are attached afterwards through `finish_response` (`supabase/008-final-screen.sql`). Skip appears only when nothing on the screen is required.

## 2026-11-02: edit a test

- **Edit test** on the results page opens the setup form prefilled. Name, scenario, question, segment questions, email setting and closing question can be changed at any time. Messages can be changed until the first response arrives, then they lock (with a note saying why, and that removing simulated participants unlocks them).

## 2026-11-02: sample size guidance

- The client summary has a "How many participants it takes" section: a one line reading for this test's size, and a table of the chance of a clear winner by true top two split and sample size (15, 30, 40, 50, 100), from simulations of the tool's own rules.

## 2026-11-01: getting ready for beta

- The smoke test now runs in GitHub on every push (`.github/workflows/test.yml`), with screenshots attached to each run, so a broken change cannot go live unnoticed.
- Rough edges pass on phones: Back, Skip and the closing question's Skip are thumb sized; "1 pairs" reads "1 pair" on a two message test.
- Database: a performance tweak to the admin check (`supabase/007-policy-performance.sql`), no change in behaviour.

## 2026-11-01: edit the closing question

- The closing question can be changed, or cleared, on an existing test from the results page. Affects participants from then on; earlier comments keep their wording in the CSV only by context.

## 2026-11-01: several segment questions and a closing question

- A test can ask up to four segment questions, each with its own answers. Results get one dropdown per question and they combine. The client summary shows a "By segment" table per question. The CSV has a column per question.
- A closing open text question after the last pair, prefilled with "Your top rated message was {top choice}. What made you choose that message?", where {top choice} is that participant's own number one. Optional for the participant; edit or clear it per test. Choices are saved before it is asked. Answers appear on a new Comments tab, in the summary under "In their words", and in the CSV.
- Database: `supabase/006-segments-and-comment.sql`. The earlier single segment question was carried over automatically.

## 2026-11-01: timing as a junk signal

- The survey records how long each pair took. The Consistency tab shows each participant's median seconds per pair and flags "Rushed" under 1.5 seconds; "Hide all flagged" includes them. The client summary mentions rushed participants under things to watch. CSV gets `median_seconds` and a per pair `seconds` column. Simulated random clickers are now fast, so the flag can be seen working.

## 2026-11-01: cache fix

- Scripts and styles now carry a version number in their address so a freshly deployed page can never run with a stale cached script. This caused one failed "Create test" right after a deploy (an error about a null messages column); reloading fixed it.

## 2026-11-01: back button and plainer captions

- Participants can step back one pair at a time with a quiet Back link, see what they picked, and change it. For fixing mis-taps on phones.
- The last small uppercase captions (pair counter, Open/Closed, Press 1/2, preview banner, table headers, summary labels) are now ordinary sentence case text.

## 2026-11-01: participant details

- Tests can ask participants one segment question (pick one answer from a list you define) and for an email address (off, optional or required), on a single screen between the welcome and the first pair. Stored with each response (`supabase/004-participant-details.sql`).
- Results page: a segment dropdown narrows every tab and the client summary to one group. The Consistency list shows each participant's segment and email. CSV export has segment and email columns.
- Client summary: a "By segment" table with the top three messages per group when no filter is applied.
- Participants no longer see the test name. The welcome reads "You have been invited to a quick survey", and the setup page says the name is private.
- Setup form labels are short (Name, Scenario, Question, Messages) with a one line hint underneath instead of explanations in brackets.

## 2026-11-01: client summary

- Red is no longer used as a "good" signal. Verdict panels (winner check tabs, summary) use an Ink bar when the news is strong and a light gray bar when it is soft; the #1 rank is Ink. Red stays for the wordmark, the picked card, the scenario panel and data visuals only.
- **Client summary** button on the results page. Opens a one page branded write up in a new tab: plain language verdict (clear winner, likely winner, top two close, or no outright winner), ranking with win rate and strength, head to head grid, things to watch, and how the test worked. Save as PDF or Download as a standalone page.
- The results tabs and the summary now share one calculation (`analysis.groupStats`), so they can never disagree.
- Form field labels are plain sentence case instead of small uppercase captions.

## 2026-11-01: Tested branding

- Both pages now follow the Tested visual identity: white canvas, Ink text and buttons, Montserrat headlines (the web stand in for Gotham) with Poppins for everything else, square corners, no shadows, no blue. The Tested wordmark sits at the top of every screen (reversed version in dark mode).
- Brand red is reserved for the wordmark, one focal element per screen (the bar above the scenario, the picked card, the #1 rank, the "clean winner" verdict) and the data visuals (meters, head to head shading, strength bands, histograms).
- Status labels (Open, Closed, Consistent, Check this one) are typographic captions instead of colored pills. Verdict panels are off-white with a red bar only when the news is good.
- Hover highlights are now mouse only, so a tapped card on a phone no longer stays highlighted.

## 2026-11-01: beta readiness

- Each test now has an optional **scenario** (framing shown before the first pair) and an editable **question** (shown above every pair). Stored as two new columns (`supabase/003-scenario-question.sql`).
- **Preview** button on the results page opens the survey in a mode that saves nothing, for checking a test or showing a client. Previews work even when a test is closed. The "take it again" option is now preview only.
- **Delete** a single participant from the Consistency tab (Hide remains for a non destructive version).
- Scheduled GitHub job pings the database every three days so the free Supabase project does not pause.
- Participant page: link previews (title and description when shared in Slack, LinkedIn or email), favicon, a sensible time estimate (was "about 2 to 2 minutes"), bigger tap targets and no "Press 1" hints on phones.
- `test/smoke.js`: end to end check of both pages against a fake database, including a phone sized run.

## 2026-11-01: admin login

- Admin page now requires signing in with email and password (Supabase Auth). A "Signed in as" line with Change password and Sign out appears at the top.
- Database rules tightened (`supabase/002-login.sql`): without a login you can only read tests and add responses, which is all the participant page needs. Results, creating, closing and deleting tests need a signed in user whose email is in the new `admins` table.
- Applied to the live project and the first admin account created through the Supabase connector in Claude, so no dashboard steps were needed.
- New `auth.js` handles sign in, sign out, and renewing the login token in the background.
- New documentation: `HOW-IT-WORKS.md` and this changelog.

## 2026-11-01: moved to its own repo

- Moved from the `tested` repo (where it lived as a folder) to `andrewdavid2990/preference-test` so it can be hosted on GitHub Pages without publishing the rest of the agency material. History came with it.
- Live at https://andrewdavid2990.github.io/preference-test/.

## 2026-11-01: persistence and two pages

- Split the single file prototype into an admin page (`index.html`) and a participant page (`survey.html?t=ID`).
- Tests and responses are stored in Supabase, so they survive refreshes and collect from every participant's device.
- Admin: list of tests with response counts, create test, participant link with copy, refresh, close and reopen, export CSV, add and remove simulated participants, delete test.
- Participant: intro screen, progress kept across refreshes, "already completed" memory, personal ranking at the end.
- Code split into `analysis.js` (maths), `db.js` (database), `style.css` (styles), `config.js` (keys).

## 2026-11-01: prototype

- Single file `index.html` prototype with setup, survey, personal results and six group analysis views. Everything in memory, lost on refresh.
