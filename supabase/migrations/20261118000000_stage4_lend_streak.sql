-- Stage 4 (18.11.2026)
-- 1  Verleihen: einmalig 5 Karma-Punkte, unabhängig von der Dauer
-- 2  Wochen-Streak: Wochen in Folge, in denen jemand geholfen hat

create or replace function public.points_for(p_category text, p_minutes int)
returns int language sql immutable set search_path = public as $$
  select case when p_category = 'lend' then 5
              else public.points_for_minutes(p_minutes) end
$$;

alter table public.profiles
  add column if not exists streak_weeks int not null default 0,
  add column if not exists streak_week  date;

-- Montag der aktuellen Woche (deutsche Zeit)
create or replace function public.current_week()
returns date language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'Europe/Berlin')::date
$$;

-- Punkte gutschreiben, Aura einschalten, Streak fortschreiben
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
end $$;

revoke all on function public.award_points(uuid, int) from public, anon, authenticated;
grant execute on function public.current_week() to authenticated;
