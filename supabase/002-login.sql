-- Second database change: require a login for admin actions.
-- Run this once in the Supabase SQL Editor, after schema.sql.
--
-- Before: anyone with the anon key could do anything.
-- After:  without a login you can read tests (participants need to load them) and add responses
--         (participants submit answers). Everything else needs a signed in user.
--         Sign ups are turned off in the dashboard, so "signed in user" means the one admin account.

drop policy if exists "public can create tests"    on tests;
drop policy if exists "public can update tests"    on tests;
drop policy if exists "public can delete tests"    on tests;
drop policy if exists "public can read responses"   on responses;
drop policy if exists "public can delete responses" on responses;

create policy "admin full access to tests"     on tests     for all to authenticated using (true) with check (true);
create policy "admin full access to responses" on responses for all to authenticated using (true) with check (true);
