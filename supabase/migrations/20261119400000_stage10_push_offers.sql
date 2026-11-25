-- Stage 10 (19.11.2026): Push auch für neue Angebote, nicht nur für Hilfegesuche
create or replace function public.push_targets(p_request_id uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text,
               title text, body text, request_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare r public.help_requests; who text; v_hour int; v_body text;
begin
  select * into r from public.help_requests where id = p_request_id;
  if r.id is null or r.kind not in ('request', 'offer') or r.status <> 'open'
     or r.mode <> 'in_person' or r.location is null then
    return;
  end if;
  v_hour := extract(hour from now() at time zone 'Europe/Berlin');
  if v_hour >= 21 or v_hour < 8 then return; end if;

  select coalesce(case when p.is_verified_org then p.organization_name end,
                  p.first_name || coalesce(' ' || p.last_initial || '.', ''))
    into who from public.profiles p where p.id = r.requester_id;

  v_body := who || case when r.kind = 'offer' then ' bietet an · ' else ' · ' end
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


create or replace function public.notify_new_request()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_url text; v_secret text;
begin
  if new.kind not in ('request', 'offer') or new.mode <> 'in_person' then return new; end if;
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
