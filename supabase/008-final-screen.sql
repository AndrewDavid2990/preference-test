-- Eighth database change: the closing question, segment questions and email now all come on one
-- final screen after the last pair. Applied to the live project on 2026-11-02 through the connector.
--
-- The choices are saved when the last pair is answered; this function attaches the final screen's
-- answers afterwards, once, to a row whose id the caller knows and that has no details yet.
-- add_comment from 006 is no longer called by the code and can be dropped at some point.

create or replace function finish_response(p_id uuid, p_comment text, p_segments jsonb, p_email text) returns void
language sql security definer set search_path = public as $$
  update responses
     set comment = left(coalesce(p_comment, ''), 2000),
         segments = coalesce(p_segments, '[]'::jsonb),
         email = left(coalesce(p_email, ''), 320)
   where id = p_id and comment = '' and segments = '[]'::jsonb and email = '';
$$;
revoke all on function finish_response(uuid, text, jsonb, text) from public;
grant execute on function finish_response(uuid, text, jsonb, text) to anon, authenticated;
