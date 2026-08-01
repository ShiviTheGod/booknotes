-- BookNotes: friends and reviews.
--
-- Run this in your Supabase project after schema.sql, the same way: SQL Editor → New
-- query → paste → Run. Safe to run more than once.
--
-- What travels here is only ever what someone wrote deliberately about a book. Reading
-- notes stay on the device, and the text extracted from photographed pages — which is
-- the book's own words, not the reader's — is never part of any of this.
--
-- Nobody can browse anybody. Profiles are not readable as a table; the only ways in are
-- the functions below, each of which answers one question and nothing more. That is
-- what stops the anon key from becoming a way to enumerate everyone who uses the app.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text
);

alter table public.profiles enable row level security;

-- Only your own row, directly. Friends' names reach you through the functions below,
-- which run with elevated rights and hand back one specific answer.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A profile has to exist before anyone can be found by email, so it is made at signup
-- rather than waiting for the reader to visit a settings screen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill, for accounts made before this file was run.
insert into public.profiles (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------- friendships

create table if not exists public.friendships (
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  constraint no_self_friendship check (requester <> addressee)
);

alter table public.friendships enable row level security;

drop policy if exists "see your own connections" on public.friendships;
create policy "see your own connections" on public.friendships
  for select using (auth.uid() in (requester, addressee));

-- You may only ever ask on your own behalf.
drop policy if exists "ask in your own name" on public.friendships;
create policy "ask in your own name" on public.friendships
  for insert with check (auth.uid() = requester);

-- Only the person who was asked can accept. Without this the asker could mark their
-- own request accepted and let themselves in.
drop policy if exists "only the asked may accept" on public.friendships;
create policy "only the asked may accept" on public.friendships
  for update using (auth.uid() = addressee) with check (auth.uid() = addressee);

-- Either side can end it: declining, cancelling and unfriending are the same act.
drop policy if exists "either side may end it" on public.friendships;
create policy "either side may end it" on public.friendships
  for delete using (auth.uid() in (requester, addressee));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- ---------------------------------------------------------------- reviews

create table if not exists public.reviews (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Same book on two shelves must produce the same key, or two friends' reviews never
  -- meet. Built from title and first author, not from a provider id — those differ per
  -- provider. See src/services/social/bookKey.ts.
  book_key   text not null,
  title      text not null,
  authors    text,
  rating     smallint check (rating between 1 and 5),
  body       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, book_key)
);

alter table public.reviews enable row level security;

drop policy if exists "yours, and your friends'" on public.reviews;
create policy "yours, and your friends'" on public.reviews
  for select using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy if exists "write only your own" on public.reviews;
create policy "write only your own" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- the ways in

/*
 * Ask someone to be a friend, by email.
 *
 * Runs with elevated rights so the profiles table itself stays unreadable — otherwise
 * anyone holding the anon key could list every address that has ever signed up. This
 * answers one question: is there an account at this address, and it is now connected
 * to yours. Note it cannot tell the caller *whose* account, only that the ask landed.
 */
create or replace function public.request_friend(target_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select user_id into target from public.profiles
  where lower(email) = lower(trim(target_email));

  if target is null then return 'not-found'; end if;
  if target = auth.uid() then return 'self'; end if;

  -- They already asked you. Asking back is how people say yes, so treat it as such
  -- rather than leaving two mirrored requests nobody can resolve.
  if exists (
    select 1 from public.friendships
    where requester = target and addressee = auth.uid()
  ) then
    update public.friendships set status = 'accepted'
    where requester = target and addressee = auth.uid();
    return 'accepted';
  end if;

  insert into public.friendships (requester, addressee, status)
  values (auth.uid(), target, 'pending')
  on conflict (requester, addressee) do nothing;

  return 'requested';
end;
$$;

/** Everyone you are connected to, and which way the ask went. */
create or replace function public.list_friends()
returns table (friend_id uuid, email text, status text, direction text)
language sql stable security definer set search_path = public as $$
  select
    p.user_id,
    p.email,
    f.status,
    case when f.requester = auth.uid() then 'outgoing' else 'incoming' end
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee);
$$;

/** Every review of one book that you are allowed to see: yours, and your friends'. */
create or replace function public.reviews_for_book(key text)
returns table (user_id uuid, email text, rating smallint, body text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.email, r.rating, r.body, r.updated_at
  from public.reviews r
  join public.profiles p on p.user_id = r.user_id
  where r.book_key = key
    and (r.user_id = auth.uid() or public.are_friends(auth.uid(), r.user_id))
  order by r.updated_at desc;
$$;
