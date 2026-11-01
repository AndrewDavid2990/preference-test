-- Fifth database change: how long each pair took. Applied to the live project on 2026-11-01
-- through the Supabase connector.
--
-- responses.times   { "i-j": milliseconds } from the pair appearing on screen to the tap.
-- Used on the Consistency tab as a second junk signal: a median under 1.5 seconds per pair is
-- flagged as rushed. Older responses have {} and simply show no timing.

alter table responses add column if not exists times jsonb not null default '{}';
