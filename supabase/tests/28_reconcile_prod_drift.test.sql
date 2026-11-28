-- =============================================================================
-- pgTAP: 本番にだけ残っていた古い定義を揃える (20261202000000_reconcile_prod_drift)
--
--   R  replace_practice_logs の認可 (本番では認可ガードが無く anon も実行できた)
--   F  milestone_achievements の FK (本番に無かった)
--   X  本番にだけあった未使用の関数 set_published_at が無い
--   招待コードの btrim と request_join_team が SQLERRM を返さないこと (02 の G-1〜G-3・K-1・K-3)、
--   本人による pending への書き換えの拒否 (01 の D-4〜D-6)、FK による NULL 化 (27 の S-1b) は既存テストで確かめる。
--   reactivate_own_membership が SQLERRM を返さないことを確かめるテストは無い
--
-- 実行: `supabase test db` または psql で直接 (全フィクスチャは rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

create function public.qa_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function public.qa_logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- -----------------------------------------------------------------------------
-- フィクスチャ
--   ...01 owner     個人練習 P1 とチーム練習 P2 の持ち主
--   ...02 stranger  どのチームにも入っていない第三者
--   ...03 admin     チーム T の管理者 (P2 の代理入力ができる)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('28280000-0000-4000-a000-000000000001', 'qa-rd-owner@example.test'),
  ('28280000-0000-4000-a000-000000000002', 'qa-rd-stranger@example.test'),
  ('28280000-0000-4000-a000-000000000003', 'qa-rd-admin@example.test');

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-rd-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('28281000-0000-4000-a000-000000000001', 'QA RD Team', 'QA-RD-T1', '28280000-0000-4000-a000-000000000003');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('28281000-0000-4000-a000-000000000001', '28280000-0000-4000-a000-000000000003', 'admin', 'approved', true, '2026-01-01', null),
  ('28281000-0000-4000-a000-000000000001', '28280000-0000-4000-a000-000000000001', 'user',  'approved', true, '2026-01-01', null);

insert into public.practices (id, user_id, team_id, date) values
  ('28282000-0000-4000-a000-000000000001', '28280000-0000-4000-a000-000000000001', null, '2026-11-01'),
  ('28282000-0000-4000-a000-000000000002', '28280000-0000-4000-a000-000000000001', '28281000-0000-4000-a000-000000000001', '2026-11-02');

insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('28283000-0000-4000-a000-000000000001', '28280000-0000-4000-a000-000000000001', '28282000-0000-4000-a000-000000000001', 'Fr', 1, 1, 50);

create function pg_temp.qa_logs(p_user uuid) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'user_id', p_user, 'style', 'Br', 'swim_category', 'Swim', 'rep_count', 2, 'set_count', 1, 'distance', 100))
$$;

-- =============================================================================
-- R replace_practice_logs の認可
-- =============================================================================
select ok(not has_function_privilege('anon', 'public.replace_practice_logs(uuid, jsonb)', 'EXECUTE'),
  'R-1: anon は replace_practice_logs を実行できない');

select public.qa_login_as('28280000-0000-4000-a000-000000000002');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000001',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000001'))->>'success')::boolean,
  false, 'R-2: 持ち主でも管理者でもない第三者は、持ち主のログとして送っても他人の練習を書き換えられない');
select public.qa_logout();

select is(
  (select array_agg(id::text) from public.practice_logs where practice_id = '28282000-0000-4000-a000-000000000001'),
  array['28283000-0000-4000-a000-000000000001'],
  'R-3: 第三者の呼び出しの後も、持ち主のログは消えずに残っている');

select public.qa_login_as('28280000-0000-4000-a000-000000000001');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000001',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000001'))->>'success')::boolean,
  true, 'R-4: 持ち主は自分の練習のログを置き換えられる');
select public.qa_logout();

select public.qa_login_as('28280000-0000-4000-a000-000000000003');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000002',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000001'))->>'success')::boolean,
  true, 'R-5: チームの管理者はチーム練習のログを代理で置き換えられる');
select public.qa_logout();

select public.qa_login_as('28280000-0000-4000-a000-000000000002');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000002',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000001'))->>'success')::boolean,
  false, 'R-6: チームに入っていない第三者は、メンバーのログとして送ってもチーム練習を書き換えられない');
select public.qa_logout();

select public.qa_login_as('28280000-0000-4000-a000-000000000003');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000002',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000002'))->>'success')::boolean,
  false, 'R-7: 管理者でも、チームに入っていない人のログをチーム練習に入れられない');
select public.qa_logout();

select public.qa_login_as('28280000-0000-4000-a000-000000000001');
select is(
  (public.replace_practice_logs('28282000-0000-4000-a000-000000000001',
     pg_temp.qa_logs('28280000-0000-4000-a000-000000000002'))->>'success')::boolean,
  false, 'R-8: 持ち主でも、個人練習に他人のログは入れられない');
select public.qa_logout();

-- =============================================================================
-- F milestone_achievements の FK
-- =============================================================================
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.milestone_achievements'::regclass and conname = 'milestone_achievements_practice_log_id_fkey'),
  'n', 'F-1: practice_log_id に ON DELETE SET NULL の FK がある');
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.milestone_achievements'::regclass and conname = 'milestone_achievements_record_id_fkey'),
  'n', 'F-2: record_id に ON DELETE SET NULL の FK がある');

-- =============================================================================
-- X 本番にだけあった関数
-- =============================================================================
select hasnt_function('public', 'set_published_at', 'X-1: set_published_at は無い');

select * from finish();
rollback;
