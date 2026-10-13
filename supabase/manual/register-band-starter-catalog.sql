-- Band identities only. This does not announce concerts, publish events or send push.
-- References checked 2026-10-10; apply in Supabase SQL Editor as an operator.
-- Preserve existing IDs, aliases and user follows. Repeat execution adds no duplicates.
begin;
lock table public.bands in share row exclusive mode;
with starter(name, aliases, country_code, reference) as (values
  ('DAY6', array['데이식스', '데이6'], 'KR', 'https://day6.jype.com/profile'),
  ('JANNABI', array['잔나비'], 'KR', 'https://linktr.ee/bandjannabi'),
  ('Silica Gel', array['실리카겔', '실리카젤'], 'KR', 'https://www.youtube.com/c/SilicaGelOfficial'),
  ('HYUKOH', array['혁오'], 'KR', 'https://www.youtube.com/hyukoh'),
  ('ONE OK ROCK', array['원오크록', '원오케이락', '원오크락', 'ワンオクロック'], 'JP', 'https://www.oneokrock.com/en/'),
  ('RADWIMPS', array['래드윔프스', '라드윔프스', 'ラッドウィンプス'], 'JP', 'https://radwimps.jp/'),
  ('King Gnu', array['킹누', '킹 누', 'キングヌー'], 'JP', 'https://kinggnu.jp/'),
  ('SEKAI NO OWARI', array['세카이노오와리', '세카이 노 오와리', '世界の終わり'], 'JP', 'https://sekainoowari.jp/'),
  ('ヨルシカ', array['요루시카', 'Yorushika'], 'JP', 'https://yorushika.com/'),
  ('MY FIRST STORY', array['마이퍼스트스토리', '마이 퍼스트 스토리'], 'JP', 'https://myfirststory.net/'),
  ('Muse', array['뮤즈'], 'GB', 'https://www.muse.mu/'),
  ('Radiohead', array['라디오헤드'], 'GB', 'https://www.radiohead.com/'),
  ('Coldplay', array['콜드플레이'], 'GB', 'https://www.coldplay.com/'),
  ('Foo Fighters', array['푸 파이터스', '푸파이터스'], 'US', 'https://foofighters.com/'),
  ('Arctic Monkeys', array['악틱 몽키즈', '악틱몽키즈'], 'GB', 'https://www.arcticmonkeys.com/'),
  ('Linkin Park', array['린킨 파크', '린킨파크'], 'US', 'https://www.linkinpark.com/')
)
insert into public.bands(name, aliases, country_code, description)
select s.name, s.aliases, s.country_code, '공식 사이트: ' || s.reference
from starter s
where not exists (
  select 1 from public.bands b
  where b.country_code = s.country_code
    and exists (
      select 1 from unnest(array[b.name] || b.aliases) existing_name
      cross join unnest(array[s.name] || s.aliases) starter_name
      where lower(regexp_replace(existing_name, '[[:space:]]', '', 'g'))
          = lower(regexp_replace(starter_name, '[[:space:]]', '', 'g'))
    )
);
commit;

-- Verify names/counts before and after application. No concert rows are added.
select name, aliases, country_code from public.bands order by country_code, name;
