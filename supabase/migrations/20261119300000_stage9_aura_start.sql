-- Stage 9 (19.11.2026): Neue Tiere starten lebendig. Nach 14 Tagen ohne Hilfe werden sie grau und ruhig.
alter table public.profiles alter column aura_active set default true;

update public.profiles set aura_active = true
 where not aura_active and coalesce(last_helped_at, created_at) > now() - interval '14 days';

create or replace function public.refresh_auras()
returns void language sql security definer set search_path = public as $$
  update public.profiles set aura_active = false
   where aura_active and coalesce(last_helped_at, created_at) < now() - interval '14 days'
$$;
