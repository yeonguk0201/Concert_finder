-- Run once in Supabase SQL Editor, then reload the catalog in the app.
-- Real band only; no concert or ticket announcement is implied.
-- Official reference: https://oasisinet.com/the-story/
insert into public.bands (id, name, aliases, country_code, description)
values ('2144bbac-dc75-4d4c-99d2-0b675e4b83f9', 'Oasis', array['오아시스'], 'GB',
  '공식 사이트: https://oasisinet.com/')
on conflict (id) do nothing;
