-- =============================================================================
-- pgTAP: milestone_achievements の重複防止用 UNIQUE インデックス検証
-- =============================================================================
-- 対象 migration: 20260929000002_milestone_achievements_unique.sql
--   CREATE UNIQUE INDEX milestone_achievements_practice_log_unique_idx
--     ON milestone_achievements (milestone_id, practice_log_id) WHERE practice_log_id IS NOT NULL;
--   CREATE UNIQUE INDEX milestone_achievements_record_unique_idx
--     ON milestone_achievements (milestone_id, record_id) WHERE record_id IS NOT NULL;
--
-- 方針:
--   RLS ではなく生の UNIQUE 制約の検証が目的のため、postgres ロール (BYPASSRLS) で
--   直接 INSERT する。期待値は「同じ組 (milestone_id, practice_log_id/record_id) の
--   2回目の INSERT が unique_violation (SQLSTATE 23505) になる」ことと、
--   「practice_log_id/record_id が異なれば (同一 milestone_id でも) 両方 INSERT できる」
--   ことの両方を固定する (部分インデックスの単位を実装のクエリ文言からではなく、
--   実際の INSERT 結果から検証する)。
--
-- 実行: ローカル Supabase 起動済み・対象 migration 適用済みの状態で直接 `psql -f`
--       実行する (16番と同じ理由で、supabase test db ラッパーの結果より直接実行を正とする)。
--       全フィクスチャは begin;...rollback; で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- -----------------------------------------------------------------------------
-- フィクスチャ (postgres = BYPASSRLS で投入)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-4777-a777-000000000001', 'qa-ma-user@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id = '77777777-7777-4777-a777-000000000001'
on conflict (id) do nothing;

-- 種目 (styles) は既存 seed のものを使う (id=1 が存在する前提を置かず動的に解決する)。
do $$
declare
  v_style_id integer;
  v_goal_id uuid;
  v_milestone_id uuid;
  v_milestone_id_2 uuid;
  v_practice_id uuid;
  v_log_1 uuid;
  v_log_2 uuid;
  v_competition_id uuid;
  v_record_1 uuid;
  v_record_2 uuid;
begin
  select id into v_style_id from public.styles where style = 'Fr' and distance = 100 limit 1;

  insert into public.goals (id, user_id, competition_id, style_id, target_time, start_time, status)
  values ('88888888-8888-4888-a888-000000000001', '77777777-7777-4777-a777-000000000001', null, v_style_id, 60.0, 70.0, 'active')
  returning id into v_goal_id;

  insert into public.milestones (id, goal_id, title, type, params, status)
  values
    ('99999999-9999-4999-a999-000000000001', v_goal_id, 'QA-MA milestone (practice)', 'set',
     '{"distance":100,"style":"Fr","swim_category":"Swim","reps":4,"sets":1,"circle":90}'::jsonb, 'achieved'),
    ('99999999-9999-4999-a999-000000000002', v_goal_id, 'QA-MA milestone (record)', 'time',
     '{"distance":100,"target_time":60,"style":"Fr","swim_category":"Swim"}'::jsonb, 'achieved');

  select id into v_milestone_id from public.milestones where id = '99999999-9999-4999-a999-000000000001';
  select id into v_milestone_id_2 from public.milestones where id = '99999999-9999-4999-a999-000000000002';

  insert into public.practices (id, user_id, date, place)
  values ('66666666-6666-4666-a666-000000000099', '77777777-7777-4777-a777-000000000001', current_date, 'QA-MA練習会場')
  returning id into v_practice_id;

  insert into public.practice_logs (id, user_id, practice_id, style, swim_category, rep_count, set_count, distance)
  values
    ('aaaaaaaa-aaaa-4aaa-aaaa-000000000001', '77777777-7777-4777-a777-000000000001', v_practice_id, 'Fr', 'Swim', 4, 1, 100),
    ('aaaaaaaa-aaaa-4aaa-aaaa-000000000002', '77777777-7777-4777-a777-000000000001', v_practice_id, 'Fr', 'Swim', 4, 1, 100);

  select id into v_log_1 from public.practice_logs where id = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001';
  select id into v_log_2 from public.practice_logs where id = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002';

  insert into public.competitions (id, title, date, pool_type, user_id, created_by)
  values ('bbbbbbbb-bbbb-4bbb-abbb-000000000001', 'QA-MA大会', current_date, 1, '77777777-7777-4777-a777-000000000001', '77777777-7777-4777-a777-000000000001')
  returning id into v_competition_id;

  insert into public.records (id, user_id, competition_id, style_id, time, pool_type, is_relaying)
  values
    ('cccccccc-cccc-4ccc-accc-000000000001', '77777777-7777-4777-a777-000000000001', v_competition_id, v_style_id, 58.0, 1, false),
    ('cccccccc-cccc-4ccc-accc-000000000002', '77777777-7777-4777-a777-000000000001', v_competition_id, v_style_id, 57.0, 1, false);

  select id into v_record_1 from public.records where id = 'cccccccc-cccc-4ccc-accc-000000000001';
  select id into v_record_2 from public.records where id = 'cccccccc-cccc-4ccc-accc-000000000002';
end $$;

-- -----------------------------------------------------------------------------
-- practice_log_id 側の部分 UNIQUE インデックス
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.milestone_achievements (milestone_id, practice_log_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', '{"time":58}'::jsonb) $$,
  'P-1: (milestone_id, practice_log_id) の初回 INSERT は成功する'
);

select throws_ok(
  $$ insert into public.milestone_achievements (milestone_id, practice_log_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', '{"time":58}'::jsonb) $$,
  '23505', null,
  'P-2: 同じ (milestone_id, practice_log_id) の2回目の INSERT は unique_violation (23505) になる'
);

select lives_ok(
  $$ insert into public.milestone_achievements (milestone_id, practice_log_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002', '{"time":57}'::jsonb) $$,
  'P-3: 同じ milestone_id でも practice_log_id が異なれば INSERT できる'
);

select is(
  (select count(*)::int from public.milestone_achievements where milestone_id = '99999999-9999-4999-a999-000000000001'),
  2,
  'P-4: 対象マイルストーンの milestone_achievements は最終的に2件 (重複INSERTは弾かれ、別ログ分だけ残る)'
);

-- -----------------------------------------------------------------------------
-- record_id 側の部分 UNIQUE インデックス
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.milestone_achievements (milestone_id, record_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000002', 'cccccccc-cccc-4ccc-accc-000000000001', '{"time":58}'::jsonb) $$,
  'R-1: (milestone_id, record_id) の初回 INSERT は成功する'
);

select throws_ok(
  $$ insert into public.milestone_achievements (milestone_id, record_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000002', 'cccccccc-cccc-4ccc-accc-000000000001', '{"time":58}'::jsonb) $$,
  '23505', null,
  'R-2: 同じ (milestone_id, record_id) の2回目の INSERT は unique_violation (23505) になる'
);

select lives_ok(
  $$ insert into public.milestone_achievements (milestone_id, record_id, achieved_value)
     values ('99999999-9999-4999-a999-000000000002', 'cccccccc-cccc-4ccc-accc-000000000002', '{"time":57}'::jsonb) $$,
  'R-3: 同じ milestone_id でも record_id が異なれば INSERT できる'
);

select is(
  (select count(*)::int from public.milestone_achievements where milestone_id = '99999999-9999-4999-a999-000000000002'),
  2,
  'R-4: 対象マイルストーンの milestone_achievements は最終的に2件'
);

select * from finish();
rollback;
