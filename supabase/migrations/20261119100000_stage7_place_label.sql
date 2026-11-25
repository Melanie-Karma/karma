-- Stage 7 (19.11.2026): grober Ort (z. B. "Trebbin") für alle sichtbar
-- Genaue Adresse und Kartenpunkt sehen weiterhin nur Angenommene.
alter table public.help_requests add column if not exists place_label text;

create or replace function public.set_request_place(p_request_id uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.help_requests
     set place_label = left(nullif(trim(p_label), ''), 60)
   where id = p_request_id and requester_id = (select auth.uid());
end $$;
revoke all on function public.set_request_place(uuid, text) from public, anon;
grant execute on function public.set_request_place(uuid, text) to authenticated;

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
    'place_label', case when r.mode = 'remote' then null else r.place_label end,
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

drop function if exists public.nearby_requests(float8, float8, int);
create or replace function public.nearby_requests(
  p_lat float8, p_lng float8, p_radius_m int default 5000)
returns table (
  id uuid, kind text, category text, title text, description text, estimated_minutes int,
  timing text, scheduled_at timestamptz, recurrence text, mode text,
  helpers_needed int, helpers_accepted int, gender_pref text, is_org_request boolean,
  distance_m int, created_at timestamptz, lend_until date,
  requester_id uuid, requester_name text, requester_avatar text,
  requester_stage int, requester_aura boolean, requester_org text, requester_org_category text,
  place_label text)
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
         case when p.is_verified_org then p.org_category end,
         case when b.mode = 'remote' then null else b.place_label end
    from base b
    join me on true
    join public.profiles p on p.id = b.requester_id
   where b.accepted_cnt < b.helpers_needed
   order by b.is_org_request desc, (b.timing = 'now') desc, (b.timing = 'always') asc,
            case when b.mode = 'remote' then 999999 else st_distance(b.location, me.pos) end,
            b.created_at desc
   limit 50
$$;
revoke all on function public.nearby_requests(float8, float8, int) from public, anon;
grant execute on function public.nearby_requests(float8, float8, int) to authenticated;

-- Bestehende Anfragen rund um Trebbin nachtragen
update public.help_requests
   set place_label = 'Trebbin'
 where place_label is null and location is not null
   and extensions.st_dwithin(location, extensions.st_setsrid(extensions.st_makepoint(13.2248, 52.2178), 4326)::extensions.geography, 6000);
