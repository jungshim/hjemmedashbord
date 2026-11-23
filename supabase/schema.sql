-- Hjemmedashbord: tabeller, tilgangsregler og sanntid.
-- Lim inn hele filen i Supabase → SQL Editor → Run. Kan kjøres flere ganger.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  list text not null,
  text text not null,
  done boolean not null default false,
  who text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Hvilke lister som finnes: de fire listene, oppskrifter, lager (kjøleskap/fryser/skap) og egne kalenderhendelser.
alter table public.items drop constraint if exists items_list_check;
alter table public.items add constraint items_list_check check (list in
  ('handle', 'gjoremal', 'stress', 'onske', 'oppskrift', 'kjoleskap', 'fryser', 'skap', 'hendelse'));
alter table public.items drop constraint if exists items_text_check;
alter table public.items add constraint items_text_check check (char_length(text) between 1 and 500);
create index if not exists items_list_idx on public.items (list, created_at);

create table if not exists public.dinners (
  day date primary key,
  dish text not null check (char_length(dish) between 1 and 200),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Bare innloggede brukere får lese og skrive. Uten innlogging: ingen tilgang.
alter table public.items enable row level security;
alter table public.dinners enable row level security;

drop policy if exists "innlogget full tilgang" on public.items;
create policy "innlogget full tilgang" on public.items
  for all to authenticated using (true) with check (true);

drop policy if exists "innlogget full tilgang" on public.dinners;
create policy "innlogget full tilgang" on public.dinners
  for all to authenticated using (true) with check (true);

-- Sanntid: endringer dukker opp hos den andre uten å laste siden på nytt.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'dinners') then
    alter publication supabase_realtime add table public.dinners;
  end if;
end $$;
