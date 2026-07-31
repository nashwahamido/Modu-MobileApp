-- Pick a real auth user id (sign one up in the app once, or grab one from the Auth dashboard).
-- The RPCs read auth.uid(), which is null in the SQL editor — impersonate the test user first so
-- sync_furniture_counts / reward_build / purchase_item don't bail with not_authenticated:
select set_config('request.jwt.claims', '{"sub":"0ebe9501-828d-4240-b596-eb3c16e43af1","role":"authenticated"}', false);

-- Make sure they have a profile with coins + a level to spend/gate against:
insert into public.user_profile (user_id, username, coin, level)
values ('0ebe9501-828d-4240-b596-eb3c16e43af1', 'Ge', 0, 1)
on conflict (user_id) do update set coin = 0, level = 1;

-- Stage/cluster counts are placeholder mirrors (no read path); only step_count feeds the rewards.
select public.sync_furniture_counts('eket-cabinet', 147, 5, 10);
select id, step_count, xp_per_step, xp_reward, coin_reward
from public.item_build where id = 'eket-cabinet';
-- EXPECT: step_count=147, xp_reward = 6*xp_per_step + xp_bonus, coin_reward = 3*coins_per_step

select public.sync_furniture_counts('dalfred-stool', 58, 3, 6);
select id, step_count, xp_per_step, xp_reward, coin_reward
from public.item_build where id = 'dalfred-stool';
-- EXPECT: step_count=58, xp_reward = 6*xp_per_step + xp_bonus, coin_reward = 3*coins_per_step

select public.sync_furniture_counts('bekvam-stool', 35, 2, 4);
select id, step_count, xp_per_step, xp_reward, coin_reward
from public.item_build where id = 'bekvam-stool';
-- EXPECT: step_count=35, xp_reward = 6*xp_per_step + xp_bonus, coin_reward = 3*coins_per_step

select public.sync_furniture_counts('lack-table', 14, 1, 2);
select id, step_count, xp_per_step, xp_reward, coin_reward
from public.item_build where id = 'lack-table';
-- EXPECT: step_count=14, xp_reward = 6*xp_per_step + xp_bonus, coin_reward = 3*coins_per_step


---------- reward_build — grant + idempotency

select public.reward_build('eket-cabinet');   -- 1st: {ok:true, already_rewarded:false, coins, xp}
select public.reward_build('eket-cabinet');   -- 2nd: {ok:true, already_rewarded:true} — NO double grant
select coin, xp from public.user_profile where user_id = '0ebe9501-828d-4240-b596-eb3c16e43af1';
select * from public.transaction where user_id = '0ebe9501-828d-4240-b596-eb3c16e43af1' and source = 'build_complete';
-- EXPECT: profile bumped ONCE; exactly one build_complete ledger row for eket-cabinet



-------- purchase_item — happy path + every rejection
select public.purchase_item('malm-chest');    -- {ok:true, coins: <remaining>}
select public.purchase_item('malm-chest');    -- already_owned
select public.purchase_item('does-not-exist');-- no_such_item
select coin from public.user_profile where user_id = '0ebe9501-828d-4240-b596-eb3c16e43af1';   -- deducted once
select * from public.user_buy where owner_id = '0ebe9501-828d-4240-b596-eb3c16e43af1';   -- one row: malm-chest
select * from public.transaction where user_id = '0ebe9501-828d-4240-b596-eb3c16e43af1' and source = 'purchase'; -- -price row
