-- =====================================================================
-- KARMA · Initiale Migration (Phase 1 + Phase 2 Kern)
-- Supabase / PostgreSQL + PostGIS
--
-- Inhalt
--   0  Extensions
--   1  Tabellen
--   2  Indizes (inkl. GiST für ST_DWithin)
--   3  Trigger: Signup, Zonen-Zähler, Referral, Tier-Stufe, Karma
--   4  RPCs: Swipe-Feed, Swipe, Match, Abschluss, Referral
--   5  Aura-Verfall (pg_cron)
--   6  Row Level Security + Grants
--   7  Realtime + Storage
--   8  Seed-Zonen
--
-- Bewusste Abweichungen vom Briefing (Begründung jeweils an der Stelle):
--   * zones.member_count      Live-Counter ohne Zugriff auf profiles
--   * profiles.referral_count Fortschritt "3 Freunde"
--   * profiles.founder_aura   Gründer-Aura
--   * help_requests.scheduled_at  Datum für urgency = 'scheduled'
--   * Invite-Link nutzt referral_code statt USER_ID (keine UUID im QR-Code)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0  Extensions
-- ---------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- 1  Tabellen
-- ---------------------------------------------------------------------
create table public.zones (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  center_location  geography(Point, 4326) not null,
  unlock_threshold int  not null default 150 check (unlock_threshold > 0),
  is_unlocked      boolean not null default false,
  -- Wird per Trigger gepflegt. So kann die Landingpage den Fortschritt
  -- anonym und live lesen, ohne dass profiles öffentlich sein muss.
  member_count     int  not null default 0 check (member_count >= 0),
  unlocked_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text check (char_length(username) between 2 and 30),
  avatar_url      text,
  skills          text[] not null default '{}'
                  check (skills <@ array['car','tools','carrying','shopping','tech','pets']),
  karma_points    int  not null default 0 check (karma_points >= 0),
  animal_stage    int  not null default 1 check (animal_stage between 1 and 7),
  aura_active     boolean not null default true,
  founder_aura    boolean not null default false,
  last_helped_at  timestamptz,
  referral_code   text not null unique,
  referred_by     uuid references public.profiles (id) on delete set null,
  referral_count  int  not null default 0 check (referral_count >= 0),
  zone_id         uuid references public.zones (id) on delete set null,
  last_location   geography(Point, 4326),
  created_at      timestamptz not null default now(),
  constraint profiles_no_self_referral check (referred_by is distinct from id)
);

create table public.help_requests (
  id                uuid primary key default gen_random_uuid(),
  requester_id      uuid not null references public.profiles (id) on delete cascade,
  title             text not null check (char_length(title) between 3 and 80),
  description       text check (char_length(description) <= 1000),
  category          text not null
                    check (category in ('car','tools','carrying','shopping','tech','pets','other')),
  urgency           text not null check (urgency in ('now','today','scheduled')),
  scheduled_at      timestamptz,
  estimated_minutes int  not null check (estimated_minutes between 5 and 480),
  location          geography(Point, 4326) not null,
  status            text not null default 'open'
                    check (status in ('open','matched','completed','cancelled')),
  created_at        timestamptz not null default now(),
  constraint help_requests_scheduled_needs_date
    check (urgency <> 'scheduled' or scheduled_at is not null)
);

create table public.swipes (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.help_requests (id) on delete cascade,
  swiper_id   uuid not null references public.profiles (id) on delete cascade,
  direction   text not null check (direction in ('left','right')),
  created_at  timestamptz not null default now(),
  unique (request_id, swiper_id)
);

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  -- unique: pro Anfrage genau ein Helfer
  request_id     uuid not null unique references public.help_requests (id) on delete cascade,
  requester_id   uuid not null references public.profiles (id) on delete cascade,
  helper_id      uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'active'
                 check (status in ('active','completed_by_helper','confirmed')),
  thank_you_note text check (char_length(thank_you_note) <= 280),
  karma_awarded  int  not null default 0,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint matches_no_self_help check (requester_id <> helper_id)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2  Indizes
-- ---------------------------------------------------------------------
-- Umkreissuche: ST_DWithin auf geography nutzt diese GiST-Indizes.
-- Der partielle Index hält den Swipe-Feed klein und schnell.
create index help_requests_open_location_gix
  on public.help_requests using gist (location) where status = 'open';
create index profiles_last_location_gix
  on public.profiles using gist (last_location);
create index zones_center_location_gix
  on public.zones using gist (center_location);

create index help_requests_requester_idx on public.help_requests (requester_id, created_at desc);
create index profiles_zone_idx           on public.profiles (zone_id);
create index profiles_referred_by_idx    on public.profiles (referred_by);
create index swipes_swiper_idx           on public.swipes (swiper_id);
create index swipes_offers_idx           on public.swipes (request_id) where direction = 'right';
create index matches_requester_idx       on public.matches (requester_id);
-- Deckt auch die Anti-Cheat-Abfrage (gleiches Paar in 7 Tagen) ab.
create index matches_pair_idx            on public.matches (helper_id, requester_id, completed_at);
create index messages_match_idx          on public.messages (match_id, created_at);

-- ---------------------------------------------------------------------
-- 3  Trigger
-- ---------------------------------------------------------------------

-- 3.1 Tier-Stufe aus Karma-Punkten
--     1 Amöbe · 2 Ameise · 3 Regenwurm · 4 Schmetterling
--     5 Singvogel · 6 Falke · 7 Adler / Phönix
create or replace function public.karma_stage(p_points int)
returns int language sql immutable
set search_path = ''
as $$
  select case
    when p_points >= 1000 then 7
    when p_points >=  600 then 6
    when p_points >=  300 then 5
    when p_points >=  150 then 4
    when p_points >=   60 then 3
    when p_points >=   20 then 2
    else 1
  end;
$$;

-- Die Stufe steigt automatisch mit dem Karma und fällt nie zurück
-- (kein De-Evolutions-Frust; Gründer-Stufe 4 bleibt trotz 0 Punkten).
create or replace function public.profiles_sync_stage()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.animal_stage := greatest(
    new.animal_stage,
    public.karma_stage(new.karma_points),
    case when tg_op = 'UPDATE' then old.animal_stage else 1 end
  );
  return new;
end;
$$;

create trigger profiles_sync_stage
  before insert or update of karma_points, animal_stage on public.profiles
  for each row execute function public.profiles_sync_stage();

-- 3.2 Zonen-Zähler + automatischer Unlock
create or replace function public.profiles_sync_zone_count()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.zone_id is not null
     and (tg_op = 'DELETE' or old.zone_id is distinct from new.zone_id) then
    update public.zones
       set member_count = greatest(member_count - 1, 0)
     where id = old.zone_id;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.zone_id is not null
     and (tg_op = 'INSERT' or old.zone_id is distinct from new.zone_id) then
    update public.zones
       set member_count = member_count + 1,
           -- einmal freigeschaltet bleibt freigeschaltet
           unlocked_at  = case when not is_unlocked and member_count + 1 >= unlock_threshold
                               then now() else unlocked_at end,
           is_unlocked  = is_unlocked or member_count + 1 >= unlock_threshold
     where id = new.zone_id;
  end if;

  return null;
end;
$$;

create trigger profiles_sync_zone_count
  after insert or update of zone_id or delete on public.profiles
  for each row execute function public.profiles_sync_zone_count();

-- 3.3 Referral-Gutschrift: 3 bestätigte Einladungen = Schmetterling + Gründer-Aura
create or replace function public.profiles_credit_referrer()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.referred_by is not null
     and (tg_op = 'INSERT' or old.referred_by is null) then
    update public.profiles
       set referral_count = referral_count + 1,
           founder_aura   = founder_aura or referral_count + 1 >= 3,
           animal_stage   = case when referral_count + 1 >= 3
                                 then greatest(animal_stage, 4) else animal_stage end
     where id = new.referred_by;
  end if;
  return null;
end;
$$;

create trigger profiles_credit_referrer
  after insert or update of referred_by on public.profiles
  for each row execute function public.profiles_credit_referrer();

-- 3.4 Profil anlegen, sobald die E-Mail bestätigt ist.
--     Erst dann zählt jemand für Zone und Referral. Das hält
--     Fake-Adressen aus dem Counter und aus dem Gründer-Incentive.
create or replace function public.generate_referral_code()
returns text language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_zone     uuid;
  v_referrer uuid;
begin
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select z.id into v_zone
    from public.zones z
   where z.slug = new.raw_user_meta_data ->> 'zone_slug';

  select p.id into v_referrer
    from public.profiles p
   where p.referral_code = lower(new.raw_user_meta_data ->> 'ref');

  insert into public.profiles (id, username, zone_id, referred_by, referral_code)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'username'), 30), ''),
    v_zone,
    v_referrer,
    public.generate_referral_code()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

-- 3.5 Karma-Vergabe bei bestätigtem Abschluss
--     Basis:  bis 15 Min = 10 · bis 30 Min = 20 · länger = 40
--     Bonus:  "Jetzt sofort" = +5
--     Anti-Cheat: gleiche Person innerhalb von 7 Tagen
--                 2. Hilfe = 25 % · ab der 3. = 10 % (mindestens 1 Punkt)
create or replace function public.matches_award_karma()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_minutes int;
  v_urgency text;
  v_base    int;
  v_prior   int;
  v_points  int;
begin
  select r.estimated_minutes, r.urgency
    into v_minutes, v_urgency
    from public.help_requests r
   where r.id = new.request_id;

  v_base := case when v_minutes <= 15 then 10
                 when v_minutes <= 30 then 20
                 else 40 end
          + case when v_urgency = 'now' then 5 else 0 end;

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

  new.karma_awarded := v_points;
  new.completed_at  := now();

  -- profiles_sync_stage hebt dabei automatisch die Tier-Stufe an
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

create trigger matches_award_karma
  before update of status on public.matches
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function public.matches_award_karma();

-- ---------------------------------------------------------------------
-- 4  RPCs (einziger Schreibweg für Swipes und Matches)
-- ---------------------------------------------------------------------

-- 4.1 Swipe-Feed: offene Anfragen im Umkreis, ohne exakte Koordinaten.
--     Der genaue Standort wird erst nach dem Match sichtbar (RLS unten).
create or replace function public.nearby_requests(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 2000
)
returns table (
  id                uuid,
  title             text,
  description       text,
  category          text,
  urgency           text,
  scheduled_at      timestamptz,
  estimated_minutes int,
  created_at        timestamptz,
  distance_m        int,
  requester_id      uuid,
  requester_name    text,
  requester_avatar  text,
  requester_stage   int
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
         -- auf 50 m gerundet, damit sich der Standort nicht triangulieren lässt
         (round(st_distance(r.location, me.pos) / 50.0) * 50)::int as distance_m,
         p.id, p.username, p.avatar_url, p.animal_stage
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

-- 4.2 Swipen
create or replace function public.swipe(p_request_id uuid, p_direction text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_direction not in ('left','right') then
    raise exception 'invalid direction' using errcode = '22023';
  end if;
  if not exists (
       select 1 from public.help_requests r
        where r.id = p_request_id and r.status = 'open' and r.requester_id <> v_uid) then
    raise exception 'request not available' using errcode = 'P0002';
  end if;

  insert into public.swipes (request_id, swiper_id, direction)
  values (p_request_id, v_uid, p_direction)
  on conflict (request_id, swiper_id) do nothing;
end;
$$;

-- 4.3 Anfragende Person akzeptiert einen Helfer: Match entsteht
create or replace function public.accept_helper(p_request_id uuid, p_helper_id uuid)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_match uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Sperrt die Anfrage, damit nicht zwei Helfer parallel akzeptiert werden
  perform 1 from public.help_requests r
    where r.id = p_request_id and r.requester_id = v_uid and r.status = 'open'
    for update;
  if not found then
    raise exception 'request not open or not yours' using errcode = 'P0002';
  end if;

  if not exists (
       select 1 from public.swipes s
        where s.request_id = p_request_id
          and s.swiper_id  = p_helper_id
          and s.direction  = 'right') then
    raise exception 'helper has not offered help' using errcode = 'P0002';
  end if;

  insert into public.matches (request_id, requester_id, helper_id)
  values (p_request_id, v_uid, p_helper_id)
  returning id into v_match;

  update public.help_requests set status = 'matched' where id = p_request_id;
  return v_match;
end;
$$;

-- 4.4 Helfer meldet "erledigt"
create or replace function public.mark_help_done(p_match_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.matches
     set status = 'completed_by_helper'
   where id = p_match_id and helper_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'match not active or not yours' using errcode = 'P0002';
  end if;
end;
$$;

-- 4.5 Anfragende Person bestätigt + Danke. Löst die Karma-Vergabe aus.
create or replace function public.confirm_help(p_match_id uuid, p_note text default null)
returns int language plpgsql security definer
set search_path = ''
as $$
declare
  v_points int;
begin
  update public.matches
     set status = 'confirmed',
         thank_you_note = nullif(left(trim(p_note), 280), '')
   where id = p_match_id
     and requester_id = auth.uid()
     and status = 'completed_by_helper'
  returning karma_awarded into v_points;
  if not found then
    raise exception 'match not ready to confirm or not yours' using errcode = 'P0002';
  end if;
  return v_points;
end;
$$;

-- 4.6 Referral nachträglich einlösen (z. B. nach Google- oder Apple-Login,
--     bei dem keine Metadaten mitgegeben werden). Nur innerhalb von 7 Tagen.
create or replace function public.claim_referral(p_code text)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_referrer uuid;
begin
  if v_uid is null or p_code is null then
    return false;
  end if;

  select p.id into v_referrer
    from public.profiles p
   where p.referral_code = lower(trim(p_code)) and p.id <> v_uid;
  if v_referrer is null then
    return false;
  end if;

  update public.profiles
     set referred_by = v_referrer
   where id = v_uid
     and referred_by is null
     and created_at > now() - interval '7 days'
     -- keine Ringe: wer mich eingeladen hat, kann nicht von mir eingeladen sein
     and not exists (
           select 1 from public.profiles r
            where r.id = v_referrer and r.referred_by = v_uid);
  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- 5  Aura-Verfall: nach 14 Tagen ohne Hilfe wird das Tier müde/grau.
--    Die nächste bestätigte Hilfe setzt aura_active wieder auf true (3.5).
--    Wer noch nie geholfen hat (Warteliste), behält seine Aura.
-- ---------------------------------------------------------------------
create or replace function public.refresh_auras()
returns void language sql security definer
set search_path = ''
as $$
  update public.profiles
     set aura_active = false
   where aura_active
     and last_helped_at is not null
     and last_helped_at < now() - interval '14 days';
$$;

select cron.schedule('karma-aura-decay', '15 3 * * *', $$select public.refresh_auras()$$);

-- ---------------------------------------------------------------------
-- 6  Row Level Security + Grants
-- ---------------------------------------------------------------------
alter table public.zones         enable row level security;
alter table public.profiles      enable row level security;
alter table public.help_requests enable row level security;
alter table public.swipes        enable row level security;
alter table public.matches       enable row level security;
alter table public.messages      enable row level security;

-- Erst alles entziehen, dann gezielt freigeben.
revoke all on public.zones, public.profiles, public.help_requests,
              public.swipes, public.matches, public.messages
  from anon, authenticated;

-- zones: öffentlich lesbar (Landingpage, Live-Counter)
grant select on public.zones to anon, authenticated;
create policy zones_read on public.zones
  for select to anon, authenticated using (true);

-- profiles: Die Tabelle selbst sieht nur die eigene Zeile, weil sie
-- last_location und referred_by enthält. Andere Nutzer gibt es nur über
-- die View public_profiles weiter unten.
grant select on public.profiles to authenticated;
-- Punkte, Stufe, Aura und Referral-Felder sind NICHT änderbar.
grant update (username, avatar_url, skills, zone_id, last_location)
  on public.profiles to authenticated;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Öffentliche Profilkarte ohne Standort und ohne Referral-Daten.
-- Läuft bewusst mit den Rechten des View-Owners (security_invoker = off).
create view public.public_profiles
  with (security_invoker = off) as
  select id, username, avatar_url, skills, karma_points,
         animal_stage, aura_active, founder_aura, zone_id
    from public.profiles;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- help_requests: lesen nur eigene und gematchte Anfragen (dort mit
-- exaktem Standort). Alle anderen kommen über nearby_requests().
grant select, insert on public.help_requests to authenticated;
grant update (title, description, category, urgency, scheduled_at,
              estimated_minutes, location, status)
  on public.help_requests to authenticated;

create policy help_requests_read on public.help_requests
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (select 1 from public.matches m
                where m.request_id = help_requests.id
                  and m.helper_id  = (select auth.uid()))
  );
create policy help_requests_insert on public.help_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'open');
-- Bearbeiten oder zurückziehen nur solange die Anfrage offen ist
create policy help_requests_update on public.help_requests
  for update to authenticated
  using (requester_id = (select auth.uid()) and status = 'open')
  with check (requester_id = (select auth.uid()) and status in ('open','cancelled'));

-- swipes: schreiben nur über swipe(). Lesen: eigene Swipes, und als
-- anfragende Person die Hilfsangebote (rechts) auf eigene Anfragen.
grant select on public.swipes to authenticated;
create policy swipes_read on public.swipes
  for select to authenticated
  using (
    swiper_id = (select auth.uid())
    or (direction = 'right'
        and exists (select 1 from public.help_requests r
                     where r.id = swipes.request_id
                       and r.requester_id = (select auth.uid())))
  );

-- matches: schreiben nur über accept_helper / mark_help_done / confirm_help
grant select on public.matches to authenticated;
create policy matches_read on public.matches
  for select to authenticated
  using ((select auth.uid()) in (requester_id, helper_id));

-- messages: nur die beiden Match-Beteiligten, nur solange das Match läuft
grant select, insert on public.messages to authenticated;
create policy messages_read on public.messages
  for select to authenticated
  using (exists (select 1 from public.matches m
                  where m.id = messages.match_id
                    and (select auth.uid()) in (m.requester_id, m.helper_id)));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.matches m
                 where m.id = messages.match_id
                   and m.status in ('active','completed_by_helper')
                   and (select auth.uid()) in (m.requester_id, m.helper_id))
  );

-- Funktionen: Trigger- und Hilfsfunktionen sind nicht per API aufrufbar
revoke execute on function
  public.profiles_sync_stage(),
  public.profiles_sync_zone_count(),
  public.profiles_credit_referrer(),
  public.generate_referral_code(),
  public.handle_new_user(),
  public.matches_award_karma(),
  public.refresh_auras()
from public, anon, authenticated;

revoke execute on function
  public.nearby_requests(double precision, double precision, int),
  public.swipe(uuid, text),
  public.accept_helper(uuid, uuid),
  public.mark_help_done(uuid),
  public.confirm_help(uuid, text),
  public.claim_referral(text)
from public, anon;

grant execute on function
  public.nearby_requests(double precision, double precision, int),
  public.swipe(uuid, text),
  public.accept_helper(uuid, uuid),
  public.mark_help_done(uuid),
  public.confirm_help(uuid, text),
  public.claim_referral(text)
to authenticated;

-- ---------------------------------------------------------------------
-- 7  Realtime + Storage
-- ---------------------------------------------------------------------
-- zones: Live-Counter · messages: Chat · matches: Status im Chat
alter publication supabase_realtime
  add table public.zones, public.messages, public.matches;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('share-cards', 'share-cards', true)
on conflict (id) do nothing;

-- Jeder schreibt nur in seinen eigenen Ordner: <bucket>/<user_id>/datei
create policy karma_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars','share-cards')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy karma_storage_update on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars','share-cards')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy karma_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars','share-cards')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 8  Seed-Zonen für den ersten Testlauf (Koordinaten: Länge, Breite)
-- ---------------------------------------------------------------------
insert into public.zones (name, slug, center_location) values
  ('TU Berlin / Charlottenburg', 'tu-berlin',
     st_setsrid(st_makepoint(13.3269, 52.5125), 4326)::geography),
  ('HU Berlin / Mitte', 'hu-berlin',
     st_setsrid(st_makepoint(13.3936, 52.5180), 4326)::geography),
  ('Prenzlauer Berg', 'prenzlauer-berg',
     st_setsrid(st_makepoint(13.4240, 52.5390), 4326)::geography)
on conflict (slug) do nothing;
