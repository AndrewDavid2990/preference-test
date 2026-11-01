-- Fourth database change: optional questions about the participant before the survey.
-- Applied to the live project on 2026-11-01 through the Supabase connector.
--
-- tests.ask_email          'off', 'optional' or 'required'
-- tests.segment_question   e.g. "Which best describes you?" (empty = do not ask)
-- tests.segment_options    list of answers to choose from, e.g. ["Founder", "Marketer", "Sales"]
-- responses.segment        the option the participant picked
-- responses.email          what they typed, if asked
-- Only admins can read responses, so emails are never visible without a login.

alter table tests add column if not exists ask_email text not null default 'off';
alter table tests add column if not exists segment_question text not null default '';
alter table tests add column if not exists segment_options jsonb not null default '[]';
alter table responses add column if not exists segment text not null default '';
alter table responses add column if not exists email text not null default '';
