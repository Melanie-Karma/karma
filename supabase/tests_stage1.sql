\set ON_ERROR_STOP on
\pset footer off
-- A = Anna (anfragend, Frau), B = Ben (Mann), C = Clara (Frau), D = Dora (Frau, unvollständig)
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x',now(),'{"first_name":"Anna"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x',now(),'{"first_name":"Ben"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x',now(),'{"first_name":"Clara"}'),
 ('00000000-0000-0000-0000-00000000000d','d@x',now(),'{}');
select 'profiles', count(*) from profiles;

set role authenticated;
-- D unvollständig: darf keine Anfrage stellen
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
do $$ begin perform create_request('shopping','Einkauf','',30,'now',null,'once','in_person',52.2,13.2,null,1,false,'any'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm <> 'profile_incomplete' then raise; end if; raise notice 'ok: incomplete blocked'; end $$;

-- Onboarding
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update profiles set gender='female', last_initial='M', district='Trebbin' where id=auth.uid();
select accept_terms();
do $$ begin update profiles set karma_points=999 where id=auth.uid(); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: points not writable'; end $$;
do $$ begin update profiles set is_admin=true where id=auth.uid(); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: admin not writable'; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
update profiles set gender='male' where id=auth.uid(); select accept_terms();
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
update profiles set gender='female' where id=auth.uid(); select accept_terms();

-- Anna: Anfrage 1 (nur Frauen), Anfrage 2 (2 Helfende, auto)
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select create_request('company','Vorlesen am Nachmittag','Ich lese gern Krimis',60,'today',null,'weekly','in_person',52.2,13.2,'Klingel Müller',1,false,'female') as r1 \gset
select create_request('carrying','Sofa tragen','',45,'now',null,'once','in_person',52.2,13.2,'Hinterhof',2,true,'any') as r2 \gset
select set_config('my.r1', :'r1', false), set_config('my.r2', :'r2', false);
select 'own requests', count(*) from help_requests;

-- Ben sieht nur r2
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'feed Ben', title, distance_m, requester_name from nearby_requests(52.2,13.2);
select 'direct read Ben', count(*) from help_requests;
do $$ begin perform swipe(current_setting('my.r1')::uuid,'right'); exception when others then raise notice 'r1 for Ben: %', sqlerrm; end $$;
-- Ben sieht r1 im Detail nicht mit Adresse
select 'detail Ben r2 before', get_request(:'r2')->>'address_note' as addr, get_request(:'r2')->>'my_role' as role;
select 'swipe Ben r2', swipe(:'r2','right');
select 'detail Ben r2 after', get_request(:'r2')->>'address_note' as addr;
-- Clara
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'feed Clara', title from nearby_requests(52.2,13.2) order by 2;
select 'swipe Clara r1', swipe(:'r1','right');
select 'swipe Clara r2', swipe(:'r2','right');
select 'Clara r1 addr', get_request(:'r1')->>'address_note';
-- Dora sieht r2 nicht mehr (voll)
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
update profiles set first_name='Dora', gender='female' where id=auth.uid(); select accept_terms();
select 'feed Dora', title from nearby_requests(52.2,13.2);
do $$ begin perform swipe((select id from nearby_requests(52.2,13.2) limit 1),'left'); end $$;
select 'feed Dora after left', count(*) from nearby_requests(52.2,13.2);

-- Anna nimmt Clara für r1 an
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'helpers r1', jsonb_array_length(get_request(:'r1')->'helpers');
select accept_helper(:'r1','00000000-0000-0000-0000-00000000000c');
select 'Clara r1 addr after accept', (select get_request(:'r1')->>'address_note');
-- Chat
insert into messages(request_id, body) values (:'r2','Hallo ihr beiden!');
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
insert into messages(request_id, body) values (:'r2','Bin um 5 da');
select 'Ben reads r2 chat', count(*) from messages where request_id=:'r2';
select 'Ben reads r1 chat', count(*) from messages where request_id=:'r1';
do $$ begin insert into messages(request_id, body) values (current_setting('my.r1')::uuid,'spam'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: non-participant cannot write'; end $$;
do $$ begin insert into messages(request_id, sender_id, body) values (current_setting('my.r2')::uuid,'00000000-0000-0000-0000-00000000000a','fake'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: cannot spoof sender'; end $$;

-- Ben: erledigt
select helper_mark_done(:'r2','Lief super');
do $$ begin perform note from (select helper_note as note from request_helpers) x; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: helper_note hidden'; end $$;

-- Anna: Abschluss r2 mit 60 Min, Ben 5 Sterne, Clara 2 Sterne
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'complete r2', complete_request(:'r2', 60, '[{"helper_id":"00000000-0000-0000-0000-00000000000b","stars":5,"comment":"Super!"},{"helper_id":"00000000-0000-0000-0000-00000000000c","stars":2}]');
do $$ begin perform complete_request(current_setting('my.r2')::uuid, 60, '[]'); raise exception 'SHOULD FAIL'; exception when others then raise notice 'ok double complete: %', sqlerrm; end $$;
select 'public', display_name, karma_points, animal_stage, aura_active, helps_count, minutes_total, people_helped, avg_stars, ratings_count from public_profiles order by 2;
select 'ratings', rater_name, stars, comment from public_ratings order by stars;
select 'Anna sees own reports', count(*) from reports;

-- r1: Clara erledigt, Auto-Abschluss nach 24h
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select helper_mark_done(:'r1');
select report('00000000-0000-0000-0000-00000000000a', null, 'inappropriate', 'Test');
reset role;
update help_requests set helper_done_at = now() - interval '25 hours' where id=:'r1';
select 'auto', auto_complete_requests();
select 'r1', status, final_minutes, auto_completed from help_requests where id=:'r1';
select 'Clara points', karma_points, animal_stage from profiles where first_name='Clara';
-- Tier fällt nicht zurück, Aura verblasst
update profiles set last_helped_at = now() - interval '15 days' where first_name='Ben';
select refresh_auras();
select 'Ben aura', animal_stage, aura_active from profiles where first_name='Ben';
-- Block
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select create_request('tech','Drucker einrichten','',30,'today',null,'once','remote',null,null,null,1,false,'any') as r3 \gset
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'Ben feed remote', title, distance_m from nearby_requests(52.2,13.2);
select set_block('00000000-0000-0000-0000-00000000000a', true);
select 'Ben feed after block', count(*) from nearby_requests(52.2,13.2);
select 'my_helps Ben', title, status, my_status, points_awarded from my_helps();
-- anon darf nichts
reset role; set role anon;
do $$ begin perform count(*) from public_profiles; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: anon blocked'; end $$;
