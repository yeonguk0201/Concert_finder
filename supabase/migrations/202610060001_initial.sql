-- Production data only. Fictional fixtures stay in src/data.ts.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create table private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  aliases text[] not null default '{}',
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  description text,
  created_at timestamptz not null default now()
);
create table public.concerts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  format text not null check (format in ('solo', 'festival')),
  country_code text not null default 'KR' check (country_code = 'KR'),
  city text,
  venue text,
  starts_on date,
  ends_on date,
  announced_on date,
  announced_at timestamptz,
  announcement_verified boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'withdrawn')),
  cancelled boolean not null default false,
  first_published_at timestamptz,
  updated_at timestamptz not null default now(),
  check (ends_on is null or (starts_on is not null and ends_on >= starts_on)),
  check (announced_at is null or (announced_on is not null and (announced_at at time zone 'Asia/Seoul')::date = announced_on))
);
create table public.concert_sources (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  url text not null check (url ~ '^https://[^ /]+'),
  label text not null,
  verified_at timestamptz,
  unique(concert_id, url)
);
create table public.concert_sessions (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  label text not null,
  starts_on date,
  starts_at timestamptz,
  check (starts_at is null or (starts_on is not null and (starts_at at time zone 'Asia/Seoul')::date = starts_on))
);
create table public.concert_bands (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  band_id uuid not null references public.bands(id),
  appearance_on date,
  appearance_at timestamptz,
  added_at timestamptz not null default now(),
  unique(concert_id, band_id),
  check (appearance_at is null or (appearance_on is not null and (appearance_at at time zone 'Asia/Seoul')::date = appearance_on))
);
create table public.ticket_schedules (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null unique references public.concerts(id) on delete cascade,
  opens_at timestamptz,
  booking_url text check (booking_url ~ '^https://[^ /]+'),
  price_description text,
  revision integer not null default 1 check (revision > 0)
);
create table public.band_follows (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  band_id uuid not null references public.bands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, band_id)
);
create table public.saved_schedules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticket_schedule_id uuid not null references public.ticket_schedules(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, ticket_schedule_id)
);
create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  announcements boolean not null default false,
  ticket_reminders boolean not null default false,
  updated_at timestamptz not null default now()
);
-- Backend-only records: future workers must recheck consent and current state.
create table private.publication_changes (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  kind text not null check (kind in ('first_publication', 'lineup', 'update', 'cancellation')),
  initial_import boolean not null default false,
  created_at timestamptz not null default now()
);
create table private.concert_history (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  previous_record jsonb not null,
  changed_at timestamptz not null default now()
);
create table private.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid references private.publication_changes(id) on delete cascade,
  ticket_schedule_id uuid references public.ticket_schedules(id) on delete cascade,
  schedule_revision integer,
  device_key text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'invalidated')),
  attempts integer not null default 0 check (attempts >= 0),
  due_at timestamptz not null,
  last_error text,
  check ((change_id is not null and ticket_schedule_id is null and schedule_revision is null)
    or (change_id is null and ticket_schedule_id is not null and schedule_revision is not null)),
  unique(user_id, change_id, device_key),
  unique(user_id, ticket_schedule_id, schedule_revision, device_key)
);

create function private.guard_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.first_published_at := old.first_published_at;
    insert into private.concert_history(concert_id, actor_id, previous_record)
      values(old.id, auth.uid(), to_jsonb(old));
  end if;
  new.updated_at := now();
  if new.status = 'published' then
    if new.starts_on is null or not new.announcement_verified or new.announced_on is null
      or not exists(select 1 from public.concert_sources where concert_id = new.id and verified_at is not null)
      or not exists(select 1 from public.concert_bands where concert_id = new.id) then
      raise exception 'Publication requires dates, verified announcement, official source and lineup';
    end if;
    new.first_published_at := coalesce(new.first_published_at, now());
  elsif tg_op = 'INSERT' then
    new.first_published_at := null;
  end if;
  return new;
end;
$$;
-- Trigger needs private history access without granting clients direct writes.
alter function private.guard_publication() security definer;
create trigger guard_publication before insert or update on public.concerts
for each row execute function private.guard_publication();

create function private.bump_ticket_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + case when new.opens_at is distinct from old.opens_at then 1 else 0 end;
  return new;
end;
$$;
create trigger bump_ticket_revision before update on public.ticket_schedules
for each row execute function private.bump_ticket_revision();

-- Explicit grants; never expose private tables via the Data API.
grant select on public.bands, public.concerts, public.concert_sources, public.concert_sessions,
  public.concert_bands, public.ticket_schedules to anon, authenticated;
grant insert, update, delete on public.bands, public.concerts, public.concert_sources,
  public.concert_sessions, public.concert_bands, public.ticket_schedules to authenticated;
grant select, insert, delete on public.band_follows, public.saved_schedules to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

alter table public.bands enable row level security;
create policy bands_read on public.bands for select to anon, authenticated using (true);
create policy bands_admin on public.bands for all to authenticated using (private.is_admin()) with check (private.is_admin());
alter table public.concerts enable row level security;
create policy concerts_read on public.concerts for select to anon, authenticated using (status = 'published' or private.is_admin());
create policy concerts_admin on public.concerts for all to authenticated using (private.is_admin()) with check (private.is_admin());

do $$
declare tab text;
begin
  foreach tab in array array['concert_sources', 'concert_sessions', 'concert_bands', 'ticket_schedules'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (exists(select 1 from public.concerts c where c.id = concert_id and c.status = ''published'') or private.is_admin())', tab);
    execute format('create policy catalog_admin on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', tab);
  end loop;
  foreach tab in array array['band_follows', 'saved_schedules', 'notification_preferences'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', tab);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', tab);
  end loop;
  foreach tab in array array['admins', 'publication_changes', 'concert_history', 'notification_deliveries'] loop
    execute format('alter table private.%I enable row level security', tab);
  end loop;
end;
$$;
create policy follows_insert on public.band_follows for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy saves_insert on public.saved_schedules for insert to authenticated
with check ((select auth.uid()) = user_id and exists(
  select 1 from public.ticket_schedules t join public.concerts c on c.id = t.concert_id
  where t.id = ticket_schedule_id and c.status = 'published' and not c.cancelled));
create policy preferences_insert on public.notification_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy preferences_update on public.notification_preferences for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index follows_band_idx on public.band_follows(band_id);
create index lineup_band_idx on public.concert_bands(band_id);
create index sources_concert_idx on public.concert_sources(concert_id);
create index sessions_concert_idx on public.concert_sessions(concert_id);
create index saves_schedule_idx on public.saved_schedules(ticket_schedule_id);
