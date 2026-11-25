-- Stage 6 (19.11.2026): Heimatort als Ausweich-Standort
-- Ohne Standortfreigabe (oder wenn der letzte Standort älter als 3 Tage ist)
-- gelten Push-Nachrichten und Feed für den eingegebenen Heimatort.
alter table public.profiles
  add column if not exists home_lat   float8,
  add column if not exists home_lng   float8,
  add column if not exists home_label text;

create or replace function public.set_home_location(p_lat float8, p_lng float8, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_lat is null or p_lng is null or p_lat not between 47 and 56 or p_lng not between 5 and 16 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  update public.profiles
     set home_lat = p_lat, home_lng = p_lng, home_label = left(nullif(trim(p_label), ''), 80)
   where id = (select auth.uid());
end $$;
revoke all on function public.set_home_location(float8, float8, text) from public, anon;
grant execute on function public.set_home_location(float8, float8, text) to authenticated;

-- Wirksamer Ort für Push: frischer Aufenthaltsort, sonst Heimatort
create or replace function public.effective_location(p public.profiles)
returns extensions.geography language sql stable set search_path = public, extensions as $$
  select case
    when p.last_location is not null and p.last_location_at > now() - interval '3 days' then p.last_location
    when p.home_lat is not null then st_setsrid(st_makepoint(p.home_lng, p.home_lat), 4326)::geography
  end
$$;
revoke all on function public.effective_location(public.profiles) from public, anon, authenticated;

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
  with base as (
    select p.*, public.effective_location(p) as loc
      from public.profiles p
     where p.id <> r.requester_id
       and p.push_enabled and p.push_per_day > 0
       and p.first_name is not null and p.accepted_terms_at is not null
  ),
  cand as (
    select b.id,
           (round(st_distance(r.location, b.loc) / 100.0) * 100)::int as dist
      from base b
     where b.loc is not null
       and st_dwithin(r.location, b.loc, b.notify_radius_m)
       and (r.gender_pref = 'any' or r.gender_pref = b.gender)
       and r.min_verification <= b.verification_level
       and not public.is_blocked_between(b.id, r.requester_id)
       and not exists (select 1 from public.push_log l where l.user_id = b.id and l.request_id = r.id)
       and (select count(*) from public.push_log l
             where l.user_id = b.id
               and l.sent_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')
           < b.push_per_day
     order by st_distance(r.location, b.loc)
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
