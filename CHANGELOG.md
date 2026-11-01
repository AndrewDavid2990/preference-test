# Changelog

Newest first. Dates are when the change went live on `main`.

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
