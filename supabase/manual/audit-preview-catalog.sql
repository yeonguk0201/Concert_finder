-- Read-only triage, NOT proof an event is fictional. Review original evidence first.
-- Keep IDs/history/saved schedules. Withdraw or correct via admin_save_concert.
select c.id, c.title, c.status, c.starts_on,
  array(select b.name from public.concert_bands cb join public.bands b on b.id=cb.band_id where cb.concert_id=c.id) as lineup,
  array(select s.url from public.concert_sources s where s.concert_id=c.id) as sources,
  array_remove(array[
    case when c.title ~* '(test|테스트|가상|sample|autumn frequencies)' then '테스트 이름: 원문 확인 필요' end,
    case when not exists(select 1 from public.concert_sources s where s.concert_id=c.id and s.verified_at is not null) then '확인된 출처 없음' end,
    case when exists(select 1 from public.concert_sources s where s.concert_id=c.id and s.url ~ '^https://(test\.com|example\.com|example\.test|official\.example)(/|$)') then '테스트용 출처: 공개 중단 검토' end,
    case when exists(select 1 from public.concert_sources s where s.concert_id=c.id and s.url='https://ualive.com/concerts/397')
      and exists(select 1 from public.concert_bands cb join public.bands b on b.id=cb.band_id where cb.concert_id=c.id and lower(b.name) not in ('my chemical romance','mcr','마이 케미컬 로맨스'))
      then 'MCR 원문에 없는 추가 출연진: N02 임의 라인업 원복 대상인지 대조' end
  ],null) as review_flags
from public.concerts c order by c.status,c.title;
