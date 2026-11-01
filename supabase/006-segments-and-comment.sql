-- Sixth database change: several segment questions per test, and a closing open text question.
-- Applied to the live project on 2026-11-01 through the Supabase connector.
--
-- tests.segments          [{ "question": "...", "options": ["...", "..."] }], up to 4 in the UI
-- tests.comment_prompt    shown after the last pair; "{top choice}" becomes the participant's own #1. Empty = not asked.
-- responses.segments      one answer per question, in the same order
-- responses.comment       the participant's answer to the closing question
-- The older single question columns (tests.segment_question, segment_options, responses.segment) are no longer
-- used by the code; their data was copied into the new columns below.

alter table tests add column if not exists segments jsonb not null default '[]';
alter table tests add column if not exists comment_prompt text not null default 'Your top rated message was {top choice}. What made you choose that message?';
alter table responses add column if not exists segments jsonb not null default '[]';
alter table responses add column if not exists comment text not null default '';

update tests set segments = jsonb_build_array(jsonb_build_object('question', segment_question, 'options', segment_options))
  where segment_question <> '' and segments = '[]'::jsonb;
update responses set segments = jsonb_build_array(segment) where segment <> '' and segments = '[]'::jsonb;

-- Participants cannot read or update responses, so the closing comment is added through this
-- narrow function: it only ever fills an empty comment on a row whose id the caller knows.
create or replace function add_comment(p_id uuid, p_comment text) returns void
language sql security definer set search_path = public as $$
  update responses set comment = left(coalesce(p_comment, ''), 2000) where id = p_id and comment = '';
$$;
revoke all on function add_comment(uuid, text) from public;
grant execute on function add_comment(uuid, text) to anon, authenticated;
