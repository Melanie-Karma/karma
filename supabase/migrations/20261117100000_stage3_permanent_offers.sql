-- =====================================================================
-- Karma Stufe 3 (17.11.2026): dauerhafte Angebote
--  * timing = 'always' nur für Angebote, bleibt offen, mehrfach nutzbar
--  * jede Nutzung wird einzeln abgeschlossen (request_helpers.status = 'completed')
--  * Minuten pro Nutzung in request_helpers.minutes für die Statistik
-- =====================================================================

alter table public.help_requests drop constraint help_requests_timing_check;
alter table public.help_requests add constraint help_requests_timing_check
  check (timing in ('now','today','date','always'));
alter table public.help_requests add constraint help_requests_always_only_offers
  check (timing <> 'always' or kind = 'offer');

alter table public.request_helpers drop constraint request_helpers_status_check;
alter table public.request_helpers add constraint request_helpers_status_check
  check (status in ('offered','accepted','declined','withdrawn','completed'));
alter table public.request_helpers add column minutes int, add column uses int not null default 0;

-- Bewertungen: bei dauerhaften Angeboten bewerten mehrere Personen dieselbe anbietende Person
alter table public.ratings drop constraint ratings_request_id_helper_id_key;
alter table public.ratings add constraint ratings_request_rater_helper_key unique (request_id, rater_id, helper_id);

-- Anfrage oder Angebot erstellen: 'always' nur für Angebote
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
  if p_timing = 'always' and coalesce(p_kind, 'request') <> 'offer' then raise exception 'invalid_timing'; end if;
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
    case when p_timing = 'always' then 'once' else coalesce(p_recurrence, 'once') end, p_mode,
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

-- Feed: dauerhafte Angebote laufen nicht ab
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
             when 'now'    then r.created_at > now() - interval '12 hours'
             when 'today'  then r.created_at > now() - interval '24 hours'
             when 'always' then true
             else r.scheduled_at > now() - interval '2 hours'
           end
       and not exists (select 1 from public.request_helpers h
                        where h.request_id = r.id and h.helper_id = me.id
                          and h.status <> 'completed')
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
   order by b.is_org_request desc, (b.timing = 'now') desc, (b.timing = 'always') asc,
            case when b.mode = 'remote' then 999999 else st_distance(b.location, me.pos) end,
            b.created_at desc
   limit 50
$$;

-- Zusagen: nach einer erledigten Nutzung darf man ein dauerhaftes Angebot erneut nutzen
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
   where public.request_helpers.status in ('withdrawn','completed');
  return new_status;
end $$;

-- Abschluss: Minuten je Nutzung, dauerhafte Angebote bleiben offen
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
    perform public.award_points(r.requester_id, pts);
    f := coalesce(p_feedback, '[]'::jsonb)->0;
    v_stars := (f->>'stars')::int;
    if v_stars is not null and p_rater is not null then
      insert into public.ratings (request_id, rater_id, helper_id, stars, comment)
      values (r.id, p_rater, r.requester_id, v_stars, nullif(trim(f->>'comment'), ''))
      on conflict (request_id, rater_id, helper_id)
      do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
      if v_stars < 3 then
        insert into public.reports (reporter_id, target_user_id, request_id, reason, details)
        values (p_rater, r.requester_id, r.id, 'low_rating',
                'Bewertung ' || v_stars || ' Sterne: ' || coalesce(f->>'comment', ''));
      end if;
    end if;

    if r.timing = 'always' then
      -- Nutzung abschließen, Angebot bleibt offen
      update public.request_helpers
         set status = 'completed', attended = true, minutes = coalesce(minutes, 0) + p_minutes,
             uses = uses + 1, updated_at = now()
       where request_id = r.id and status = 'accepted';
      update public.help_requests
         set helper_done_at = null, creator_points = coalesce(creator_points, 0) + pts
       where id = r.id;
    else
      update public.request_helpers set attended = true, minutes = p_minutes, uses = 1, updated_at = now()
       where request_id = r.id and status = 'accepted';
      update public.help_requests
         set status = 'completed', final_minutes = p_minutes, completed_at = now(),
             auto_completed = p_auto, creator_points = pts
       where id = r.id;
    end if;
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
           minutes = case when v_attended then p_minutes end,
           uses = case when v_attended then 1 else 0 end, updated_at = now()
     where request_id = r.id and helper_id = h.helper_id;

    if v_attended then
      perform public.award_points(h.helper_id, pts);
      awarded := awarded + 1;
      v_stars := (f->>'stars')::int;
      if v_stars is not null then
        insert into public.ratings (request_id, rater_id, helper_id, stars, comment)
        values (r.id, r.requester_id, h.helper_id, v_stars, nullif(trim(f->>'comment'), ''));
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

-- Statistik über die Minuten je Nutzung
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
    select sum(x.uses)::int as helps, sum(x.minutes)::int as minutes,
           count(distinct x.person)::int as people
      from (
        select coalesce(h.minutes, r.final_minutes) as minutes, r.requester_id as person,
               greatest(h.uses, 1) as uses
          from public.request_helpers h
          join public.help_requests r on r.id = h.request_id
         where h.helper_id = p.id and h.attended and r.kind = 'request' and r.status = 'completed'
        union all
        select coalesce(h.minutes, r.final_minutes), h.helper_id, greatest(h.uses, 1)
          from public.help_requests r
          join public.request_helpers h on h.request_id = r.id
         where r.requester_id = p.id and r.kind = 'offer' and h.attended
           and (h.status = 'completed' or (h.status = 'accepted' and r.status = 'completed'))
      ) x) s on true
  left join lateral (
    select round(avg(stars), 1) as avg_stars, count(*)::int as cnt
      from public.ratings where helper_id = p.id) rt on true
 where p.first_name is not null;

grant select on public.public_profiles to authenticated;
