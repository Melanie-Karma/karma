-- =====================================================================
-- KARMA · Delta: Non-Profit-Partner, Bumerang-Effekt, Sammel-Badges
-- Setzt 20261112000000_karma_init.sql voraus.
--
-- Bewusste Ergänzungen zum Briefing (Begründung jeweils an der Stelle):
--   * profiles.nonprofit_category   Tierheim und Tafel unterscheidbar (für Badges)
--   * help_requests.zone_id         Bezirk der Anfrage (für kiez_hero)
--   * matches.helper_done_at        Uhrzeit der Hilfe (für night_owl)
--   * Top-Helfer nur über Karma-Punkte, nicht über die Tier-Stufe
--   * Alle neuen Felder setzt die Datenbank, nie der Client
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1  Neue Spalten
-- ---------------------------------------------------------------------
alter table public.profiles
  add column account_type text not null default 'individual'
    check (account_type in ('individual','nonprofit')),
  add column is_verified_nonprofit boolean not null default false,
  add column organization_name text
    check (char_length(organization_name) between 2 and 80),
  -- Ohne Kategorie lässt sich "Hilfe für ein Tierheim" nicht von
  -- "Hilfe für die Tafel" unterscheiden. Die Badges brauchen das.
  add column nonprofit_category text
    check (nonprofit_category in ('animal_welfare','social','other')),
  add column badges text[] not null default '{}'
    check (badges <@ array['animal_lover','social_angel','kiez_hero','night_owl']),
  add constraint profiles_verified_nonprofit_complete check (
    not is_verified_nonprofit
    or (account_type = 'nonprofit'
        and organization_name is not null
        and nonprofit_category is not null));

alter table public.help_requests
  add column is_nonprofit_request    boolean not null default false,
  add column karma_multiplier        int     not null default 1
    check (karma_multiplier between 1 and 3),
  add column requester_is_top_helper boolean not null default false,
  add column zone_id uuid references public.zones (id) on delete set null;

alter table public.matches
  add column helper_done_at timestamptz;

create index profiles_verified_nonprofit_idx
  on public.profiles (id) where is_verified_nonprofit;
create index help_requests_zone_idx on public.help_requests (zone_id);
create index matches_helper_confirmed_idx
  on public.matches (helper_id) where status = 'confirmed';

-- ---------------------------------------------------------------------
-- 2  Anfrage-Snapshot: Non-Profit, Multiplikator, Top-Helfer, Bezirk
--    Wird beim Anlegen aus dem Profil berechnet. Was der Client in diese
--    Felder schreibt, wird überschrieben (und ist per Grant ohnehin gesperrt).
-- ---------------------------------------------------------------------
create or replace function public.help_requests_snapshot()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_verified boolean;
  v_points   int;
  v_zone     uuid;
begin
  select p.is_verified_nonprofit, p.karma_points, p.zone_id
    into v_verified, v_points, v_zone
    from public.profiles p
   where p.id = new.requester_id;

  new.is_nonprofit_request    := coalesce(v_verified, false);
  new.karma_multiplier        := case when new.is_nonprofit_request then 2 else 1 end;
  -- Bumerang-Effekt: ab 50 Karma-Punkten. Bewusst NICHT über die Stufe,
  -- weil Stufe 4 auch per Gründer-Aura (3 Einladungen) erreichbar ist,
  -- ohne jemals geholfen zu haben. Punkte gibt es nur für echte Hilfe.
  new.requester_is_top_helper := not new.is_nonprofit_request and coalesce(v_points, 0) >= 50;
  new.zone_id                 := v_zone;
  return new;
end;
$$;

create trigger help_requests_snapshot
  before insert on public.help_requests
  for each row execute function public.help_requests_snapshot();

-- Insert nur noch auf die Felder, die der Nutzer wirklich ausfüllt
revoke insert on public.help_requests from authenticated;
grant insert (requester_id, title, description, category, urgency,
              scheduled_at, estimated_minutes, location)
  on public.help_requests to authenticated;

-- ---------------------------------------------------------------------
-- 3  Karma-Vergabe: Multiplikator + keine Diminishing Returns bei Non-Profits
--    Basis:  bis 15 Min = 10 · bis 30 Min = 20 · länger = 40 · "Jetzt sofort" +5
--    Privat: gleiche Person in 7 Tagen → 2. Hilfe 25 %, ab der 3. 10 %
--    Non-Profit: immer volle Punkte × karma_multiplier (2)
-- ---------------------------------------------------------------------
create or replace function public.matches_award_karma()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_minutes    int;
  v_urgency    text;
  v_nonprofit  boolean;
  v_multiplier int;
  v_base       int;
  v_prior      int;
  v_points     int;
begin
  select r.estimated_minutes, r.urgency, r.is_nonprofit_request, r.karma_multiplier
    into v_minutes, v_urgency, v_nonprofit, v_multiplier
    from public.help_requests r
   where r.id = new.request_id;

  v_base := case when v_minutes <= 15 then 10
                 when v_minutes <= 30 then 20
                 else 40 end
          + case when v_urgency = 'now' then 5 else 0 end;

  if v_nonprofit then
    v_points := v_base;
  else
    select count(*) into v_prior
      from public.matches m
     where m.helper_id    = new.helper_id
       and m.requester_id = new.requester_id
       and m.status       = 'confirmed'
       and m.completed_at > now() - interval '7 days'
       and m.id <> new.id;

    v_points := case
      when v_prior = 0 then v_base
      when v_prior = 1 then ceil(v_base * 0.25)::int
      else greatest(1, ceil(v_base * 0.10)::int)
    end;
  end if;

  v_points := v_points * greatest(coalesce(v_multiplier, 1), 1);

  new.karma_awarded := v_points;
  new.completed_at  := now();

  update public.profiles
     set karma_points   = karma_points + v_points,
         last_helped_at = now(),
         aura_active    = true
   where id = new.helper_id;

  update public.help_requests
     set status = 'completed'
   where id = new.request_id;

  return new;
end;
$$;

-- Uhrzeit der eigentlichen Hilfe festhalten. Die Bestätigung der anfragenden
-- Person kann Stunden später kommen und taugt nicht für night_owl.
create or replace function public.mark_help_done(p_match_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.matches
     set status = 'completed_by_helper',
         helper_done_at = now()
   where id = p_match_id and helper_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'match not active or not yours' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4  Sammel-Badges
--    animal_lover  3 Hilfen für verifizierte Tierschutz-Organisationen
--    social_angel  3 Hilfen für verifizierte soziale Organisationen
--    kiez_hero     5 private Hilfen im selben Bezirk, für 5 VERSCHIEDENE
--                  Personen (sonst reicht ein Freund, der 5x anfragt)
--    night_owl     Hilfe zwischen 21:00 und 06:00 Uhr (Berliner Zeit)
--
--    Wird aus der gesamten Historie neu berechnet und nur ergänzt,
--    ein Badge geht also nie wieder verloren.
-- ---------------------------------------------------------------------
create or replace function public.recompute_badges(p_user uuid)
returns text[] language plpgsql security definer
set search_path = ''
as $$
declare
  v_earned text[];
  v_all    text[];
begin
  with done as (
    select r.is_nonprofit_request,
           r.requester_id,
           r.zone_id,
           req.nonprofit_category,
           extract(hour from m.helper_done_at at time zone 'Europe/Berlin') as done_hour
      from public.matches m
      join public.help_requests r on r.id = m.request_id
      join public.profiles req    on req.id = r.requester_id
     where m.helper_id = p_user
       and m.status    = 'confirmed'
  )
  select array_remove(array[
           case when count(*) filter (where is_nonprofit_request
                                        and nonprofit_category = 'animal_welfare') >= 3
                then 'animal_lover' end,
           case when count(*) filter (where is_nonprofit_request
                                        and nonprofit_category = 'social') >= 3
                then 'social_angel' end,
           case when (select max(n) from (
                        select count(distinct d.requester_id) as n
                          from done d
                         where not d.is_nonprofit_request and d.zone_id is not null
                         group by d.zone_id) per_zone) >= 5
                then 'kiez_hero' end,
           case when bool_or(done_hour >= 21 or done_hour < 6)
                then 'night_owl' end
         ], null)
    into v_earned
    from done;

  update public.profiles p
     set badges = array(select distinct b
                          from unnest(p.badges || coalesce(v_earned, '{}')) as b
                         order by b)
   where p.id = p_user
  returning p.badges into v_all;

  return v_all;
end;
$$;

create or replace function public.matches_award_badges()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.recompute_badges(new.helper_id);
  return null;
end;
$$;

-- AFTER-Trigger: die gerade bestätigte Hilfe ist dann schon mitgezählt
create trigger matches_award_badges
  after update of status on public.matches
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function public.matches_award_badges();

-- ---------------------------------------------------------------------
-- 5  Öffentliche Profilkarte um Organisation und Badges erweitern
-- ---------------------------------------------------------------------
create or replace view public.public_profiles
  with (security_invoker = off) as
  select id, username, avatar_url, skills, karma_points,
         animal_stage, aura_active, founder_aura, zone_id,
         account_type, is_verified_nonprofit,
         -- Organisationsname erst sichtbar, wenn verifiziert
         case when is_verified_nonprofit then organization_name end as organization_name,
         case when is_verified_nonprofit then nonprofit_category end as nonprofit_category,
         badges
    from public.profiles;

-- ---------------------------------------------------------------------
-- 6  Swipe-Feed mit Non-Profit-Rahmen und Top-Helfer-Badge
--    (Rückgabetyp ändert sich, daher drop + create)
-- ---------------------------------------------------------------------
drop function public.nearby_requests(double precision, double precision, int);

create function public.nearby_requests(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 2000
)
returns table (
  id                      uuid,
  title                   text,
  description             text,
  category                text,
  urgency                 text,
  scheduled_at            timestamptz,
  estimated_minutes       int,
  created_at              timestamptz,
  distance_m              int,
  requester_id            uuid,
  requester_name          text,
  requester_avatar        text,
  requester_stage         int,
  is_nonprofit_request    boolean,
  karma_multiplier        int,
  requester_is_top_helper boolean,
  organization_name       text,
  nonprofit_category      text
)
language sql stable security definer
set search_path = public, extensions
as $$
  with me as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as pos,
           least(greatest(coalesce(p_radius_m, 2000), 500), 5000)   as radius
  )
  select r.id, r.title, r.description, r.category, r.urgency, r.scheduled_at,
         r.estimated_minutes, r.created_at,
         (round(st_distance(r.location, me.pos) / 50.0) * 50)::int as distance_m,
         p.id, p.username, p.avatar_url, p.animal_stage,
         r.is_nonprofit_request, r.karma_multiplier, r.requester_is_top_helper,
         case when r.is_nonprofit_request then p.organization_name end,
         case when r.is_nonprofit_request then p.nonprofit_category end
    from public.help_requests r
    join public.profiles p on p.id = r.requester_id
    cross join me
   where (select auth.uid()) is not null
     and r.status = 'open'
     and r.requester_id <> (select auth.uid())
     and st_dwithin(r.location, me.pos, me.radius)
     and not exists (
           select 1 from public.swipes s
            where s.request_id = r.id and s.swiper_id = (select auth.uid()))
   order by case r.urgency when 'now' then 0 when 'today' then 1 else 2 end,
            st_distance(r.location, me.pos),
            r.created_at
   limit 50;
$$;

-- ---------------------------------------------------------------------
-- 7  Daten für die 9:16 Share-Card (nur für den Helfer selbst)
--    Bei privaten Hilfen nur die Kategorie, nie der Titel: "Begleitung
--    zum Arzt" plus Bezirk auf Instagram wäre ein Datenschutzproblem
--    für die Person, der geholfen wurde. Bei Non-Profits Titel + Organisation.
-- ---------------------------------------------------------------------
create or replace function public.share_card(p_match_id uuid)
returns table (
  animal_stage       int,
  founder_aura       boolean,
  badges             text[],
  task_label         text,
  category           text,
  is_nonprofit       boolean,
  organization_name  text,
  nonprofit_category text,
  karma_awarded      int,
  zone_name          text,
  referral_code      text
)
language sql stable security definer
set search_path = ''
as $$
  select h.animal_stage, h.founder_aura, h.badges,
         case when r.is_nonprofit_request then r.title end,
         r.category,
         r.is_nonprofit_request,
         case when r.is_nonprofit_request then req.organization_name end,
         case when r.is_nonprofit_request then req.nonprofit_category end,
         m.karma_awarded,
         z.name,
         h.referral_code
    from public.matches m
    join public.help_requests r on r.id = m.request_id
    join public.profiles h      on h.id = m.helper_id
    join public.profiles req    on req.id = m.requester_id
    left join public.zones z    on z.id = coalesce(r.zone_id, h.zone_id)
   where m.id = p_match_id
     and m.helper_id = auth.uid()
     and m.status = 'confirmed';
$$;

-- ---------------------------------------------------------------------
-- 8  Rechte
-- ---------------------------------------------------------------------
revoke execute on function
  public.help_requests_snapshot(),
  public.recompute_badges(uuid),
  public.matches_award_badges()
from public, anon, authenticated;

revoke execute on function
  public.nearby_requests(double precision, double precision, int),
  public.share_card(uuid)
from public, anon;

grant execute on function
  public.nearby_requests(double precision, double precision, int),
  public.share_card(uuid)
to authenticated;

-- Die neuen profiles-Spalten (account_type, is_verified_nonprofit,
-- organization_name, nonprofit_category, badges) sind absichtlich NICHT im
-- Update-Grant. Verifizieren kann nur ein Admin, siehe README.
