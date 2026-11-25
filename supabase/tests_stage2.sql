\set ON_ERROR_STOP on
\pset footer off
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x','{"first_name":"Anna"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x','{"first_name":"Ben"}'),
 ('00000000-0000-0000-0000-00000000000c','c@x','{"first_name":"Clara"}');
insert into private.settings values ('push_function_url','https://x/functions/v1/push-send'),('trigger_secret','s3');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a'; update profiles set gender='female' where id=auth.uid(); select accept_terms();
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b'; update profiles set gender='male' where id=auth.uid(); select accept_terms();
select set_my_location(52.2,13.2,5000);
select save_push_subscription('https://push.example/ben','k','a');
update profiles set push_per_day=1 where id=auth.uid();
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c'; update profiles set gender='female' where id=auth.uid(); select accept_terms();
select set_my_location(52.2,13.2,10000);
select save_push_subscription('https://push.example/clara','k','a');
select 'push status', my_push_status();

-- Anna: Säge leihen (Anfrage) -> Trigger feuert
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select create_request(p_category=>'lend',p_title=>'Brauche eine Säge',p_description=>null,p_estimated_minutes=>30,p_timing=>'today',p_scheduled_at=>null,p_recurrence=>'once',p_mode=>'in_person',p_lat=>52.2,p_lng=>13.2,p_address_note=>null,p_helpers_needed=>1,p_auto_accept=>false,p_gender_pref=>'any',p_lend_until=>current_date+3) as lend \gset
-- Anna: Angebot Vorlesen
select create_request(p_category=>'company',p_title=>'Ich lese gern vor',p_description=>'Krimis',p_estimated_minutes=>60,p_timing=>'today',p_scheduled_at=>null,p_recurrence=>'once',p_mode=>'in_person',p_lat=>52.2,p_lng=>13.2,p_address_note=>null,p_helpers_needed=>1,p_auto_accept=>false,p_gender_pref=>'any',p_kind=>'offer') as offer \gset

reset role;
-- Push-Ziele (Uhrzeit egal: Ruhezeit testen wir separat)
select 'targets lend', user_id, endpoint, title, body from push_targets(:'lend');
select 'targets lend again (no dup)', count(*) from push_targets(:'lend');
select 'targets offer (none)', count(*) from push_targets(:'offer');
-- Ben hat Limit 1 erreicht: neue Anfrage geht nur an Clara
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select create_request(p_category=>'ride',p_title=>'Mitfahrt zum Bahnhof',p_description=>null,p_estimated_minutes=>30,p_timing=>'now',p_scheduled_at=>null,p_recurrence=>'once',p_mode=>'in_person',p_lat=>52.2,p_lng=>13.2,p_address_note=>null,p_helpers_needed=>1,p_auto_accept=>false,p_gender_pref=>'any') as ride \gset
reset role;
select 'targets ride (Ben limit)', endpoint from push_targets(:'ride');

-- Ben sagt per Push zu (Server)
select 'swipe_for Ben', swipe_for('00000000-0000-0000-0000-00000000000b', :'lend', 'right');
set role authenticated;
-- Ben darf swipe_for nicht direkt
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
do $$ begin perform swipe_for(auth.uid(), (select id from help_requests limit 1), 'right'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: swipe_for blocked'; end $$;
do $$ begin perform push_targets((select gen_random_uuid())); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: push_targets blocked'; end $$;
do $$ begin perform 1 from push_subscriptions; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'ok: subs not readable'; end $$;

-- Feed Ben: zeigt Angebot und Ride mit kind
select 'feed Ben', kind, category, title, lend_until is not null as lu from nearby_requests(52.2,13.2) order by 3;

-- Leihen abschließen: Anna nimmt Ben an, Ben erledigt, Anna bestätigt -> halbe Punkte (30 min = 20 -> 10)
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select accept_helper(:'lend','00000000-0000-0000-0000-00000000000b');
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select helper_mark_done(:'lend', null);
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select complete_request(:'lend', 30, '[{"helper_id":"00000000-0000-0000-0000-00000000000b","stars":5}]');
select 'Ben points after lend', karma_points from public_profiles where id='00000000-0000-0000-0000-00000000000b';

-- Angebot: Clara nimmt an, Anna akzeptiert, Anna meldet erledigt, Clara bestätigt
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'Clara takes offer', swipe(:'offer','right');
do $$ begin perform helper_mark_done(current_setting('my.dummy',true)::uuid, null); exception when others then null; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select accept_helper(:'offer','00000000-0000-0000-0000-00000000000c');
select helper_mark_done(:'offer', null);
-- Anna darf ihr eigenes Angebot nicht bestätigen
do $$ begin perform complete_request((select id from help_requests where kind='offer'), 60, '[]'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm <> 'not_found' then raise; end if; raise notice 'ok: creator cannot confirm offer'; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'Clara confirms', complete_request(:'offer', 60, '[{"stars":5,"comment":"Toll vorgelesen"}]');
select 'Anna after offer', karma_points, helps_count, people_helped, avg_stars from public_profiles where id='00000000-0000-0000-0000-00000000000a';
select 'Clara my_helps', kind, title, my_status, status from my_helps();
select 'detail offer', get_request(:'offer')->>'kind', get_request(:'offer')->>'creator_points';
