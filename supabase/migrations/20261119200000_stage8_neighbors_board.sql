-- Stage 8 (19.11.2026): Nachbarn in deiner Nähe, Rangliste (Woche und gesamt)
create table if not exists public.points_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points  int not null,
  at      timestamptz not null default now()
);
create index if not exists points_log_user_at_idx on public.points_log (user_id, at);
alter table public.points_log enable row level security;
revoke all on public.points_log from public, anon, authenticated;

alter table public.profiles add column if not exists show_in_board boolean not null default true;
grant update (show_in_board) on public.profiles to authenticated;

-- Punkte gutschreiben: zusätzlich protokollieren (für die Wochen-Rangliste)
create or replace function public.award_points(p_user uuid, p_points int)
returns void language plpgsql security definer set search_path = public as $$
declare wk date := public.current_week();
begin
  update public.profiles
     set karma_points  = karma_points + p_points,
         last_helped_at = now(),
         aura_active   = true,
         streak_weeks  = case when streak_week = wk then streak_weeks
                              when streak_week = wk - 7 then streak_weeks + 1
                              else 1 end,
         streak_week   = wk
   where id = p_user;
  if p_points <> 0 then
    insert into public.points_log (user_id, points) values (p_user, p_points);
  end if;
end $$;
revoke all on function public.award_points(uuid, int) from public, anon, authenticated;

-- Nachbarn im Umkreis um einen Punkt (Ort je Person: frischer Aufenthaltsort, sonst Heimatort)
-- Liefert alle sichtbaren Nachbarn mit Punkten gesamt und diese Woche, plus mich selbst.
create or replace function public.neighbors_board(p_lat float8, p_lng float8, p_radius_m int default 10000)
returns table (user_id uuid, display_name text, avatar_url text, animal_stage int, aura_active boolean,
               karma_points int, week_points int, streak_weeks int, is_me boolean, total_nearby int)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select (select auth.uid()) as id,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as pos,
           least(greatest(coalesce(p_radius_m, 10000), 500), 20000) as radius
  ),
  near as (
    select p.*
      from public.profiles p, me
     where p.first_name is not null and p.accepted_terms_at is not null
       and (p.id = me.id or (
             public.effective_location(p) is not null
         and st_dwithin(public.effective_location(p), me.pos, me.radius)
         and not public.is_blocked_between(me.id, p.id)))
  ),
  wk as (
    select l.user_id, sum(l.points)::int as pts
      from public.points_log l
     where l.at >= public.current_week()::timestamp at time zone 'Europe/Berlin'
     group by l.user_id
  )
  select n.id,
         case when n.is_verified_org then n.organization_name
              else n.first_name || coalesce(' ' || n.last_initial || '.', '') end,
         n.avatar_url, n.animal_stage, n.aura_active, n.karma_points,
         coalesce(wk.pts, 0),
         case when n.streak_week >= public.current_week() - 7 then n.streak_weeks else 0 end,
         n.id = (select id from me),
         (select count(*) from near)::int
    from near n
    left join wk on wk.user_id = n.id
   where n.show_in_board or n.id = (select id from me)
   order by n.karma_points desc, n.created_at
   limit 200
$$;
revoke all on function public.neighbors_board(float8, float8, int) from public, anon;
grant execute on function public.neighbors_board(float8, float8, int) to authenticated;
