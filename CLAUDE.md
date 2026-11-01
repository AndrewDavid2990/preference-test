# Preference testing tool

Pairwise preference test for short text messages (headlines, value props, subject lines). Participants see every pair of messages, pick one each time, and the choices roll up into a ranking with several analysis views. Built for Tested (tested.agency), a CRO agency for B2B SaaS, to use in messaging engagements.

Owner is non-technical. Explain technical choices in plain language. No em dashes in any written output or UI copy.

## Current state

Plain HTML, CSS and vanilla JS, one Google Font, no build step, no framework. Data lives in a Supabase (hosted Postgres) project, accessed through its REST API with plain `fetch`. Setup steps for the owner are in README.md.

Files:
- `index.html`: admin page. `?new` creates a test, `?test=ID` shows results for one test, no query shows the list of tests.
- `survey.html?t=ID`: participant page. Intro, survey, thank you screen with the participant's personal ranking.
- `style.css`: shared styles, light and dark via CSS variables on :root.
- `analysis.js`: all the maths, pure functions with no DOM or network. Takes `n` (message count) and `choices` objects.
- `db.js`: every database call. Swap the backend by changing only this file.
- `config.js`: Supabase URL and anon key. Placeholders until the owner fills them in; pages show a setup notice when unconfigured.
- `supabase/schema.sql`: tables and row level security policies. Policies are fully open to the anon key (no login yet).

Data model:
- `tests { id, name, messages: [string], closed, created_at }`. Messages are immutable after creation because responses refer to them by index.
- `responses { id, test_id, choices: { "i-j": winnerIndex | null }, simulated, created_at }`. One row per participant. Key `"i-j"` always has i < j. `null` means skipped.

Browser-only state (localStorage): participant progress and "already completed" flag per test on the survey page; the set of hidden participant ids per test on the admin page.

Admin features: tests list with response counts, create test, participant link with copy, refresh, close/reopen, export CSV (one row per pair per participant), add 15 simulated participants (flagged `simulated`), remove simulated, delete test (cascades to responses).

## Product decisions already made

- Cap at 8 messages so every participant sees every pair (28 max, about 2 minutes). Rejected a larger cap with random subsets because full round-robin gives a per-person ranking, lets you spot segments, and is easy to explain to clients. For more than 8 candidates, run two rounds (two groups of 8, then a final of the top 4 from each).
- Total wins is the headline ranking. In a full round-robin it equals average rank, so it is fair. The other views exist because total wins hides ties, rivals, splits, and junk responses.
- Participants can be hidden from the Consistency view (individually, or "Hide all flagged"). Hidden participants drop out of every other view. Threshold for flagged: more than 15% of triples are cycles. 7 to 15% is labelled "Some noise" and kept.
- Supabase over browser storage because participants answer on their own devices and results must collect in one place. Plain REST calls over the Supabase JS client so there is nothing to install and the code stays readable.
- No login for the MVP. Anyone with a link can read and write. Tighten the policies in `schema.sql` when a login is added.

## Analysis methods in the code

- Head to head matrix: share of participants who picked row over column, skipped pairs excluded.
- Bradley-Terry: iterative MM fit, normalized to geometric mean 1, displayed as p/(p+1) = chance of beating an average message. 90% interval from 150 bootstrap resamples of participants, only when 5+ participants.
- Winner check: Condorcet test (does #1 win a majority against every other message) and a two-sided exact binomial test on #1 vs #2 head to head.
- Polarization: per message, histogram of rank positions across participants, mean, standard deviation, and a "split" flag when 30%+ rank it top two and 30%+ rank it bottom two.
- Consistency: count intransitive triples (A>B, B>C, C>A) per participant.

## Likely next steps

- A simple login for the admin page (Supabase Auth), then tighten the policies.
- A client-ready summary export (the CSV is raw choices).
- Optional: time per choice as another junk-response signal.
- Optional: participant metadata (segment, email) collected before the survey.

## Conventions

- Keep it simple and readable. The owner will read the code with AI help, not on his own.
- Light and dark mode both supported via CSS variables on :root. Keep that working.
- Mobile first layout. Pair cards stack on narrow screens.
- Testing: there is no automated test in the repo. To check a change, serve the folder locally and fake the Supabase REST endpoints (Playwright route interception works well), or point `config.js` at a throwaway Supabase project.
