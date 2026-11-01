-- Third database change: a scenario and a question per test. Applied to the live project on
-- 2026-11-01 through the Supabase connector.
--
-- scenario: optional framing shown to participants before the first pair.
-- question: the prompt shown above every pair. Existing tests keep the old default.

alter table tests add column if not exists scenario text not null default '';
alter table tests add column if not exists question text not null default 'Which message do you prefer?';
