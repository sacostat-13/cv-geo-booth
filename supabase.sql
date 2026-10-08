-- Common Voice booth wall — Supabase schema.
-- Run this in the Supabase SQL editor, then put the project URL and the anon
-- (publishable) key into config.js and set mode to "supabase".
--
-- No personal data is collected: a country, a language code, an optional
-- dialect string and optional initials. No IP, no device id, no free text
-- beyond the language and dialect names people type themselves.

create table if not exists public.submissions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  country     char(2)     not null,
  locale      text,                      -- Common Voice locale, null when the language isn't in CV
  lang_name   text        not null,
  dialect     text,
  initials    text,
  missing     text,                      -- the typed-in name when the language isn't in CV yet
  event       text
);

create index if not exists submissions_created_at_idx on public.submissions (created_at);

-- Keep the free-text fields short so nobody can paste an essay onto the wall.
alter table public.submissions
  add constraint submissions_lengths check (
    char_length(lang_name) <= 64
    and (dialect  is null or char_length(dialect)  <= 64)
    and (initials is null or char_length(initials) <= 4)
    and (missing  is null or char_length(missing)  <= 64)
  );

alter table public.submissions enable row level security;

-- Anyone with the anon key may add a voice and read the wall. Nothing else.
create policy "anon can add a voice"
  on public.submissions for insert to anon with check (true);

create policy "anon can read the wall"
  on public.submissions for select to anon using (true);

-- No update or delete policy: rows cannot be changed or removed with the anon
-- key. Clear the wall from the Supabase dashboard between events:
--   delete from public.submissions where event = 'MozFest 2026';

-- Optional: a brake on flooding. Caps the table at roughly one insert per
-- second per country, which a real queue never hits but a script does.
-- create or replace function public.throttle_submissions() returns trigger as $$
-- begin
--   if exists (select 1 from public.submissions
--              where country = new.country and created_at > now() - interval '1 second') then
--     raise exception 'too fast';
--   end if;
--   return new;
-- end $$ language plpgsql security definer;
-- create trigger submissions_throttle before insert on public.submissions
--   for each row execute function public.throttle_submissions();
