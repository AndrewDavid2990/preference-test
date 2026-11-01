-- Seventh database change: a performance tweak suggested by Supabase's advisor. Applied live on 2026-11-01.
-- Wrapping auth.jwt() in (select ...) lets Postgres evaluate it once per query instead of once per row.
-- No change in behaviour.

alter policy "users can see their own admin row" on admins using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
create or replace function is_admin() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from admins where email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
$$;
