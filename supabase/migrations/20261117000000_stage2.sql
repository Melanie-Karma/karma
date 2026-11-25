-- =====================================================================
-- Karma Stufe 2 (17.11.2026)
--  * Hilfe anbieten (kind = 'offer')
--  * Neue Kategorien: Verleihen (halbe Punkte), Mitfahren, Gemeinschaftsaktion
--  * Vereine: Kategorie für Herz-Abzeichen
--  * Aufenthaltsort statt Wohnort, Push-Benachrichtigungen mit Tageslimit
-- =====================================================================

create extension if not exists pg_net;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1  Tabellen erweitern
-- ---------------------------------------------------------------------
alter table public.help_requests
  add column kind text not null default 'request' check (kind in ('request','offer')),
  add column lend_until date,
  add column creator_points int;

alter table public.help_requests drop constraint help_requests_category_check;
alter table public.help_requests add constraint help_requests_category_check check (category in
  ('shopping','carrying','tech','home','company','escort','pets','tools','other',
   'lend','ride','community'));

alter table public.profiles
  add column org_category     text check (org_category in ('animal_welfare','social','other')),
  add column push_enabled     boolean not null default true,
  add column push_per_day     int not null default 3 check (push_per_day between 0 and 20),
  add column notify_radius_m  int not null default 10000 check (notify_radius_m between 500 and 20000),
  add column last_location    extensions.geography(Point, 4326),
  add column last_location_at timestamptz;

create index profiles_last_location_idx on public.profiles using gist (last_location);

grant update (push_enabled, push_per_day) on public.profiles to authenticated;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.push_log (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.help_requests (id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index push_log_user_time_idx on public.push_log (user_id, sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_log           enable row level security;
revoke all on public.push_subscriptions, public.push_log from anon, authenticated;

-- Schlüssel für Push. Nur für den Server lesbar (Schema private).
create table private.settings (
  key   text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2  Punkte: Verleihen zählt halb
-- ---------------------------------------------------------------------
create or replace function public.points_for(p_category text, p_minutes int)
returns int language sql immutable set search_path = public as $$
  select case when p_category = 'lend'
              then public.points_for_minutes(p_minutes) / 2
              else public.points_for_minutes(p_minutes) end
$$;

-- ---------------------------------------------------------------------
-- 3  Anfrage oder Angebot erstellen
-- ---------------------------------------------------------------------
drop function public.create_request(text,text,text,int,text,timestamptz,text,text,float8,float8,text,int,boolean,text,int,boolean);

create or replace function public.create_request(
  p_category text, p_title text, p_description text, p_estimated_minutes int,
  p_timing text, p_scheduled_at timestamptz, p_recurrence text, p_mode text,
  p_lat float8, p_lng float8, p_address_note text,
  p_helpers_needed int, p_auto_accept boolean, p_gender_pref text,
  p_min_verification int default 1, p_relieves_staff boolean default false,
  p_kind text default 'request', p_lend_until date default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare me public.profiles; new_id uuid; v_org boolean;
begin
  me := public.require_profile();
  if coalesce(p_kind, 'request') not in ('request','offer') then raise exception 'invalid_kind'; end if;
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
  v_org := me.account_type = 'organization' and me.is_verified_org;

  insert into public.help_requests (
    requester_id, kind, category, title, description, estimated_minutes, timing,
    scheduled_at, recurrence, mode, location, address_note, helpers_needed,
    auto_accept, gender_pref, min_verification, is_org_request, relieves_staff, lend_until)
  values (
    me.id, coalesce(p_kind, 'request'), p_category, trim(p_title), nullif(trim(p_description), ''),
    p_estimated_minutes, p_timing,
    case when p_timing = 'date' then p_scheduled_at end,
    coalesce(p_recurrence, 'once'), p_mode,
    case when p_lat is not null and p_lng is not null
         then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end,
    nullif(trim(p_address_note), ''),
    coalesce(p_helpers_needed, 1),
    coalesce(p_auto_accept, false) and coalesce(p_helpers_needed, 1) > 1,
    coalesce(p_gender_pref, 'any'), coalesce(p_min_verification, 1),
    v_org and coalesce(p_kind, 'request') = 'request',
    coalesce(p_relieves_staff, false) and v_org,
    case when p_category = 'lend' then p_lend_until end)
  returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------
-- 4  Feed mit Angeboten und Vereins-Kategorie
-- ---------------------------------------------------------------------
drop function public.nearby_requests(float8,float8,int);

create or replace function public.nearby_requests(
  p_lat float8, p_lng float8, p_radius_m int default 5000)
returns table (
  id uuid, kind text, category text, title text, description text, estimated_minutes int,
  timing text, scheduled_at timestamptz, recurrence text, mode text,
  helpers_needed int, helpers_accepted int, gender_pref text, is_org_request boolean,
  distance_m int, created_at timestamptz, lend_until date,
  requester_id uuid, requester_name text, requester_avatar text,
  requester_stage int, requester_aura boolean, requester_org text, requester_org_category text)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select p.id, p.gender, p.verification_level,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as pos,
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
  select b.id, b.kind, b.category, b.title, b.description, b.estimated_minutes,
         b.timing, b.scheduled_at, b.recurrence, b.mode,
         b.helpers_needed, b.accepted_cnt, b.gender_pref, b.is_org_request,
         case when b.mode = 'remote' then null
              else (round(st_distance(b.location, me.pos) / 50.0) * 50)::int end,
         b.created_at, b.lend_until,
         p.id, p.first_name || coalesce(' ' || p.last_initial || '.', ''),
         p.avatar_url, p.animal_stage, p.aura_active,
         case when p.is_verified_org then p.organization_name end,
         case when p.is_verified_org then p.org_category end
    from base b
    join me on true
    join public.profiles p on p.id = b.requester_id
   where b.accepted_cnt < b.helpers_needed
   order by b.is_org_request desc, (b.timing = 'now') desc,
            case when b.mode = 'remote' then 999999 else st_distance(b.location, me.pos) end,
            b.created_at desc
   limit 50
$$;

-- ---------------------------------------------------------------------
-- 5  Zusagen: auch aus der Push-Nachricht (Server, ohne Sitzung)
-- ---------------------------------------------------------------------
create or replace function public.swipe_for(p_user uuid, p_request_id uuid, p_direction text)
returns text language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.help_requests; accepted_cnt int; new_status text;
begin
  select * into me from public.profiles where id = p_user;
  if me.id is null or me.first_name is null or me.accepted_terms_at is null then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
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
   where public.request_helpers.status in ('withdrawn');
  return new_status;
end $$;

create or replace function public.swipe(p_request_id uuid, p_direction text)
returns text language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public.require_profile();
  return public.swipe_for(me.id, p_request_id, p_direction);
end $$;

-- ---------------------------------------------------------------------
-- 6  Erledigt melden und Abschluss, auch für Angebote
--    Anfrage: Helfende melden erledigt, anfragende Person bestätigt.
--    Angebot: Anbietende Person meldet erledigt, wer das Angebot
--             angenommen hat, bestätigt. Punkte bekommt die anbietende Person.
-- ---------------------------------------------------------------------
create or replace function public.helper_mark_done(p_request_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.help_requests;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null or r.status <> 'open' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.kind = 'offer' then
    if r.requester_id <> (select auth.uid()) then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not exists (select 1 from public.request_helpers where request_id = r.id and status = 'accepted') then
      raise exception 'no_helpers';
    end if;
  else
    update public.request_helpers h
       set helper_note = coalesce(nullif(trim(p_note), ''), h.helper_note), updated_at = now()
     where h.request_id = p_request_id and h.helper_id = (select auth.uid()) and h.status = 'accepted';
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  update public.help_requests set helper_done_at = coalesce(helper_done_at, now())
   where id = p_request_id;
end $$;

drop function public.finalize_request(uuid,int,jsonb,boolean);

create or replace function public.finalize_request(
  p_request_id uuid, p_minutes int, p_feedback jsonb, p_auto boolean, p_rater uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.help_requests; h record; f jsonb; pts int; v_attended boolean;
  v_stars int; awarded int := 0;
begin
  select * into r from public.help_requests where id = p_request_id for update;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;
  pts := public.points_for(r.category, p_minutes);

  if r.kind = 'offer' then
    -- Punkte einmal an die anbietende Person
    perform public.award_points(r.requester_id, pts);
    update public.request_helpers set attended = true, updated_at = now()
     where request_id = r.id and status = 'accepted';
    f := coalesce(p_feedback, '[]'::jsonb)->0;
    v_stars := (f->>'stars')::int;
    if v_stars is not null and p_rater is not null then
      insert into public.ratings (request_id, rater_id, helper_id, stars, comment)
      values (r.id, p_rater, r.requester_id, v_stars, nullif(trim(f->>'comment'), ''));
      if v_stars < 3 then
        insert into public.reports (reporter_id, target_user_id, request_id, reason, details)
        values (p_rater, r.requester_id, r.id, 'low_rating',
                'Bewertung ' || v_stars || ' Sterne: ' || coalesce(f->>'comment', ''));
      end if;
    end if;
    update public.help_requests
       set status = 'completed', final_minutes = p_minutes, completed_at = now(),
           auto_completed = p_auto, creator_points = pts
     where id = r.id;
    return 1;
  end if;

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

create or replace function public.complete_request(
  p_request_id uuid, p_minutes int, p_feedback jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.help_requests; me uuid := (select auth.uid());
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.kind = 'offer' then
    -- Bestätigen darf, wer das Angebot angenommen hat
    if not exists (select 1 from public.request_helpers
                    where request_id = r.id and helper_id = me and status = 'accepted') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    if r.requester_id <> me then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not exists (select 1 from public.request_helpers
                    where request_id = p_request_id and status = 'accepted') then
      raise exception 'no_helpers';
    end if;
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    raise exception 'invalid_minutes';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_feedback, '[]'::jsonb)) as e(v)
              where (e.v->>'stars') is not null and (e.v->>'stars')::int not between 1 and 5) then
    raise exception 'invalid_stars';
  end if;
  return public.finalize_request(p_request_id, p_minutes, p_feedback, false, me);
end $$;

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
    perform public.finalize_request(r.id, r.estimated_minutes, '[]'::jsonb, true, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Meine Hilfen: mit Art (bei Angeboten habe ich etwas angenommen)
drop function public.my_helps();
create or replace function public.my_helps()
returns table (
  request_id uuid, kind text, title text, category text, status text, my_status text,
  estimated_minutes int, timing text, scheduled_at timestamptz, mode text,
  helper_done_at timestamptz, points_awarded int, created_at timestamptz,
  requester_name text, requester_avatar text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.title, r.category, r.status, h.status, r.estimated_minutes, r.timing,
         r.scheduled_at, r.mode, r.helper_done_at, h.points_awarded, h.created_at,
         p.first_name || coalesce(' ' || p.last_initial || '.', ''), p.avatar_url
    from public.request_helpers h
    join public.help_requests r on r.id = h.request_id
    join public.profiles p on p.id = r.requester_id
   where h.helper_id = (select auth.uid())
   order by h.created_at desc
   limit 100
$$;

-- Profilstatistik zählt auch erledigte eigene Angebote
create or replace view public.public_profiles with (security_invoker = off) as
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
       rt.avg_stars, coalesce(rt.cnt, 0) as ratings_count,
       case when p.is_verified_org then p.org_category end as org_category
  from public.profiles p
  left join lateral (
    select count(*)::int as helps, sum(x.minutes)::int as minutes,
           count(distinct x.person)::int as people
      from (
        select r.final_minutes as minutes, r.requester_id as person
          from public.request_helpers h
          join public.help_requests r on r.id = h.request_id
         where h.helper_id = p.id and h.attended and r.status = 'completed' and r.kind = 'request'
        union all
        select r.final_minutes, h.helper_id
          from public.help_requests r
          join public.request_helpers h on h.request_id = r.id and h.status = 'accepted'
         where r.requester_id = p.id and r.kind = 'offer' and r.status = 'completed'
      ) x) s on true
  left join lateral (
    select round(avg(stars), 1) as avg_stars, count(*)::int as cnt
      from public.ratings where helper_id = p.id) rt on true
 where p.first_name is not null;

-- Detail: Art, Leihdatum, Punkte für Angebote
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
    'id', r.id, 'kind', r.kind, 'category', r.category, 'title', r.title, 'description', r.description,
    'estimated_minutes', r.estimated_minutes, 'timing', r.timing,
    'scheduled_at', r.scheduled_at, 'recurrence', r.recurrence, 'mode', r.mode,
    'helpers_needed', r.helpers_needed, 'auto_accept', r.auto_accept,
    'gender_pref', r.gender_pref, 'status', r.status, 'helper_done_at', r.helper_done_at,
    'final_minutes', r.final_minutes, 'completed_at', r.completed_at,
    'auto_completed', r.auto_completed, 'created_at', r.created_at,
    'is_org_request', r.is_org_request, 'lend_until', r.lend_until,
    'creator_points', r.creator_points,
    'my_role', role, 'my_status', my_status,
    'requester', (select to_jsonb(pp) from public.public_profiles pp where pp.id = r.requester_id));

  if role = 'requester' or my_status = 'accepted' then
    result := result || jsonb_build_object(
      'address_note', r.address_note,
      'lat', case when r.location is not null then st_y(r.location::geometry) end,
      'lng', case when r.location is not null then st_x(r.location::geometry) end);
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
-- 7  Aufenthaltsort und Push-Abo
-- ---------------------------------------------------------------------
create or replace function public.set_my_location(p_lat float8, p_lng float8, p_radius_m int)
returns void language sql security definer set search_path = public, extensions as $$
  update public.profiles
     set last_location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         last_location_at = now(),
         notify_radius_m = least(greatest(coalesce(p_radius_m, notify_radius_m), 500), 20000)
   where id = (select auth.uid())
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'invalid_endpoint'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  update public.profiles set push_enabled = true where id = (select auth.uid());
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = (select auth.uid())
$$;

create or replace function public.my_push_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enabled', p.push_enabled, 'per_day', p.push_per_day,
    'devices', (select count(*) from public.push_subscriptions s where s.user_id = p.id),
    'sent_today', (select count(*) from public.push_log l
                    where l.user_id = p.id
                      and l.sent_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'))
    from public.profiles p where p.id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 8  Wer bekommt eine Push-Nachricht? (nur Server)
--    Aufenthaltsort der letzten 3 Tage im eigenen Umkreis, passende
--    Bedingungen, Tageslimit, Ruhezeit 21 bis 8 Uhr.
-- ---------------------------------------------------------------------
create or replace function public.push_targets(p_request_id uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text,
               title text, body text, request_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare r public.help_requests; who text; v_hour int; v_body text;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null or r.kind <> 'request' or r.status <> 'open'
     or r.mode <> 'in_person' or r.location is null then
    return;
  end if;
  v_hour := extract(hour from now() at time zone 'Europe/Berlin');
  if v_hour >= 21 or v_hour < 8 then return; end if;

  select coalesce(case when p.is_verified_org then p.organization_name end,
                  p.first_name || coalesce(' ' || p.last_initial || '.', ''))
    into who from public.profiles p where p.id = r.requester_id;

  v_body := who || ' · '
    || case r.timing when 'now' then 'jetzt'
                     when 'today' then 'heute'
                     else to_char(r.scheduled_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' Uhr' end
    || ' · ca. ' || r.estimated_minutes || ' Min.'
    || case when r.helpers_needed > 1 then ' · ' || r.helpers_needed || ' Leute gesucht' else '' end;

  return query
  with cand as (
    select p.id,
           (round(st_distance(r.location, p.last_location) / 100.0) * 100)::int as dist
      from public.profiles p
     where p.id <> r.requester_id
       and p.push_enabled and p.push_per_day > 0
       and p.first_name is not null and p.accepted_terms_at is not null
       and p.last_location is not null
       and p.last_location_at > now() - interval '3 days'
       and st_dwithin(r.location, p.last_location, p.notify_radius_m)
       and (r.gender_pref = 'any' or r.gender_pref = p.gender)
       and r.min_verification <= p.verification_level
       and not public.is_blocked_between(p.id, r.requester_id)
       and not exists (select 1 from public.push_log l where l.user_id = p.id and l.request_id = r.id)
       and (select count(*) from public.push_log l
             where l.user_id = p.id
               and l.sent_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')
           < p.push_per_day
     order by st_distance(r.location, p.last_location)
     limit 300
  ),
  logged as (
    insert into public.push_log (user_id, request_id)
    select c.id, r.id from cand c
    on conflict do nothing
    returning push_log.user_id
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth,
         r.title,
         v_body || ' · ' || case when c.dist < 1000 then c.dist || ' m'
                                 else round(c.dist / 1000.0, 1) || ' km' end || ' entfernt',
         r.id
    from logged l
    join cand c on c.id = l.user_id
    join public.push_subscriptions s on s.user_id = l.user_id;
end $$;

create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_object_agg(key, value) from private.settings
   where key in ('vapid_public','vapid_private','vapid_subject','action_secret','trigger_secret')
$$;

create or replace function public.push_remove_endpoint(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

-- Neue Anfrage: Edge Function anstoßen
create or replace function public.notify_new_request()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_url text; v_secret text;
begin
  if new.kind <> 'request' or new.mode <> 'in_person' then return new; end if;
  select value into v_url from private.settings where key = 'push_function_url';
  select value into v_secret from private.settings where key = 'trigger_secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-karma-secret', v_secret),
      body := jsonb_build_object('request_id', new.id));
  exception when others then
    raise warning 'push trigger failed: %', sqlerrm;
  end;
  return new;
end $$;

create trigger help_requests_push
  after insert on public.help_requests
  for each row execute function public.notify_new_request();

-- ---------------------------------------------------------------------
-- 9  Grants
-- ---------------------------------------------------------------------
revoke all on function
  public.swipe_for(uuid,uuid,text),
  public.push_targets(uuid),
  public.push_config(),
  public.push_remove_endpoint(text),
  public.notify_new_request(),
  public.finalize_request(uuid,int,jsonb,boolean,uuid),
  public.points_for(text,int)
from public, anon, authenticated;

grant execute on function
  public.swipe_for(uuid,uuid,text),
  public.push_targets(uuid),
  public.push_config(),
  public.push_remove_endpoint(text)
to service_role;

revoke all on function
  public.create_request(text,text,text,int,text,timestamptz,text,text,float8,float8,text,int,boolean,text,int,boolean,text,date),
  public.nearby_requests(float8,float8,int),
  public.my_helps(),
  public.set_my_location(float8,float8,int),
  public.save_push_subscription(text,text,text),
  public.delete_push_subscription(text),
  public.my_push_status()
from public, anon;

grant execute on function
  public.create_request(text,text,text,int,text,timestamptz,text,text,float8,float8,text,int,boolean,text,int,boolean,text,date),
  public.nearby_requests(float8,float8,int),
  public.my_helps(),
  public.set_my_location(float8,float8,int),
  public.save_push_subscription(text,text,text),
  public.delete_push_subscription(text),
  public.my_push_status(),
  public.points_for(text,int)
to authenticated;

grant select on public.public_profiles to authenticated;
