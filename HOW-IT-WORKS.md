# How it works

A plain language tour of the whole system. Read this when you want to understand what is going on under the hood, or before asking for a change. The README covers setup and day to day use; this covers the machinery.

## The three pieces

```
Participant's phone or laptop          Your laptop
┌──────────────────────────┐           ┌──────────────────────────┐
│ survey.html?t=TEST_ID    │           │ index.html (admin)       │
│ shows pairs, records     │           │ sign in, create tests,   │
│ choices, saves at end    │           │ read results, export     │
└────────────┬─────────────┘           └────────────┬─────────────┘
             │ no login                             │ login token
             ▼                                      ▼
┌────────────────────────────────────────────────────────────────┐
│ Supabase (hosted database + login service)                     │
│   tests       one row per test: name, messages, open/closed    │
│   responses   one row per participant: all their choices       │
│   auth        the admin account                                │
└────────────────────────────────────────────────────────────────┘
```

1. **GitHub Pages** hosts the web pages. Every push to `main` goes live within a minute or two at https://andrewdavid2990.github.io/preference-test/. There is no server of our own; the pages are static files.
2. **Supabase** holds the data and the admin login. It is a hosted Postgres database with a web API in front of it, on the free plan.
3. **The browser** does all the work: rendering, randomising pair order, the statistics. Nothing is computed on a server.

## What happens when you create a test

1. You sign in. The browser sends your email and password to Supabase's login service and gets back a **token**, a long string that proves who you are for about an hour (it is renewed automatically while the tab is open). The token is kept in your browser's local storage so you stay signed in between visits. Change password sends a new password to the same service using that token.
2. You fill in a name (private to you), an optional scenario, the question, up to 8 messages, and optionally a segment question with its answers and whether to ask for an email. Click Create test and the browser sends one row to the `tests` table: `{ name, scenario, question, messages: ["...", "..."], segment_question, segment_options: ["...", "..."], ask_email, closed: false }`. Supabase gives it an id, a random string like `312c6449-f645-40e8-9021-0009b993ee72`.
3. The results page opens with a participant link that is just `survey.html?t=` plus that id. The Preview button opens the same link with `&preview` added, which tells the survey page to save nothing: no response row, no browser memory.

Messages are stored as a list and every response refers to them by position (message 0, message 1, and so on). That is why messages cannot be edited after creation: changing the list would silently change what old responses mean.

## What happens when a participant takes the test

1. Their browser loads `survey.html`, reads the id from the link, and fetches that one row from `tests`. No login is needed; the database rules allow anyone to read tests.
2. If the test is closed they see a closed message. Otherwise they see a generic welcome ("You have been invited to a quick survey", never the test name), the scenario if there is one, a time estimate (about four seconds per pair), and a Start button.
3. If the test asks about the participant, one short screen follows: the segment question as a list to pick from, and the email field if enabled. Their answers travel with their response. The question you set is then shown above every pair.
4. On Start, the browser builds every pair of messages (28 pairs for 8 messages), shuffles the order, and randomly decides which message goes left and which goes right for each pair. This is done fresh for every participant so position bias averages out.
5. Each click records the winner for that pair in an object like `{ "0-3": 3, "1-2": 1, "0-1": null }`. The key is the two message positions (smaller first), the value is the winning position, and `null` means they skipped. After every click this object is saved to the participant's local storage, so a refresh or a dropped connection picks up where they left off.
6. On the last pair, the whole object is sent as one row to the `responses` table together with the test id, the segment they picked and the email they typed. The database rules allow anyone to add a response, but not to read or delete them. (One subtlety: Supabase normally echoes a saved row back, and echoing counts as reading, so this one save asks for no echo.)
7. They see their own personal ranking (wins per message) as a thank you. A flag in their local storage remembers they finished, so reopening the link shows that ranking again instead of a fresh survey. "Take it again" clears the flag and adds a second response; it exists for testing, not for participants.

## What happens when you open results

1. The admin page fetches the test row and every response row for it, using your login token. Without a valid token the database returns nothing for responses.
2. If the test has segments, a dropdown next to Refresh narrows every tab, and the client summary, to one group. "No answer" covers participants who did not pick one (for example, responses from before segments were added).
3. Everything on the six tabs is calculated in your browser from those rows, in `analysis.js`. Nothing is stored. Refresh results simply fetches again and recalculates.
4. Client summary builds a complete web page as text in your browser (numbers from the same maths as the tabs, the logo and styles inlined) and opens it in a new tab. Save as PDF uses the browser's print; Download saves that page as a single file. Nothing about the summary is stored anywhere; reopen it any time from the results page.
5. Hiding a participant on the Consistency tab is remembered in your browser only (local storage keyed by test id). The response stays in the database; it is just left out of the maths on your machine. Another admin on another laptop would not see your hidden choices. Deleting a participant removes the row from the database for everyone.

## The maths, briefly

- **Ranking** is total wins divided by total pairs rated, per message. In a full round-robin where everyone rates every pair this is identical to average rank, so it is a fair headline number.
- **Head to head** is a grid: for each pair of messages, what share of participants picked the row message over the column one. Skipped pairs are left out of both counts.
- **Strength scores** fit a Bradley-Terry model, the standard way to turn pairwise comparisons into a single strength per item (it is what chess ratings are built on). The score shown is each message's chance of beating an average message in the set. The band around it comes from resampling participants 150 times and refitting, and only appears with 5 or more participants.
- **Winner check** asks two things: does #1 beat every other message head to head (a Condorcet winner), and is #1 versus #2 a statistically clear gap or a coin flip (an exact binomial test on that one matchup).
- **Polarization** looks at where each message landed in every participant's personal ranking. A message that is 1st for some and last for others has a wide spread and is flagged "split". Total wins alone would show it as average.
- **Consistency** counts cycles per participant: cases where they said A beats B, B beats C, and C beats A. A few are normal. More than 15% of all triples is flagged, because that is what random clicking looks like.

## Security and access, honestly

- The **anon key** in `config.js` is public by design. It identifies the project, not a person. What it can do is decided by the database rules (row level security policies, in `supabase/`). With it alone you can read tests and add a response, nothing else.
- The **admin login** is Supabase's built in email and password auth. Being signed in is not enough on its own: the database rules also check that the signed in email is in a small `admins` table. So even if a stranger created an account, they would see nothing. There are no roles beyond that; every listed admin has full access.
- The **service role key** (also in the Supabase dashboard) bypasses every rule. It is never used by this tool and should never be put in the code or shared.
- Participant links are unguessable (random ids) but not secret: anyone with the link can respond, as many times as they clear their browser storage. That is acceptable for headline tests sent to a known list.
- A response is a test id, a set of choices, a timestamp, and, if the test asks, a segment and an email address. Emails are only readable with an admin login. Do not ask for emails on tests where you do not need them.

## Files

| File | What it is |
|---|---|
| `index.html` | Admin page: sign in, tests list, create, results, export. All its own logic is inline at the bottom. |
| `survey.html` | Participant page. Its own logic is inline at the bottom. |
| `style.css` | Shared styles, following the Tested visual identity. Colours are CSS variables on `:root` with a dark mode override. |
| `analysis.js` | All statistics, pure functions. Used by both pages. `groupStats` computes everything the results tabs and the summary show. |
| `summary.js` | Builds the client summary page from a test and its responses. |
| `db.js` | Every database read and write. Adds the login token when there is one. |
| `auth.js` | Sign in, sign out, change password, token storage and renewal. Admin page only. |
| `config.js` | Supabase project URL and public anon key. |
| `supabase/schema.sql` | Creates the two tables and the first, fully open rules. |
| `supabase/002-login.sql` | Adds the `admins` table and makes the admin rules require a listed, signed in email. |
| `supabase/003-scenario-question.sql` | Adds the scenario and question columns to tests. |
| `supabase/004-participant-details.sql` | Adds the segment and email settings to tests and the answers to responses. |
| `favicon.svg` | The little icon in the browser tab. |
| `tested.svg`, `tested-reversed.svg` | The Tested logo lockup, copied from the brand guide in the `tested` repo (red for light backgrounds, paper for dark). |
| `test/smoke.js` | End to end check of both pages against a fake database. |
| `.github/workflows/keepalive.yml` | Scheduled job that stops the free Supabase project from pausing. |
| `README.md` | Setup and day to day use. |
| `HOW-IT-WORKS.md` | This file. |
| `CHANGELOG.md` | What changed and when. |
| `CLAUDE.md` | Notes for the AI assistant: conventions, decisions, state. |

## Limits of the free tier

Supabase free projects pause after a week with no activity and need a click in the dashboard to wake up. To prevent that, a scheduled job in GitHub (`.github/workflows/keepalive.yml`) reads one row from the database every three days, which counts as activity. If the admin page ever shows a connection error after a quiet spell, a paused project is still the first thing to check. GitHub Pages has no such limit.

## Checking a change

`test/smoke.js` is a script that starts both pages locally, stands in for Supabase with a fake that follows the same access rules, and clicks through everything: sign in, create a test with a scenario and question, simulated participants, every results tab, hide and delete, preview, a participant on a phone sized screen with a mid survey refresh, CSV export, close, delete, password change, sign out. It saves screenshots to `test/shots/`. Running it needs Node and Playwright on the machine; Claude runs it before every push.
