-- Database setup for the preference test tool.
-- Paste this whole file into the Supabase SQL Editor and click Run. It only needs to run once.

create table if not exists tests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  messages    jsonb not null,                 -- array of strings, order matters (responses refer to messages by position)
  closed      boolean not null default false, -- true stops new responses
  created_at  timestamptz not null default now()
);

create table if not exists responses (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references tests (id) on delete cascade,
  choices     jsonb not null,                 -- { "i-j": winnerIndex | null }
  simulated   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists responses_test_id on responses (test_id);

-- Row level security is on, with open policies for the public (anon) key.
-- That means anyone who has the link can read results and create tests. That is fine for
-- an MVP that tests non-sensitive headlines. When a login is added, tighten these policies.

alter table tests enable row level security;
alter table responses enable row level security;

create policy "public can read tests"      on tests     for select to anon using (true);
create policy "public can create tests"    on tests     for insert to anon with check (true);
create policy "public can update tests"    on tests     for update to anon using (true) with check (true);
create policy "public can delete tests"    on tests     for delete to anon using (true);

create policy "public can read responses"   on responses for select to anon using (true);
create policy "public can add responses"    on responses for insert to anon with check (true);
create policy "public can delete responses" on responses for delete to anon using (true);
