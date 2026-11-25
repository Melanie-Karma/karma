\set ON_ERROR_STOP on
\pset footer off
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','a@x','{"first_name":"Anna"}'),
 ('00000000-0000-0000-0000-00000000000b','b@x','{"first_name":"Ben"}');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a'; select accept_terms();
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b'; select accept_terms();
-- Anfrage darf nicht dauerhaft sein
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
do $$ begin perform create_request(p_category=>'tools',p_title=>'Test dauerhaft',p_description=>null,p_estimated_minutes=>15,p_timing=>'always',p_scheduled_at=>null,p_recurrence=>'once',p_mode=>'in_person',p_lat=>52.2,p_lng=>13.2,p_address_note=>null,p_helpers_needed=>1,p_auto_accept=>false,p_gender_pref=>'any'); raise exception 'SHOULD FAIL'; exception when others then if sqlerrm <> 'invalid_timing' then raise; end if; raise notice 'ok: always only for offers'; end $$;
select create_request(p_category=>'lend',p_title=>'Ich verleihe meine Bohrmaschine',p_description=>null,p_estimated_minutes=>30,p_timing=>'always',p_scheduled_at=>null,p_recurrence=>'once',p_mode=>'in_person',p_lat=>52.2,p_lng=>13.2,p_address_note=>null,p_helpers_needed=>1,p_auto_accept=>false,p_gender_pref=>'any',p_kind=>'offer') as o \gset
-- Zwei Nutzungen hintereinander durch Ben
\set i 1
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'feed', timing, title from nearby_requests(52.2,13.2);
select 'take 1', swipe(:'o','right');
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select accept_helper(:'o','00000000-0000-0000-0000-00000000000b'); select helper_mark_done(:'o',null);
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'confirm 1', complete_request(:'o',30,'[{"stars":5}]');
select 'detail after 1', get_request(:'o')->>'status', get_request(:'o')->>'my_status';
select 'feed again', count(*) from nearby_requests(52.2,13.2);
select 'take 2', swipe(:'o','right');
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select accept_helper(:'o','00000000-0000-0000-0000-00000000000b'); select helper_mark_done(:'o',null);
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'confirm 2', complete_request(:'o',60,'[{"stars":4}]');
select 'Anna', karma_points, helps_count, minutes_total, avg_stars, ratings_count from public_profiles where id='00000000-0000-0000-0000-00000000000a';
select 'offer', get_request(:'o')->>'status', get_request(:'o')->>'creator_points';
