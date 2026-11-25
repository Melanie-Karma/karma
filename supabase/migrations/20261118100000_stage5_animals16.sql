-- Stage 5 (18.11.2026): 16 Tierstufen, die ersten gehen schnell, dann langsamer
-- Amöbe 0, Keimling 10, Wurm 20, Ameise 40, Käfer 60, Maus 90, Igel 130, Hase 180,
-- Eichhörnchen 250, Fuchs 340, Eule 450, Reh 600, Wolf 800, Bär 1050, Adler 1400, Drache 1800
alter table public.profiles drop constraint if exists profiles_animal_stage_check;
alter table public.profiles add constraint profiles_animal_stage_check check (animal_stage between 1 and 16);

create or replace function public.stage_for_points(p int)
returns int language sql immutable set search_path = public as $$
  select 1 + (p >= 10)::int + (p >= 20)::int + (p >= 40)::int + (p >= 60)::int + (p >= 90)::int
           + (p >= 130)::int + (p >= 180)::int + (p >= 250)::int + (p >= 340)::int + (p >= 450)::int
           + (p >= 600)::int + (p >= 800)::int + (p >= 1050)::int + (p >= 1400)::int + (p >= 1800)::int
$$;

-- Bestehende Profile auf die neue Skala umrechnen (Trigger feuert nur bei karma_points)
update public.profiles set animal_stage = public.stage_for_points(karma_points);
