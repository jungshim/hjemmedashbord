-- Hendelser godkjent fra Google Kalender 22. november 2026.
-- Kjør i Supabase → SQL Editor etter schema.sql. Kan kjøres flere ganger uten duplikater.
insert into public.items (id, list, text, meta) values
  ('7f1c2a10-0b1e-4c7a-9a51-000000000001', 'hendelse', 'Time sykehuset', '{"day": "2026-11-25", "time": "10:00"}'),
  ('7f1c2a10-0b1e-4c7a-9a51-000000000002', 'hendelse', 'Helsestasjon, Kolsås', '{"day": "2026-11-26", "time": "09:30"}')
on conflict (id) do nothing;
