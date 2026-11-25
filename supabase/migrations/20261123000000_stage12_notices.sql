-- Stage 12 (23.11.2026)
-- Einmalige Hinweise beim Öffnen der App (z. B. "Uwe hat sich über deinen Link angemeldet, +2 Karma-Punkte").
-- Wegklicken setzt seen_at, danach erscheint der Hinweis nie wieder.
create table if not exists public.user_notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  points     int  not null default 0,
  message    text not null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists user_notices_open on public.user_notices (user_id) where seen_at is null;
alter table public.user_notices enable row level security;
drop policy if exists user_notices_own on public.user_notices;
create policy user_notices_own on public.user_notices
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.my_notices()
returns setof public.user_notices language sql stable security definer set search_path = public as $$
  select * from public.user_notices
   where user_id = (select auth.uid()) and seen_at is null
   order by created_at
$$;

create or replace function public.dismiss_notice(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.user_notices set seen_at = now()
   where id = p_id and user_id = (select auth.uid()) and seen_at is null
$$;

revoke all on function public.my_notices() from public, anon;
revoke all on function public.dismiss_notice(uuid) from public, anon;
grant execute on function public.my_notices() to authenticated;
grant execute on function public.dismiss_notice(uuid) to authenticated;

-- Einladung zählt: Werber bekommt 2 Punkte und beim nächsten Öffnen einen Hinweis
create or replace function public.accept_terms()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  update public.profiles set accepted_terms_at = coalesce(accepted_terms_at, now())
   where id = (select auth.uid())
   returning * into me;
  if me.referred_by is not null and not me.referral_paid then
    update public.profiles set referral_paid = true where id = me.id;
    update public.profiles
       set karma_points = karma_points + 2, aura_active = true, last_active_at = now()
     where id = me.referred_by;
    insert into public.points_log (user_id, points) values (me.referred_by, 2);
    insert into public.user_notices (user_id, kind, points, message)
    values (me.referred_by, 'referral', 2,
            coalesce(me.first_name, 'Jemand') || ' ist über deine Einladung dabei.');
  end if;
end $$;
