-- Execute the WHOLE file in Supabase SQL Editor (postgres).
-- Reviewed 2026-10-06. This imports real catalog data, not sample fixtures.
-- Current performance: https://ualive.com/concerts/397
-- Postponement: https://www.ticketlink.co.kr/global/en/help/notice/63744
-- Original general sale: https://www.ticketlink.co.kr/help/notice/62400
-- Original announcement day (organizer statement reported on 2025-07-07):
-- https://m.etnews.com/20250707000164
-- Do not replace announcement day with import day or invent a new sale opening.
-- Re-running preserves existing records and account saves. This is an initial
-- import, not a future schedule-update tool; later changes need separate review.
begin;
insert into public.bands (id, name, aliases, country_code, description)
values ('8f0b57b1-a196-44ae-92a3-5ab463fc6901', 'My Chemical Romance',
  array['MCR', '마이 케미컬 로맨스', '마이케미컬로맨스'], 'US', '이모 록')
on conflict (id) do nothing;

insert into public.concerts (id, title, format, city, venue, starts_on, ends_on,
  announced_on, announced_at, announcement_verified)
values ('8f0b57b1-a196-44ae-92a3-5ab463fc6902',
  '마이 케미컬 로맨스 내한공연 (My Chemical Romance Live in Korea)', 'solo',
  '인천', '파라다이스시티 컬처파크', '2026-11-07', '2026-11-07',
  '2025-07-07', null, true)
on conflict (id) do nothing;

insert into public.concert_sources (concert_id, url, label, verified_at) values
  ('8f0b57b1-a196-44ae-92a3-5ab463fc6902', 'https://ualive.com/concerts/397', '주최사 · 현재 공연 일정', now()),
  ('8f0b57b1-a196-44ae-92a3-5ab463fc6902', 'https://www.ticketlink.co.kr/global/en/help/notice/63744', '티켓링크 · 4월 공연의 11월 연기 안내', now()),
  ('8f0b57b1-a196-44ae-92a3-5ab463fc6902', 'https://www.ticketlink.co.kr/help/notice/62400', '티켓링크 · 기존 일반 예매 오픈 안내 (공연일은 연기 공지 참조)', now()),
  ('8f0b57b1-a196-44ae-92a3-5ab463fc6902', 'https://m.etnews.com/20250707000164', '전자신문 · 주최사 최초 발표일 보도', now())
on conflict (concert_id, url) do nothing;

insert into public.concert_sessions (id, concert_id, label, starts_on, starts_at)
values ('8f0b57b1-a196-44ae-92a3-5ab463fc6903', '8f0b57b1-a196-44ae-92a3-5ab463fc6902',
  '단독 공연', '2026-11-07', '2026-11-07T19:00:00+09:00')
on conflict (id) do nothing;

insert into public.concert_bands (concert_id, band_id, appearance_on, appearance_at)
values ('8f0b57b1-a196-44ae-92a3-5ab463fc6902', '8f0b57b1-a196-44ae-92a3-5ab463fc6901',
  '2026-11-07', '2026-11-07T19:00:00+09:00')
on conflict (concert_id, band_id) do nothing;

insert into public.ticket_schedules (id, concert_id, opens_at, booking_url, price_description)
values ('8f0b57b1-a196-44ae-92a3-5ab463fc6904', '8f0b57b1-a196-44ae-92a3-5ab463fc6902',
  '2025-07-14T12:00:00+09:00', 'https://www.ticketlink.co.kr/product/57330',
  '스탠딩 175,000원 · 지정석 P 220,000원 · 지정석 R 195,000원')
on conflict (concert_id) do nothing;

-- Publish only after verified sources and lineup are present.
update public.concerts set status = 'published'
where id = '8f0b57b1-a196-44ae-92a3-5ab463fc6902' and status = 'draft';
commit;

select c.title, c.status, c.starts_on, t.opens_at, t.booking_url
from public.concerts c join public.ticket_schedules t on t.concert_id = c.id
where c.id = '8f0b57b1-a196-44ae-92a3-5ab463fc6902';
