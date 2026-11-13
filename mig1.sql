-- =====================================================================
-- KARMA · Stufe 1 (Test Trebbin)
-- Supabase / PostgreSQL 17 + PostGIS
--
-- Ersetzt die beiden Entwurfs-Migrationen vom 12.11. (supabase/archive).
-- Grundlage: docs/briefing.md, Abschnitte 5.9 bis 5.13.
--
-- Inhalt
--   0  Extensions
--   1  Tabellen
--   2  Indizes
--   3  Hilfsfunktionen und Trigger
--   4  RPCs: Profil, Anfrage, Feed, Swipe, Annehmen, Abschluss, Melden
--   5  Automatik (pg_cron): Auto-Abschluss nach 24 h, Aura
--   6  Views für öffentliche Daten
--   7  Row Level Security und Grants
--   8  Realtime und Storage
--
-- Grundsätze
--   * Schreibzugriffe auf Punkte, Status und Bewertungen nur über
--     security-definer-RPCs. Clients dürfen diese Spalten nicht setzen.
--   * Andere sehen nie exakte Koordinaten, Adresse, Alter oder Telefon.
--     Ort und Adresshinweis nur für anfragende Person und angenommene
--     Helfende.
--   * Punkte: 10 je angefangene Viertelstunde, keine Abwertung, kein
--     Multiplikator. Tiere steigen nur auf, die Aura verblasst nach
--     14 Tagen ohne Hilfe.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1  Tabellen
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  first_name         text check (char_length(first_name) between 1 and 30),
  last_initial       text check (last_initial ~ '^[A-ZÄÖÜ]$'),
  avatar_url         text,
  gender             text check (gender in ('female','male')),
  age_group          text check (age_group in ('18-29','30-44','45-59','60-74','75+')),
  languages          text[] not null default '{}',
  about              text check (char_length(about) <= 300),
  skills             text[] not null default '{}',
  availability       text check (char_length(availability) <= 120),
  district           text check (char_length(district) <= 60),
  accepted_terms_at  timestamptz,
  karma_points       int not null default 0 check (karma_points >= 0),
  animal_stage       int not null default 1 check (animal_stage between 1 and 7),
  aura_active        boolean not null default false,
  last_helped_at     timestamptz,
  -- 1 = E-Mail, im Test persönlich eingeladen; 2 = vom Träger bestätigt;
  -- 3 = Ausweis (später)
  verification_level int not null default 1 check (verification_level between 1 and 3),
  account_type       text not null default 'person' check (account_type in ('person','organization')),
  is_verified_org    boolean not null default false,
  organization_name  text check (char_length(organization_name) <= 80),
  is_admin           boolean not null default false,
  created_at         timestamptz not null default now()
);

create table public.help_requests (
  id                uuid primary key default gen_random_uuid(),
  requester_id      uuid not null references public.profiles (id) on delete cascade,
  category          text not null check (category in
                    ('shopping','carrying','tech','home','company','escort','pets','tools','other')),
  title             text not null check (char_length(title) between 3 and 80),
  description       text check (char_length(description) <= 1000),
  estimated_minutes int  not null check (estimated_minutes in (15,30,45,60,90,120)),
  timing            text not null check (timing in ('now','today','date')),
  scheduled_at      timestamptz,
  recurrence        text not null default 'once' check (recurrence in ('once','weekly','biweekly','monthly')),
  mode              text not null default 'in_person' check (mode in ('in_person','remote')),
  location          extensions.text,
  address_note      text check (char_length(address_note) <= 200),
  helpers_needed    int  not null default 1 check (helpers_needed between 1 and 30),
  auto_accept       boolean not null default false,
  gender_pref       text not null default 'any' check (gender_pref in ('any','female','male')),
  min_verification  int  not null default 1 check (min_verification between 1 and 3),
  -- Träger-Anfrage, die sonst beim eigenen Personal gelandet wäre (5.3)
  is_org_request    boolean not null default false,
  relieves_staff    boolean not null default false,
  status            text not null default 'open' check (status in ('open','completed','cancelled')),
  helper_done_at    timestamptz,
  final_minutes     int  check (final_minutes between 15 and 240),
  completed_at      timestamptz,
  auto_completed    boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint help_requests_date_needs_time check (timing <> 'date' or scheduled_at is not null),
  constraint help_requests_place check (mode = 'remote' or location is not null)
);

create table public.request_helpers (
  request_id     uuid not null references public.help_requests (id) on delete cascade,
  helper_id      uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'offered'
                 check (status in ('offered','accepted','declined','withdrawn')),
  attended       boolean,
  points_awarded int  not null default 0,
  -- nicht öffentliches Feedback des Helfers an die Moderation
  helper_note    text check (char_length(helper_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (request_id, helper_id)
);

create table public.dismissals (
  request_id uuid not null references public.help_requests (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table public.messages (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.help_requests (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.ratings (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.help_requests (id) on delete cascade,
  rater_id   uuid not null references public.profiles (id) on delete cascade,
  helper_id  uuid not null references public.profiles (id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (request_id, helper_id)
);

create table public.reports (
  id             bigint generated always as identity primary key,
  reporter_id    uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  request_id     uuid references public.help_requests (id) on delete set null,
  reason         text not null check (reason in
                 ('safety','inappropriate','spam','no_show','low_rating','other')),
  details        text check (char_length(details) <= 1000),
  status         text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at     timestamptz not null default now(),
  constraint reports_has_target check (target_user_id is not null or request_id is not null)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------
-- 2  Indizes
-- ---------------------------------------------------------------------
create index help_requests_location_gix on public.help_requests using btree (location);
create index help_requests_open_idx     on public.help_requests (created_at desc) where status = 'open';
create index help_requests_requester_idx on public.help_requests (requester_id, created_at desc);
create index help_requests_done_idx     on public.help_requests (helper_done_at)
  where status = 'open' and helper_done_at is not null;
create index request_helpers_helper_idx on public.request_helpers (helper_id, created_at desc);
create index messages_request_idx       on public.messages (request_id, created_at);
create index ratings_helper_idx         on public.ratings (helper_id, created_at desc);
create index reports_open_idx           on public.reports (created_at desc) where status = 'open';
create index reports_request_idx        on public.reports (request_id);
create index blocks_blocked_idx         on public.blocks (blocked_id);
create index dismissals_user_idx        on public.dismissals (user_id);

-- ---------------------------------------------------------------------
-- 3  Hilfsfunktionen und Trigger
-- ---------------------------------------------------------------------

-- Profil beim Signup anlegen
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, nullif(left(trim(new.raw_user_meta_data->>'first_name'), 30), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tierstufe aus Punkten. Schwellen: 20 / 60 / 150 / 300 / 600 / 1000
create or replace function public.stage_for_points(p int)
returns int language sql immutable set search_path = public as $$
  select case
    when p >= 1000 then 7 when p >= 600 then 6 when p >= 300 then 5
    when p >= 150  then 4 when p >= 60  then 3 when p >= 20  then 2
    else 1 end
$$;

-- Tiere steigen nur auf, nie ab
create or replace function public.profiles_stage()
returns trigger language plpgsql set search_path = public as $$
begin
  new.animal_stage := greatest(old.animal_stage, public.stage_for_points(new.karma_points));
  return new;
end $$;

create trigger profiles_stage
  before update of karma_points on public.profiles
  for each row execute function public.profiles_stage();

create or replace function public.points_for_minutes(m int)
returns int language sql immutable set search_path = public as $$ select 10 * ceil(m / 15.0)::int $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;

-- Teilnehmende einer Anfrage: anfragende Person plus angenommene Helfende
create or replace function public.is_participant(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.help_requests r
                  where r.id = p_request_id and r.requester_id = (select auth.uid()))
      or exists (select 1 from public.request_helpers h
                  where h.request_id = p_request_id and h.helper_id = (select auth.uid())
                    and h.status = 'accepted')
$$;

-- Chat offen für Teilnehmende, solange die Anfrage nicht abgebrochen ist
create or replace function public.can_chat(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_participant(p_request_id)
     and exists (select 1 from public.help_requests r
                  where r.id = p_request_id and r.status <> 'cancelled')
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                  where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function public.require_profile()
returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if me.first_name is null or me.accepted_terms_at is null then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return me;
end $$;

-- Punkte gutschreiben und Aura einschalten
create or replace function public.award_points(p_user uuid, p_points int)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set karma_points = karma_points + p_points,
         last_helped_at = now(),
         aura_active = true
   where id = p_user
$$;

-- ---------------------------------------------------------------------
-- 4  RPCs
-- ---------------------------------------------------------------------

-- Nutzungsbedingungen bestätigen (Onboarding)
create or replace function public.accept_terms()
returns void language sql security definer set search_path = public as $$
  update public.profiles set accepted_terms_at = coalesce(accepted_terms_at, now())
   where id = (select auth.uid())
$$;

-- Anfrage erstellen
create or replace function public.create_request(
  p_category text, p_title text, p_description text, p_estimated_minutes int,
  p_timing text, p_scheduled_at timestamptz, p_recurrence text, p_mode text,
  p_lat float8, p_lng float8, p_address_note text,
  p_helpers_needed int, p_auto_accept boolean, p_gender_pref text,
  p_min_verification int default 1, p_relieves_staff boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare me public.profiles; new_id uuid;
begin
  me := public.require_profile();
  if p_mode = 'in_person' and (p_lat is null or p_lng is null) then
    raise exception 'location_required';
  end if;
  if p_timing = 'date' and p_scheduled_at < now() - interval '1 hour' then
    raise exception 'date_in_past';
  end if;
  if (select count(*) from public.help_requests
       where requester_id = me.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.help_requests (
    requester_id, category, title, description, estimated_minutes, timing,
    scheduled_at, recurrence, mode, location, address_note, helpers_needed,
    auto_accept, gender_pref, min_verification, is_org_request, relieves_staff)
  values (
    me.id, p_category, trim(p_title), nullif(trim(p_description), ''), p_estimated_minutes, p_timing,
    case when p_timing = 'date' then p_scheduled_at end,
    coalesce(p_recurrence, 'once'), p_mode,
    case when p_lat is not null and p_lng is not null
         then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::text end,
    nullif(trim(p_address_note), ''),
    coalesce(p_helpers_needed, 1),
    coalesce(p_auto_accept, false) and coalesce(p_helpers_needed, 1) > 1,
    coalesce(p_gender_pref, 'any'), coalesce(p_min_verification, 1),
    me.account_type = 'organization' and me.is_verified_org,
    coalesce(p_relieves_staff, false) and me.account_type = 'organization' and me.is_verified_org)
  returning id into new_id;
  return new_id;
end $$;

-- Swipe-Feed: offene Anfragen im Umkreis plus Fern-Hilfen.
-- Keine exakten Koordinaten, Entfernung auf 50 m gerundet.
create or replace function public.nearby_requests(
  p_lat float8, p_lng float8, p_radius_m int default 5000)
returns table (
  id uuid, category text, title text, description text, estimated_minutes int,
  timing text, scheduled_at timestamptz, recurrence text, mode text,
  helpers_needed int, helpers_accepted int, gender_pref text, is_org_request boolean,
  distance_m int, created_at timestamptz,
  requester_id uuid, requester_name text, requester_avatar text,
  requester_stage int, requester_aura boolean, requester_org text)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select p.id, p.gender, p.verification_level,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::text as pos,
           least(greatest(coalesce(p_radius_m, 5000), 500), 20000) as radius
      from public.profiles p where p.id = (select auth.uid())
  ),
  base as (
    select r.*,
           (select count(*) from public.request_helpers h
             where h.request_id = r.id and h.status = 'accepted')::int as accepted_cnt
      from public.help_requests r, me
     where r.status = 'open'
       and r.helper_done_at is null
       and r.requester_id <> me.id
       and (r.gender_pref = 'any' or r.gender_pref = me.gender)
       and r.min_verification <= me.verification_level
       and (r.mode = 'remote' or st_dwithin(r.location, me.pos, me.radius))
       and case r.timing
             when 'now'   then r.created_at > now() - interval '12 hours'
             when 'today' then r.created_at > now() - interval '24 hours'
             else r.scheduled_at > now() - interval '2 hours'
           end
       and not exists (select 1 from public.request_helpers h
                        where h.request_id = r.id and h.helper_id = me.id)
       and not exists (select 1 from public.dismissals d
                        where d.request_id = r.id and d.user_id = me.id)
       and not public.is_blocked_between(me.id, r.requester_id)
  )
  select b.id, b.category, b.title, b.description, b.estimated_minutes,
         b.timing, b.scheduled_at, b.recurrence, b.mode,
         b.helpers_needed, b.accepted_cnt, b.gender_pref, b.is_org_request,
         case when b.mode = 'remote' then null
              else (round(st_distance(b.location, me.pos) / 50.0) * 50)::int end,
         b.created_at,
         p.id, p.first_name || coalesce(' ' || p.last_initial || '.', ''),
         p.avatar_url, p.animal_stage, p.aura_active,
         case when p.is_verified_org then p.organization_name end
    from base b
    join me on true
    join public.profiles p on p.id = b.requester_id
   where b.accepted_cnt < b.helpers_needed
   order by (b.timing = 'now') desc,
            case when b.mode = 'remote' then 999999 else st_distance(b.location, me.pos) end,
            b.created_at desc
   limit 50
$$;

-- Wischen: rechts = Hilfe anbieten, links = ausblenden
create or replace function public.swipe(p_request_id uuid, p_direction text)
returns text language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.help_requests; accepted_cnt int; new_status text;
begin
  me := public.require_profile();
  if p_direction = 'left' then
    insert into public.dismissals (request_id, user_id) values (p_request_id, me.id)
      on conflict do nothing;
    return 'dismissed';
  elsif p_direction <> 'right' then
    raise exception 'invalid_direction';
  end if;

  select * into r from public.help_requests where id = p_request_id for update;
  if r.id is null or r.status <> 'open' or r.helper_done_at is not null then
    raise exception 'request_not_open';
  end if;
  if r.requester_id = me.id then raise exception 'own_request'; end if;
  if r.gender_pref <> 'any' and r.gender_pref is distinct from me.gender then
    raise exception 'not_eligible';
  end if;
  if r.min_verification > me.verification_level then raise exception 'not_eligible'; end if;
  if public.is_blocked_between(me.id, r.requester_id) then raise exception 'not_eligible'; end if;

  select count(*) into accepted_cnt from public.request_helpers
   where request_id = r.id and status = 'accepted';
  if accepted_cnt >= r.helpers_needed then raise exception 'request_full'; end if;

  new_status := case when r.auto_accept then 'accepted' else 'offered' end;
  insert into public.request_helpers (request_id, helper_id, status)
  values (r.id, me.id, new_status)
  on conflict (request_id, helper_id) do update
     set status = excluded.status, updated_at = now()
   where public.request_helpers.status = 'withdrawn';
  return new_status;
end $$;

-- Anfragende Person nimmt ein Angebot an
create or replace function public.accept_helper(p_request_id uuid, p_helper_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.help_requests; accepted_cnt int;
begin
  select * into r from public.help_requests
   where id = p_request_id and requester_id = (select auth.uid()) for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;
  select count(*) into accepted_cnt from public.request_helpers
   where request_id = r.id and status = 'accepted';
  if accepted_cnt >= r.helpers_needed then raise exception 'request_full'; end if;
  update public.request_helpers set status = 'accepted', updated_at = now()
   where request_id = r.id and helper_id = p_helper_id and status = 'offered';
  if not found then raise exception 'no_offer'; end if;
end $$;

create or replace function public.decline_helper(p_request_id uuid, p_helper_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.help_requests
                  where id = p_request_id and requester_id = (select auth.uid())
                    and status = 'open') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.request_helpers set status = 'declined', updated_at = now()
   where request_id = p_request_id and helper_id = p_helper_id
     and status in ('offered','accepted');
end $$;

-- Helfer zieht sein Angebot zurück (vor Abschluss)
create or replace function public.withdraw_help(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.request_helpers h set status = 'withdrawn', updated_at = now()
    from public.help_requests r
   where h.request_id = p_request_id and h.helper_id = (select auth.uid())
     and r.id = h.request_id and r.status = 'open'
     and h.status in ('offered','accepted');
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.help_requests set status = 'cancelled'
   where id = p_request_id and requester_id = (select auth.uid()) and status = 'open';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Helfer tippt „erledigt“. Startet die 24-Stunden-Frist.
create or replace function public.helper_mark_done(p_request_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.request_helpers h
     set helper_note = coalesce(nullif(trim(p_note), ''), h.helper_note), updated_at = now()
    from public.help_requests r
   where h.request_id = p_request_id and h.helper_id = (select auth.uid())
     and h.status = 'accepted' and r.id = h.request_id and r.status = 'open';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.help_requests set helper_done_at = coalesce(helper_done_at, now())
   where id = p_request_id;
end $$;

-- Gemeinsamer Abschluss (manuell oder automatisch)
create or replace function public.finalize_request(
  p_request_id uuid, p_minutes int, p_feedback jsonb, p_auto boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.help_requests; h record; f jsonb; pts int; v_attended boolean;
  v_stars int; awarded int := 0;
begin
  select * into r from public.help_requests where id = p_request_id for update;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;
  pts := public.points_for_minutes(p_minutes);

  for h in select * from public.request_helpers
            where request_id = r.id and status = 'accepted' loop
    f := null;
    select e.v into f from jsonb_array_elements(coalesce(p_feedback, '[]'::jsonb)) as e(v)
     where (e.v->>'helper_id')::uuid = h.helper_id limit 1;
    v_attended := coalesce((f->>'attended')::boolean, true);

    update public.request_helpers
       set attended = v_attended, points_awarded = case when v_attended then pts else 0 end,
           updated_at = now()
     where request_id = r.id and helper_id = h.helper_id;

    if v_attended then
      perform public.award_points(h.helper_id, pts);
      awarded := awarded + 1;
      v_stars := (f->>'stars')::int;
      if v_stars is not null then
        insert into public.ratings (request_id, rater_id, helper_id, stars, comment)
        values (r.id, r.requester_id, h.helper_id, v_stars,
                nullif(trim(f->>'comment'), ''));
        if v_stars < 3 then
          insert into public.reports (reporter_id, target_user_id, request_id, reason, details)
          values (r.requester_id, h.helper_id, r.id, 'low_rating',
                  'Bewertung ' || v_stars || ' Sterne: ' || coalesce(f->>'comment', ''));
        end if;
      end if;
    end if;
  end loop;

  update public.help_requests
     set status = 'completed', final_minutes = p_minutes, completed_at = now(),
         auto_completed = p_auto
   where id = r.id;
  return awarded;
end $$;

-- Anfragende Person bestätigt: Zeit, Sterne, Text, Anwesenheit
-- p_feedback: [{"helper_id": "...", "attended": true, "stars": 5, "comment": "..."}]
create or replace function public.complete_request(
  p_request_id uuid, p_minutes int, p_feedback jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.help_requests
                  where id = p_request_id and requester_id = (select auth.uid())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.request_helpers
                  where request_id = p_request_id and status = 'accepted') then
    raise exception 'no_helpers';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    raise exception 'invalid_minutes';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_feedback, '[]'::jsonb)) as e(v)
              where (e.v->>'stars') is not null and (e.v->>'stars')::int not between 1 and 5) then
    raise exception 'invalid_stars';
  end if;
  return public.finalize_request(p_request_id, p_minutes, p_feedback, false);
end $$;

-- Melden (DSA Art. 16)
create or replace function public.report(
  p_target_user uuid, p_request_id uuid, p_reason text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_reason = 'low_rating' then raise exception 'invalid_reason'; end if;
  if (select count(*) from public.reports
       where reporter_id = (select auth.uid()) and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.reports (reporter_id, target_user_id, request_id, reason, details)
  values ((select auth.uid()), p_target_user, p_request_id, p_reason, nullif(trim(p_details), ''));
end $$;

-- Meine Hilfen (als Helfer)
create or replace function public.my_helps()
returns table (
  request_id uuid, title text, category text, status text, my_status text,
  estimated_minutes int, timing text, scheduled_at timestamptz, mode text,
  helper_done_at timestamptz, points_awarded int, created_at timestamptz,
  requester_name text, requester_avatar text)
language sql stable security definer set search_path = public as $$
  select r.id, r.title, r.category, r.status, h.status, r.estimated_minutes, r.timing,
         r.scheduled_at, r.mode, r.helper_done_at, h.points_awarded, h.created_at,
         p.first_name || coalesce(' ' || p.last_initial || '.', ''), p.avatar_url
    from public.request_helpers h
    join public.help_requests r on r.id = h.request_id
    join public.profiles p on p.id = r.requester_id
   where h.helper_id = (select auth.uid())
   order by h.created_at desc
   limit 100
$$;

-- Blockieren / Entblocken
create or replace function public.set_block(p_user uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_blocked then
    insert into public.blocks (blocker_id, blocked_id) values ((select auth.uid()), p_user)
      on conflict do nothing;
  else
    delete from public.blocks where blocker_id = (select auth.uid()) and blocked_id = p_user;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5  Automatik
-- ---------------------------------------------------------------------

-- 24 h nach „erledigt“ ohne Meldung: geschätzte Zeit zählt, keine Sterne.
create or replace function public.auto_complete_requests()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, estimated_minutes from public.help_requests hr
            where hr.status = 'open' and hr.helper_done_at < now() - interval '24 hours'
              and not exists (select 1 from public.reports rep
                               where rep.request_id = hr.id and rep.status = 'open')
              and exists (select 1 from public.request_helpers h
                           where h.request_id = hr.id and h.status = 'accepted') loop
    perform public.finalize_request(r.id, r.estimated_minutes, '[]'::jsonb, true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Aura verblasst nach 14 Tagen ohne Hilfe. Das Tier bleibt.
create or replace function public.refresh_auras()
returns void language sql security definer set search_path = public as $$
  update public.profiles set aura_active = false
   where aura_active and (last_helped_at is null or last_helped_at < now() - interval '14 days')
$$;

select cron.schedule('karma-auto-complete', '7 * * * *', $$select public.auto_complete_requests()$$);
select cron.schedule('karma-aura', '15 3 * * *', $$select public.refresh_auras()$$);

-- ---------------------------------------------------------------------
-- 6  Views für öffentliche Daten
-- ---------------------------------------------------------------------
create view public.public_profiles with (security_invoker = off) as
select p.id,
       p.first_name || coalesce(' ' || p.last_initial || '.', '') as display_name,
       p.first_name, p.avatar_url, p.gender, p.age_group, p.languages, p.about,
       p.skills, p.availability, p.district, p.animal_stage, p.aura_active,
       p.karma_points, p.verification_level, p.account_type,
       case when p.is_verified_org then p.organization_name end as organization_name,
       p.is_verified_org, p.created_at,
       coalesce(s.helps, 0)   as helps_count,
       coalesce(s.minutes, 0) as minutes_total,
       coalesce(s.people, 0)  as people_helped,
       rt.avg_stars, coalesce(rt.cnt, 0) as ratings_count
  from public.profiles p
  left join lateral (
    select count(*)::int as helps, sum(r.final_minutes)::int as minutes,
           count(distinct r.requester_id)::int as people
      from public.request_helpers h
      join public.help_requests r on r.id = h.request_id
     where h.helper_id = p.id and h.attended and r.status = 'completed') s on true
  left join lateral (
    select round(avg(stars), 1) as avg_stars, count(*)::int as cnt
      from public.ratings where helper_id = p.id) rt on true
 where p.first_name is not null;

create view public.public_ratings with (security_invoker = off) as
select ra.id, ra.helper_id, ra.stars, ra.comment, ra.created_at,
       p.first_name || coalesce(' ' || p.last_initial || '.', '') as rater_name,
       p.animal_stage as rater_stage
  from public.ratings ra
  join public.profiles p on p.id = ra.rater_id;

-- Anfrage-Detail. Ort und Adresse nur für Teilnehmende.
create or replace function public.get_request(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  me uuid := (select auth.uid()); r public.help_requests; role text;
  my_status text; result jsonb;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null then return null; end if;
  select status into my_status from public.request_helpers
   where request_id = r.id and helper_id = me;
  role := case when r.requester_id = me then 'requester'
               when my_status is not null then 'helper' else 'viewer' end;
  if role = 'viewer' and (r.status <> 'open' or public.is_blocked_between(me, r.requester_id)) then
    return null;
  end if;

  result := jsonb_build_object(
    'id', r.id, 'category', r.category, 'title', r.title, 'description', r.description,
    'estimated_minutes', r.estimated_minutes, 'timing', r.timing,
    'scheduled_at', r.scheduled_at, 'recurrence', r.recurrence, 'mode', r.mode,
    'helpers_needed', r.helpers_needed, 'auto_accept', r.auto_accept,
    'gender_pref', r.gender_pref, 'status', r.status, 'helper_done_at', r.helper_done_at,
    'final_minutes', r.final_minutes, 'completed_at', r.completed_at,
    'auto_completed', r.auto_completed, 'created_at', r.created_at,
    'is_org_request', r.is_org_request,
    'my_role', role, 'my_status', my_status,
    'requester', (select to_jsonb(pp) from public.public_profiles pp where pp.id = r.requester_id));

  if role = 'requester' or my_status = 'accepted' then
    result := result || jsonb_build_object(
      'address_note', r.address_note,
      'lat', case when r.location is not null then st_y(r.location) end,
      'lng', case when r.location is not null then st_x(r.location) end);
  end if;

  result := result || jsonb_build_object('helpers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'helper_id', h.helper_id, 'status', h.status, 'attended', h.attended,
             'points_awarded', h.points_awarded, 'profile', to_jsonb(pp))
             order by h.created_at)
      from public.request_helpers h
      join public.public_profiles pp on pp.id = h.helper_id
     where h.request_id = r.id
       and (role = 'requester' or h.status = 'accepted' or h.helper_id = me)
       and h.status in ('offered','accepted')), '[]'::jsonb));
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 7  Row Level Security und Grants
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.help_requests   enable row level security;
alter table public.request_helpers enable row level security;
alter table public.dismissals      enable row level security;
alter table public.messages        enable row level security;
alter table public.ratings         enable row level security;
alter table public.reports         enable row level security;
alter table public.blocks          enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

-- profiles: eigene Zeile lesen; nur freiwillige Felder schreiben
grant select on public.profiles to authenticated;
grant update (first_name, last_initial, avatar_url, gender, age_group, languages,
              about, skills, availability, district)
  on public.profiles to authenticated;
create policy profiles_own_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- help_requests: direkt nur die eigenen; andere über RPCs
grant select on public.help_requests to authenticated;
create policy help_requests_own on public.help_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select public.is_admin()));

-- request_helpers: eigene Angebote und Angebote auf eigene Anfragen (ohne Notiz)
grant select (request_id, helper_id, status, attended, points_awarded, created_at, updated_at)
  on public.request_helpers to authenticated;
create policy request_helpers_read on public.request_helpers for select to authenticated
  using (helper_id = (select auth.uid())
         or exists (select 1 from public.help_requests r
                     where r.id = request_id and r.requester_id = (select auth.uid())));

-- messages: nur Teilnehmende, nur solange nicht abgebrochen
grant select, insert (request_id, body) on public.messages to authenticated;
alter table public.messages alter column sender_id set default auth.uid();
create policy messages_read on public.messages for select to authenticated
  using ((select public.is_participant(request_id)));
create policy messages_write on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select public.can_chat(request_id)));

-- ratings, reports: Lesen eigener Meldungen; Admin sieht alles
grant select on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
grant update (status) on public.reports to authenticated;
create policy reports_admin_update on public.reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.blocks to authenticated;
create policy blocks_own on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- Views: öffentlich für angemeldete Nutzer
grant select on public.public_profiles, public.public_ratings to authenticated;

-- RPCs
grant execute on function
  public.accept_terms(),
  public.create_request(text,text,text,int,text,timestamptz,text,text,float8,float8,text,int,boolean,text,int,boolean),
  public.nearby_requests(float8,float8,int),
  public.swipe(uuid,text),
  public.accept_helper(uuid,uuid),
  public.decline_helper(uuid,uuid),
  public.withdraw_help(uuid),
  public.cancel_request(uuid),
  public.helper_mark_done(uuid,text),
  public.complete_request(uuid,int,jsonb),
  public.report(uuid,uuid,text,text),
  public.get_request(uuid),
  public.my_helps(),
  public.set_block(uuid,boolean),
  public.is_participant(uuid),
  public.can_chat(uuid),
  public.is_admin(),
  public.stage_for_points(int),
  public.points_for_minutes(int)
to authenticated;

-- ---------------------------------------------------------------------
-- 8  Realtime und Storage
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages, public.request_helpers;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy karma_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy karma_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy karma_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
