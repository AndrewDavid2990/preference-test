# Preference testing tool

Pairwise preference test for short text messages (headlines, value props, subject lines). Participants see every pair of messages, pick one each time, and the choices roll up into a ranking with several analysis views. Built for Tested (tested.agency), a CRO agency for B2B SaaS, to use in messaging engagements.

Owner is non-technical. Explain technical choices in plain language. No em dashes in any written output or UI copy.

## Current state

`index.html` is a working single-file prototype (plain HTML, CSS, vanilla JS, one Google Font). No build step, no framework, no backend. Open it in a browser and it runs. All data lives in memory in the tab and is lost on refresh.

Flows:
1. Setup: enter 2 to 8 messages (8 sample headlines prefilled). Shows comparison count.
2. Survey: one pair at a time, two cards, click or press 1/2 to choose, optional skip. Pair order and left/right side are randomized per participant. Progress bar.
3. Personal results: that participant's ranking by wins.
4. Group results: tabs for Ranking, Head to head, Strength scores, Winner check, Polarization, Consistency.
5. "Simulate 15 participants" generates fake respondents (with one deliberately polarizing message and roughly 1 in 12 random clickers) so the group views can be exercised without real data.

## Product decisions already made

- Cap at 8 messages so every participant sees every pair (28 max, about 2 minutes). Rejected a larger cap with random subsets because full round-robin gives a per-person ranking, lets you spot segments, and is easy to explain to clients. For more than 8 candidates, run two rounds (two groups of 8, then a final of the top 4 from each).
- Total wins is the headline ranking. In a full round-robin it equals average rank, so it is fair. The other views exist because total wins hides ties, rivals, splits, and junk responses.
- Participants can be hidden from the Consistency view (individually, or "Hide all flagged"). Hidden participants drop out of every other view. Threshold for flagged: more than 15% of triples are cycles. 7 to 15% is labelled "Some noise" and kept.

## Analysis methods in the code

- Head to head matrix: share of participants who picked row over column, skipped pairs excluded.
- Bradley-Terry: iterative MM fit, normalized to geometric mean 1, displayed as p/(p+1) = chance of beating an average message. 90% interval from 150 bootstrap resamples of participants, only when 5+ participants.
- Winner check: Condorcet test (does #1 win a majority against every other message) and a two-sided exact binomial test on #1 vs #2 head to head.
- Polarization: per message, histogram of rank positions across participants, mean, standard deviation, and a "split" flag when 30%+ rank it top two and 30%+ rank it bottom two.
- Consistency: count intransitive triples (A>B, B>C, C>A) per participant.

## Likely next steps

- Persistence: store tests and responses somewhere (any simple backend or hosted DB). Right now nothing survives a refresh.
- Split the admin side (create test, view results) from the participant side (a shareable link that opens straight into the survey, no setup screen).
- Export results (CSV, or a client-ready summary).
- Multiple tests per account, naming, and a results list.
- Optional: time per choice as another junk-response signal.

## Conventions

- Keep it simple and readable. The owner will read the code with AI help, not on his own.
- Light and dark mode both supported via CSS variables on :root. Keep that working.
- Mobile first layout. Pair cards stack on narrow screens.
