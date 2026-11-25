-- =====================================================================
-- Karma Stufe 13 (24.11.2026)
--  1  Absage nach Zusage: Anfrage startet neu, wird wieder sichtbar und
--     nochmal per Push verschickt (nicht an Beteiligte). Hinweis an die
--     andere Seite.
--  2  Frist fürs Bestätigen: unbestätigte Zusagen verfallen automatisch
--     (jetzt 1 Std., heute 3 Std., Termin 24 Std. bzw. 2 Std. vorher,
--     dauerhaft 48 Std.). Hinweis an die helfende Person.
--  3  Fairere Punkte: Obergrenze je Kategorie, ohne aktive Bestätigung
--     zählen höchstens 30 Minuten.
-- Voraussetzung: Stufe 12 (user_notices) ist eingespielt.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3  Obergrenzen je Kategorie
-- ---------------------------------------------------------------------
create or replace function public.max_minutes_for(p_category text)
returns int language sql immutable set search_path = public as $$
  select case p_category
    when 'shopping'  then 60
    when 'pets'      then 60
    when 'ride'      then 60
    when 'tech'      then 90
    when 'escort'    then 120
    when 'company'   then 120
    when 'tools'     then 120
    when 'other'     then 120
    when 'carrying'  then 240
    when 'home'      then 240
    when 'community' then 240
    else 120 end
$$;

-- Schätzung beim Anlegen automatisch auf die Obergrenze kürzen
create or replace function public.clamp_estimated_minutes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.estimated_minutes := least(new.estimated_minutes, public.max_minutes_for(new.category));
  return new;
end $$;

drop trigger if exists help_requests_clamp_minutes on public.help_requests;
create trigger help_requests_clamp_minutes
  before insert or update of estimated_minutes, category on public.help_requests
  for each row execute function public.clamp_estimated_minutes();

-- Bestehende offene Anfragen angleichen
update public.help_requests
   set estimated_minutes = least(estimated_minutes, public.max_minutes_for(category))
 where status = 'open' and estimated_minutes > public.max_minutes_for(category);

-- Abschluss: Obergrenze je Kategorie, automatisch höchstens 30 Minuten
create or replace function public.finalize_request(
  p_request_id uuid, p_minutes int, p_feedback jsonb, p_auto boolean, p_rater uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.help_requests; h record; f jsonb; pts int; v_attended boolean;
  v_stars int; awarded int := 0;
begin
  select * into r from public.help_requests where id = p_request_id for update;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;
  p_minutes := least(p_minutes, public.max_minutes_for(r.category));
  if p_auto then p_minutes := least(p_minutes, 30); end if;
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

-- ---------------------------------------------------------------------
-- 2  Frist fürs Bestätigen
-- ---------------------------------------------------------------------
alter table public.request_helpers drop constraint request_helpers_status_check;
alter table public.request_helpers add constraint request_helpers_status_check
  check (status in ('offered','accepted','declined','withdrawn','completed','expired'));

-- Bis wann eine Zusage bestätigt sein muss (p_since = Zeitpunkt der Zusage)
create or replace function public.offer_deadline(p_timing text, p_scheduled timestamptz, p_since timestamptz)
returns timestamptz language sql immutable set search_path = public as $$
  select case
    when p_timing = 'always' then p_since + interval '48 hours'
    when p_timing = 'now'    then p_since + interval '1 hour'
    when p_timing = 'today'  then p_since + interval '3 hours'
    else greatest(least(p_since + interval '24 hours', p_scheduled - interval '2 hours'),
                  p_since + interval '1 hour')
  end
$$;

-- Bereits wartende Zusagen bekommen ab jetzt die normale Frist
update public.request_helpers set updated_at = now() where status = 'offered';

create or replace function public.expire_offers()
returns int language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select h.request_id, h.helper_id, r.kind, r.title,
                  coalesce(case when p.is_verified_org then p.organization_name end, p.first_name) as owner_name
             from public.request_helpers h
             join public.help_requests r on r.id = h.request_id
             join public.profiles p on p.id = r.requester_id
            where h.status = 'offered' and r.status = 'open'
              and now() > public.offer_deadline(r.timing, r.scheduled_at, h.updated_at)
            for update of h skip locked loop
    update public.request_helpers set status = 'expired', updated_at = now()
     where request_id = x.request_id and helper_id = x.helper_id;
    insert into public.user_notices (user_id, kind, message)
    values (x.helper_id, 'offer_expired',
            case when x.kind = 'offer'
                 then x.owner_name || ' hat deine Anfrage zu „' || x.title || '“ nicht rechtzeitig bestätigt. Sie ist verfallen.'
                 else x.owner_name || ' hat deine Zusage für „' || x.title || '“ nicht rechtzeitig bestätigt. Du bist wieder frei.'
            end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Wer verfallen ist, darf es nochmal versuchen
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
   where public.request_helpers.status in ('withdrawn','completed','expired');
  return new_status;
end $$;

-- ---------------------------------------------------------------------
-- 1  Absage nach Zusage: neu einstellen und nochmal pushen
-- ---------------------------------------------------------------------
alter table public.help_requests add column if not exists reopened_at timestamptz;

create or replace function public.reopen_after_dropout(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.help_requests;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null or r.kind <> 'request' or r.status <> 'open' or r.helper_done_at is not null then
    return;
  end if;
  if r.timing = 'date' and r.scheduled_at < now() + interval '30 minutes' then return; end if;
  update public.help_requests set reopened_at = now() where id = r.id;
end $$;

-- Helfer zieht zurück
create or replace function public.withdraw_help(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); v_old text; r public.help_requests; v_name text;
begin
  select h.status into v_old
    from public.request_helpers h
    join public.help_requests hr on hr.id = h.request_id
   where h.request_id = p_request_id and h.helper_id = me
     and hr.status = 'open' and h.status in ('offered','accepted')
   for update of h;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update public.request_helpers set status = 'withdrawn', updated_at = now()
   where request_id = p_request_id and helper_id = me;

  if v_old = 'accepted' then
    select * into r from public.help_requests where id = p_request_id;
    select first_name into v_name from public.profiles where id = me;
    if r.kind = 'request' then
      perform public.reopen_after_dropout(r.id);
      insert into public.user_notices (user_id, kind, message)
      values (r.requester_id, 'helper_left',
              coalesce(v_name, 'Jemand') || ' hat für „' || r.title || '“ abgesagt. Deine Anfrage ist wieder für alle sichtbar.');
    else
      insert into public.user_notices (user_id, kind, message)
      values (r.requester_id, 'helper_left',
              coalesce(v_name, 'Jemand') || ' braucht dein Angebot „' || r.title || '“ doch nicht.');
    end if;
  end if;
end $$;

-- Anfragende Person sagt ab (auch nach Zusage)
create or replace function public.decline_helper(p_request_id uuid, p_helper_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.help_requests; v_old text; v_name text;
begin
  select * into r from public.help_requests
   where id = p_request_id and requester_id = (select auth.uid()) and status = 'open';
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  select status into v_old from public.request_helpers
   where request_id = r.id and helper_id = p_helper_id for update;
  update public.request_helpers set status = 'declined', updated_at = now()
   where request_id = r.id and helper_id = p_helper_id
     and status in ('offered','accepted');

  if v_old = 'accepted' then
    if r.kind = 'request' then perform public.reopen_after_dropout(r.id); end if;
    select coalesce(case when p.is_verified_org then p.organization_name end, p.first_name)
      into v_name from public.profiles p where p.id = r.requester_id;
    insert into public.user_notices (user_id, kind, message)
    values (p_helper_id, 'declined',
            coalesce(v_name, 'Jemand') || ' hat für „' || r.title || '“ abgesagt. Du bist wieder frei.');
  end if;
end $$;

-- Push auch beim Neu-Einstellen
drop trigger if exists help_requests_push_reopen on public.help_requests;
create trigger help_requests_push_reopen
  after update of reopened_at on public.help_requests
  for each row when (new.reopened_at is not null and new.reopened_at is distinct from old.reopened_at)
  execute function public.notify_new_request();

-- Push-Empfänger: nach Neu-Einstellen dürfen alle nochmal, Beteiligte nie
create or replace function public.push_targets(p_request_id uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text,
               title text, body text, request_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare r public.help_requests; who text; v_hour int; v_body text; v_since timestamptz;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null or r.kind not in ('request', 'offer') or r.status <> 'open'
     or r.mode <> 'in_person' or r.location is null then
    return;
  end if;
  v_hour := extract(hour from now() at time zone 'Europe/Berlin');
  if v_hour >= 21 or v_hour < 8 then return; end if;
  v_since := coalesce(r.reopened_at, '-infinity'::timestamptz);

  select coalesce(case when p.is_verified_org then p.organization_name end,
                  p.first_name || coalesce(' ' || p.last_initial || '.', ''))
    into who from public.profiles p where p.id = r.requester_id;

  v_body := case when r.reopened_at is not null then 'Wieder gesucht · ' else '' end
    || who || case when r.kind = 'offer' then ' bietet an · ' else ' · ' end
    || case r.timing when 'now' then 'jetzt'
                     when 'today' then 'heute'
                     when 'always' then 'jederzeit'
                     else to_char(r.scheduled_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' Uhr' end
    || case when r.kind = 'offer' then '' else ' · ca. ' || r.estimated_minutes || ' Min.' end
    || case when r.kind = 'request' and r.helpers_needed > 1 then ' · ' || r.helpers_needed || ' Leute gesucht' else '' end;

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
       and not exists (select 1 from public.push_log l
                        where l.user_id = b.id and l.request_id = r.id and l.sent_at >= v_since)
       and not exists (select 1 from public.request_helpers h
                        where h.request_id = r.id and h.helper_id = b.id)
       and not exists (select 1 from public.dismissals d
                        where d.request_id = r.id and d.user_id = b.id)
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
    on conflict (user_id, request_id) do update set sent_at = now()
      where push_log.sent_at < v_since
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

-- Feed: Zeitfenster startet beim Neu-Einstellen neu
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
             when 'now'    then greatest(r.created_at, coalesce(r.reopened_at, r.created_at)) > now() - interval '12 hours'
             when 'today'  then greatest(r.created_at, coalesce(r.reopened_at, r.created_at)) > now() - interval '24 hours'
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

-- Detailansicht: Fristen mitliefern
create or replace function public.get_request(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  me uuid := (select auth.uid()); r public.help_requests; role text;
  my_status text; my_since timestamptz; result jsonb;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null then return null; end if;
  select status, updated_at into my_status, my_since from public.request_helpers
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
    'my_expires_at', case when my_status = 'offered'
                          then public.offer_deadline(r.timing, r.scheduled_at, my_since) end,
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
             'points_awarded', h.points_awarded,
             'expires_at', case when h.status = 'offered'
                                then public.offer_deadline(r.timing, r.scheduled_at, h.updated_at) end,
             'profile', to_jsonb(pp))
             order by h.created_at)
      from public.request_helpers h
      join public.public_profiles pp on pp.id = h.helper_id
     where h.request_id = r.id
       and (role = 'requester' or h.status = 'accepted' or h.helper_id = me)
       and h.status in ('offered','accepted')), '[]'::jsonb));
  return result;
end $$;

-- ---------------------------------------------------------------------
-- Rechte und Zeitplan
-- ---------------------------------------------------------------------
revoke all on function public.reopen_after_dropout(uuid) from public, anon, authenticated;
revoke all on function public.expire_offers() from public, anon, authenticated;
revoke all on function public.clamp_estimated_minutes() from public, anon, authenticated;
revoke all on function public.swipe_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_request(uuid, int, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;
grant execute on function public.max_minutes_for(text) to authenticated;
grant execute on function public.offer_deadline(text, timestamptz, timestamptz) to authenticated;
revoke all on function public.withdraw_help(uuid) from public, anon;
grant execute on function public.withdraw_help(uuid) to authenticated;
revoke all on function public.decline_helper(uuid, uuid) from public, anon;
grant execute on function public.decline_helper(uuid, uuid) to authenticated;
revoke all on function public.nearby_requests(float8, float8, int) from public, anon;
grant execute on function public.nearby_requests(float8, float8, int) to authenticated;
revoke all on function public.get_request(uuid) from public, anon;
grant execute on function public.get_request(uuid) to authenticated;

select cron.schedule('karma-expire-offers', '*/10 * * * *', $$select public.expire_offers()$$);
