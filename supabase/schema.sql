-- BookNotes sync schema.
--
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
-- One table holds every synced row as JSON. The server never looks inside `data`, so
-- mirroring the app's schema in SQL would buy nothing and cost a migration every time
-- a field is added. Photographs are not here by design — they stay on the device that
-- took them.

create table if not exists public.sync_rows (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  entity     text        not null check (entity in ('book', 'chapter', 'note')),
  id         text        not null,

  -- When the reader last changed the row, by their device's clock. This is what
  -- decides who wins a conflict.
  updated_at timestamptz not null,

  -- Set when the row was deleted. The row itself stays: a deletion has to be
  -- something the other device can *see*, or it would look like a row that device is
  -- simply missing and push it straight back.
  deleted_at timestamptz,

  data       jsonb,

  -- Stamped by the server on every write, and the only clock both devices agree on.
  -- Pulls are "everything with server_at newer than last time", which stays correct
  -- even when two phones disagree about what time it is.
  server_at  timestamptz not null default now(),

  primary key (user_id, entity, id)
);

-- The one query sync makes: my rows, changed since I last looked.
create index if not exists sync_rows_user_server_at
  on public.sync_rows (user_id, server_at);

-- Refresh server_at on updates too. A column default only fires on insert, so without
-- this an edited row keeps its original stamp and the other device never sees it again.
create or replace function public.touch_server_at()
returns trigger
language plpgsql
as $$
begin
  new.server_at = now();
  return new;
end;
$$;

drop trigger if exists sync_rows_touch on public.sync_rows;
create trigger sync_rows_touch
  before insert or update on public.sync_rows
  for each row execute function public.touch_server_at();

-- Row Level Security is what makes the anon key safe to keep in the app. Without it,
-- anybody holding that key could read every row in the table; with it, the key can
-- only ever reach rows belonging to whoever is signed in.
alter table public.sync_rows enable row level security;

drop policy if exists "readers reach only their own rows" on public.sync_rows;
create policy "readers reach only their own rows"
  on public.sync_rows
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
