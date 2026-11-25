-- Stage 11 (19.11.2026)
-- 1  Ein Angebot einstellen hält das Tier munter (keine Punkte)
-- 2  Einladen: 2 Karma-Punkte, wenn sich jemand über deinen Link anmeldet und das Profil fertig macht
alter table public.profiles
  add column if not exists last_active_at timestamptz,
  add column if not exists referred_by    uuid references public.profiles(id) on delete set null,
  add column if not exists referral_paid  boolean not null default false;

create or replace function public.refresh_auras()
returns void language sql security definer set search_path = public as $$
  update public.profiles set aura_active = false
   where aura_active
     and greatest(coalesce(last_helped_at, created_at), coalesce(last_active_at, created_at)) < now() - interval '14 days'
$$;

create or replace function public.offer_keeps_awake()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'offer' then
    update public.profiles set last_active_at = now(), aura_active = true where id = new.requester_id;
  end if;
  return new;
end $$;
drop trigger if exists help_requests_offer_awake on public.help_requests;
create trigger help_requests_offer_awake
  after insert on public.help_requests
  for each row execute function public.offer_keeps_awake();

-- Neues Konto: Werber aus den Anmeldedaten merken
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ref uuid;
begin
  begin
    v_ref := nullif(new.raw_user_meta_data->>'ref', '')::uuid;
  exception when others then
    v_ref := null;
  end;
  insert into public.profiles (id, first_name, referred_by)
  values (new.id, nullif(left(trim(new.raw_user_meta_data->>'first_name'), 30), ''),
          case when v_ref <> new.id and exists (select 1 from public.profiles where id = v_ref) then v_ref end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Profil fertig (Nutzungsbedingungen bestätigt): Werber bekommt einmalig 2 Punkte
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
  end if;
end $$;

-- Wie viele habe ich eingeladen?
create or replace function public.my_referrals()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles
   where referred_by = (select auth.uid()) and referral_paid
$$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;
