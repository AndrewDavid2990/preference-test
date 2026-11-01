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
2. You fill in a name and up to 8 messages and click Create test. The browser sends one row to the `tests` table: `{ name, messages: ["...", "..."], closed: false }`. Supabase gives it an id, a random string like `312c6449-f645-40e8-9021-0009b993ee72`.
3. The results page opens with a participant link that is just `survey.html?t=` plus that id.

Messages are stored as a list and every response refers to them by position (message 0, message 1, and so on). That is why messages cannot be edited after creation: changing the list would silently change what old responses mean.

## What happens when a participant takes the test

1. Their browser loads `survey.html`, reads the id from the link, and fetches that one row from `tests`. No login is needed; the database rules allow anyone to read tests.
2. If the test is closed they see a closed message. Otherwise they see an intro with the test name and a Start button.
3. On Start, the browser builds every pair of messages (28 pairs for 8 messages), shuffles the order, and randomly decides which message goes left and which goes right for each pair. This is done fresh for every participant so position bias averages out.
4. Each click records the winner for that pair in an object like `{ "0-3": 3, "1-2": 1, "0-1": null }`. The key is the two message positions (smaller first), the value is the winning position, and `null` means they skipped. After every click this object is saved to the participant's local storage, so a refresh or a dropped connection picks up where they left off.
5. On the last pair, the whole object is sent as one row to the `responses` table together with the test id. The database rules allow anyone to add a response, but not to read or delete them.
6. They see their own personal ranking (wins per message) as a thank you. A flag in their local storage remembers they finished, so reopening the link shows that ranking again instead of a fresh survey. "Take it again" clears the flag and adds a second response; it exists for testing, not for participants.

## What happens when you open results

1. The admin page fetches the test row and every response row for it, using your login token. Without a valid token the database returns nothing for responses.
2. Everything on the six tabs is calculated in your browser from those rows, in `analysis.js`. Nothing is stored. Refresh results simply fetches again and recalculates.
3. Hiding a participant on the Consistency tab is remembered in your browser only (local storage keyed by test id). The response stays in the database; it is just left out of the maths on your machine. Another admin on another laptop would not see your hidden choices.

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
- Response data contains no personal information. A response is a test id, a set of choices, and a timestamp.

## Files

| File | What it is |
|---|---|
| `index.html` | Admin page: sign in, tests list, create, results, export. All its own logic is inline at the bottom. |
| `survey.html` | Participant page. Its own logic is inline at the bottom. |
| `style.css` | Shared styles. Colours are CSS variables on `:root` with a dark mode override. |
| `analysis.js` | All statistics, pure functions. Used by both pages. |
| `db.js` | Every database read and write. Adds the login token when there is one. |
| `auth.js` | Sign in, sign out, change password, token storage and renewal. Admin page only. |
| `config.js` | Supabase project URL and public anon key. |
| `supabase/schema.sql` | Creates the two tables and the first, fully open rules. |
| `supabase/002-login.sql` | Adds the `admins` table and makes the admin rules require a listed, signed in email. |
| `README.md` | Setup and day to day use. |
| `HOW-IT-WORKS.md` | This file. |
| `CHANGELOG.md` | What changed and when. |
| `CLAUDE.md` | Notes for the AI assistant: conventions, decisions, state. |

## Limits of the free tier

Supabase free projects pause after a week with no activity and need a click in the dashboard to wake up. If the admin page shows a connection error after a quiet spell, that is usually why. GitHub Pages has no such limit.
