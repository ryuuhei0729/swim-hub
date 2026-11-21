-- =============================================================================
-- pgTAP: 大会の水路変更が記録の水路に追従することの検証
--
-- 対象 migration: 20261121000000_sync_record_pool_type_with_competition.sql
--
-- 不具合: 短水路で記録を登録したあと大会を長水路に変更しても、記録
--         (records.pool_type / relay_records.pool_type) は短水路のまま残っていた。
--
-- 観点:
--   V-01: 個人大会の所有者が水路を変えると、その大会の records が追従する。
--   V-02: 他の大会の records は変わらない。
--   V-03: チーム大会の admin が水路を変えると、他メンバー所有の records と
--         relay_records も追従する (records の UPDATE RLS は本人行のみだが、
--         大会の更新権限があれば揃えられる)。
--   V-04: 大会を更新できない人 (チームの一般メンバー) の UPDATE は RLS で 0 行になり、
--         記録の水路も変わらない (トリガー経由で権限昇格しない)。
--   V-05: 水路以外の列だけを更新しても記録の水路は変わらない。
--   V-06: トリガー関数は authenticated から直接 EXECUTE できない。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
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
--   owner_u  : 個人大会 personal_comp の所有者 / team1 の admin (team_comp 作成者)
--   member_u : team1 の一般メンバー。team_comp に自分の records を持つ
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c1100000-0000-4000-a000-000000000001', 'qa-poolsync-owner@example.test'),
  ('c1100000-0000-4000-a000-000000000002', 'qa-poolsync-member@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-poolsync-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('d1100000-0000-4000-a000-000000000001', 'QA PoolSync Team1', 'QA-POOLSYNC-T1',
   'c1100000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('d1100000-0000-4000-a000-000000000001', 'c1100000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01'),
  ('d1100000-0000-4000-a000-000000000001', 'c1100000-0000-4000-a000-000000000002', 'user',  'approved', true, '2026-01-01');

insert into public.competitions (id, user_id, team_id, title, date, pool_type) values
  ('e1100000-0000-4000-a000-000000000001', 'c1100000-0000-4000-a000-000000000001', null,
   'QA個人大会', '2026-07-01', 0),
  ('e1100000-0000-4000-a000-000000000002', 'c1100000-0000-4000-a000-000000000001', null,
   'QA個人大会(無関係)', '2026-07-02', 0),
  ('e1100000-0000-4000-a000-000000000003', 'c1100000-0000-4000-a000-000000000001',
   'd1100000-0000-4000-a000-000000000001', 'QAチーム大会', '2026-07-03', 0);

insert into public.records (id, user_id, competition_id, team_id, style_id, time, pool_type) values
  ('f1100000-0000-4000-a000-000000000001', 'c1100000-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000001', null, 1, 30.01, 0),
  ('f1100000-0000-4000-a000-000000000002', 'c1100000-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000001', null, 1, 30.02, 0),
  ('f1100000-0000-4000-a000-000000000003', 'c1100000-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000002', null, 1, 30.03, 0),
  ('f1100000-0000-4000-a000-000000000011', 'c1100000-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000003', 'd1100000-0000-4000-a000-000000000001', 1, 31.01, 0),
  ('f1100000-0000-4000-a000-000000000012', 'c1100000-0000-4000-a000-000000000002', 'e1100000-0000-4000-a000-000000000003', 'd1100000-0000-4000-a000-000000000001', 1, 31.02, 0);

insert into public.relay_records (id, team_id, competition_id, relay_kind, leg_distance, pool_type, gender_category, total_time) values
  ('a1100000-0000-4000-a000-000000000001', 'd1100000-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000003',
   'free', 50, 0, 'male', 100.00);

-- =============================================================================
-- V-04: 一般メンバーはチーム大会を更新できず、記録の水路も変わらない
-- =============================================================================
select public.qa_login_as('c1100000-0000-4000-a000-000000000002');
update public.competitions set pool_type = 1 where id = 'e1100000-0000-4000-a000-000000000003';
select public.qa_logout();

select is(
  (select pool_type::int from public.competitions where id = 'e1100000-0000-4000-a000-000000000003'),
  0,
  'V-04: 一般メンバーの UPDATE は RLS で弾かれ大会の水路は変わらない'
);
select is(
  (select count(*)::int from public.records
    where competition_id = 'e1100000-0000-4000-a000-000000000003' and pool_type = 0),
  2,
  'V-04: 一般メンバーの UPDATE では記録の水路も変わらない'
);

-- =============================================================================
-- V-05: 水路以外の列だけの更新では記録は変わらない
-- =============================================================================
select public.qa_login_as('c1100000-0000-4000-a000-000000000001');
update public.competitions set title = 'QA個人大会(改)' where id = 'e1100000-0000-4000-a000-000000000001';
select public.qa_logout();

select is(
  (select count(*)::int from public.records
    where competition_id = 'e1100000-0000-4000-a000-000000000001' and pool_type = 0),
  2,
  'V-05: タイトルだけの更新では記録の水路は変わらない'
);

-- =============================================================================
-- V-01 / V-02: 個人大会を長水路に変更
-- =============================================================================
select public.qa_login_as('c1100000-0000-4000-a000-000000000001');
update public.competitions set pool_type = 1 where id = 'e1100000-0000-4000-a000-000000000001';
select public.qa_logout();

select is(
  (select count(*)::int from public.records
    where competition_id = 'e1100000-0000-4000-a000-000000000001' and pool_type = 1),
  2,
  'V-01: 個人大会を長水路にすると、その大会の記録も長水路になる'
);
select is(
  (select pool_type::int from public.records where id = 'f1100000-0000-4000-a000-000000000003'),
  0,
  'V-02: 別の大会の記録は短水路のまま'
);
select is(
  (select pool_type::int from public.records where id = 'f1100000-0000-4000-a000-000000000011'),
  0,
  'V-02: チーム大会の記録は短水路のまま'
);

-- 短水路に戻すと記録も戻る
select public.qa_login_as('c1100000-0000-4000-a000-000000000001');
update public.competitions set pool_type = 0 where id = 'e1100000-0000-4000-a000-000000000001';
select public.qa_logout();

select is(
  (select count(*)::int from public.records
    where competition_id = 'e1100000-0000-4000-a000-000000000001' and pool_type = 0),
  2,
  'V-01: 短水路に戻すと記録も短水路に戻る'
);

-- =============================================================================
-- V-03: チーム大会の admin が長水路に変更
-- =============================================================================
select public.qa_login_as('c1100000-0000-4000-a000-000000000001');
update public.competitions set pool_type = 1 where id = 'e1100000-0000-4000-a000-000000000003';
select public.qa_logout();

select is(
  (select pool_type::int from public.records where id = 'f1100000-0000-4000-a000-000000000011'),
  1,
  'V-03: admin 自身の記録が長水路になる'
);
select is(
  (select pool_type::int from public.records where id = 'f1100000-0000-4000-a000-000000000012'),
  1,
  'V-03: 他メンバー所有の記録も長水路になる'
);
select is(
  (select pool_type::int from public.relay_records where id = 'a1100000-0000-4000-a000-000000000001'),
  1,
  'V-03: リレー記録も長水路になる'
);

-- =============================================================================
-- V-06: トリガー関数は直接呼べない
-- =============================================================================
select is(
  has_function_privilege('authenticated', 'public.sync_record_pool_type_with_competition()', 'EXECUTE'),
  false,
  'V-06: authenticated はトリガー関数を直接 EXECUTE できない'
);

select * from finish();
rollback;
