-- Second database change: require a login for admin actions. Already applied to the live project
-- on 2026-11-01 (through the Supabase connector). Kept here as the record of what changed.
--
-- Before: anyone with the anon key could do anything.
-- After:  without a login you can read tests (participants need to load them) and add responses
--         (participants submit answers). Everything else needs a signed in user whose email is in
--         the admins table. Signing up without being listed there gives no access at all.

create table if not exists admins (
  email text primary key,
  added_at timestamptz not null default now()
);
alter table admins enable row level security;
create policy "users can see their own admin row" on admins for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- True when the signed in user's email is in the admins table.
create or replace function is_admin() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- The open policies from schema.sql become admin only policies. "public can read tests" and
-- "public can add responses" stay open but must also cover signed in users: the admin page reads
-- tests, inserts simulated responses, and Supabase returns the new row after every insert, which
-- needs read permission.
alter policy "public can read tests"    on tests     to anon, authenticated;
alter policy "public can add responses" on responses to anon, authenticated;
alter policy "public can create tests"    on tests     to authenticated with check (is_admin());
alter policy "public can update tests"    on tests     to authenticated using (is_admin()) with check (is_admin());
alter policy "public can delete tests"    on tests     to authenticated using (is_admin());
alter policy "public can read responses"   on responses to authenticated using (is_admin());
alter policy "public can delete responses" on responses to authenticated using (is_admin());

alter policy "public can create tests"    on tests     rename to "admins can create tests";
alter policy "public can update tests"    on tests     rename to "admins can update tests";
alter policy "public can delete tests"    on tests     rename to "admins can delete tests";
alter policy "public can read responses"   on responses rename to "admins can read responses";
alter policy "public can delete responses" on responses rename to "admins can delete responses";

-- Who can sign in to the admin page. Add a row per teammate; they also need an auth account.
insert into admins (email) values ('hello@andrewyedlin.com') on conflict do nothing;
