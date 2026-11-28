-- =============================================================================
-- pgTAP: 保護者アカウント (team_memberships.role = 'guardian') は閲覧専用
--
-- 対象 migration: 20261129000000_add_guardian_role.sql
--                  20261129000001_hide_guardian_from_teammates.sql
--
-- 確かめること:
--   - 保護者はチームメンバーと同じ範囲を読める
--   - 保護者は RLS 経由でも SECURITY DEFINER の RPC 経由でも書き込めない
--   - 一般メンバーの書き込みは今まで通り通る
--   - 練習・大会の出欠行は保護者の分を作らない
--   - 保護者のメールアドレス・パスワードは変えられない (運用者の解除フラグを除く)
--   - public の全テーブルに書き込み拒否トリガが付いている (テーブル追加時の付け忘れ検出)
--   - 保護者の membership 行とプロフィールは、本人以外 (選手・管理者) から DB を直接読んでも返らない
--
-- 実行: `supabase test db` (全フィクスチャは rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

create function public.qa_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function public.qa_login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create function public.qa_logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- -----------------------------------------------------------------------------
-- フィクスチャ (postgres = BYPASSRLS)
--   a1 admin     team1 の管理者
--   b1 member    team1 の一般メンバー (泳者)
--   c1 guardian  team1 の保護者 (閲覧専用)
--   a2 admin2    team2 の管理者 (保護者が参加申請する先)
--   records:
--     r1 b1 の team1 大会記録
--     r2 b1 の個人記録 (team_id NULL)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
select ('eeeeeeee-0000-4000-a000-0000000000' || suffix)::uuid, 'qa-guardian-' || suffix || '@example.test'
from (values ('a1'),('b1'),('c1'),('a2')) v(suffix);

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-guardian-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('ffffffff-0000-4000-a000-000000000001', 'QA Guardian Team1', 'QA-GD-T1-CODE', 'eeeeeeee-0000-4000-a000-0000000000a1'),
  ('ffffffff-0000-4000-a000-000000000002', 'QA Guardian Team2', 'QA-GD-T2-CODE', 'eeeeeeee-0000-4000-a000-0000000000a2');

insert into public.team_memberships (team_id, user_id, role, status, is_active, is_swimmer, joined_at) values
  ('ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000a1', 'admin',    'approved', true, true,  '2026-01-01'),
  ('ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000b1', 'user',     'approved', true, true,  '2026-01-01'),
  ('ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000c1', 'guardian', 'approved', true, false, '2026-01-01'),
  ('ffffffff-0000-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-0000000000a2', 'admin',    'approved', true, true,  '2026-01-01');

insert into public.competitions (id, title, date, pool_type, team_id, created_by) values
  ('abababab-0000-4000-a000-000000000001', 'QA Guardian Meet', '2026-10-01', 1,
    'ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000a1');

insert into public.records (id, user_id, competition_id, team_id, style_id, "time", pool_type, is_relaying) values
  ('cdcdcdcd-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000b1',
    'abababab-0000-4000-a000-000000000001', 'ffffffff-0000-4000-a000-000000000001', 1, 27.50, 1, false),
  ('cdcdcdcd-0000-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-0000000000b1',
    null, null, 1, 28.00, 1, false);

-- =============================================================================
-- 判定関数
-- =============================================================================
select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000c1');
select is(public.is_guardian_account(), true, '保護者は is_guardian_account() = true');

select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000b1');
select is(public.is_guardian_account(), false, '一般メンバーは is_guardian_account() = false');
select throws_ok(
  $$ select public.is_guardian_user('eeeeeeee-0000-4000-a000-0000000000c1') $$,
  '42501', null,
  '任意ユーザーを調べる is_guardian_user は authenticated から呼べない (保護者かどうかの推定を防ぐ)'
);

select public.qa_login_anon();
select throws_ok(
  $$ select public.is_guardian_account() $$,
  '42501', null,
  'anon は is_guardian_account を呼べない'
);

-- =============================================================================
-- 閲覧: チームメンバーと同じ範囲が見える
-- =============================================================================
select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000c1');
select is(
  (select count(*)::int from public.records where id = 'cdcdcdcd-0000-4000-a000-000000000001'),
  1,
  '保護者はチームの大会記録を読める'
);
select is(
  (select count(*)::int from public.records where id = 'cdcdcdcd-0000-4000-a000-000000000002'),
  1,
  '保護者はチームメンバーの個人記録を読める (一般メンバーと同じ範囲)'
);
select is(
  (select count(*)::int from public.competitions where id = 'abababab-0000-4000-a000-000000000001'),
  1,
  '保護者はチームの大会を読める'
);

-- =============================================================================
-- 書き込み: 保護者は一切できない
-- =============================================================================
select throws_ok(
  $$ insert into public.records (user_id, competition_id, team_id, style_id, "time", pool_type, is_relaying)
     values ('eeeeeeee-0000-4000-a000-0000000000c1', 'abababab-0000-4000-a000-000000000001',
             'ffffffff-0000-4000-a000-000000000001', 1, 30.00, 1, false) $$,
  '42501', 'guardian accounts are read-only',
  '保護者は記録を登録できない'
);
select throws_ok(
  $$ insert into public.practices (user_id, date, team_id, created_by)
     values ('eeeeeeee-0000-4000-a000-0000000000c1', '2026-10-02',
             'ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000c1') $$,
  '42501', 'guardian accounts are read-only',
  '保護者は練習を作れない'
);
select throws_ok(
  $$ update public.users set name = 'renamed' where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian accounts are read-only',
  '保護者は自分のプロフィールも変えられない'
);
select throws_ok(
  $$ update public.team_memberships set role = 'user'
     where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian accounts are read-only',
  '保護者は自分の membership を user に書き換えて保護者版を抜けられない'
);
select throws_ok(
  $$ update public.team_memberships set is_active = false
     where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian accounts are read-only',
  '保護者は自分でチームを抜けられない'
);
select throws_ok(
  $$ delete from public.records where id = 'cdcdcdcd-0000-4000-a000-000000000001' $$,
  '42501', 'guardian accounts are read-only',
  '保護者は記録を削除できない (対象行が見えていても)'
);
select throws_ok(
  $$ insert into public.team_attendance (competition_id, user_id, status)
     values ('abababab-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000c1', 'present') $$,
  '42501', 'guardian accounts are read-only',
  '保護者は出欠を回答できない'
);
select throws_ok(
  $$ select public.mark_record_feedbacks_read('cdcdcdcd-0000-4000-a000-000000000001') $$,
  '42501', 'guardian accounts are read-only',
  '保護者は SECURITY DEFINER の RPC 経由でも書き込めない (RLS を通らない UPDATE)'
);
-- request_join_team は中で例外を捕まえて success=false を返す作り
select is(
  (public.request_join_team('QA-GD-T2-CODE')->>'success')::boolean,
  false,
  '保護者は他チームへ参加申請できない (RPC の中の INSERT がトリガで止まる)'
);

select public.qa_logout();
select is(
  (select count(*)::int from public.team_memberships
    where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'
      and team_id = 'ffffffff-0000-4000-a000-000000000002'),
  0,
  '参加申請の行は作られていない'
);

-- =============================================================================
-- 一般メンバーは今まで通り書き込める
-- =============================================================================
select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000b1');
select lives_ok(
  $$ insert into public.records (user_id, competition_id, team_id, style_id, "time", pool_type, is_relaying)
     values ('eeeeeeee-0000-4000-a000-0000000000b1', null, null, 2, 61.00, 1, false) $$,
  '一般メンバーは自分の記録を登録できる'
);
select lives_ok(
  $$ update public.users set name = 'member renamed' where id = 'eeeeeeee-0000-4000-a000-0000000000b1' $$,
  '一般メンバーは自分のプロフィールを変えられる'
);

-- =============================================================================
-- 出欠行の自動作成から保護者を外す
-- =============================================================================
select public.qa_logout();
insert into public.practices (id, user_id, date, team_id, created_by) values
  ('a0a0a0a0-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000a1', '2026-10-03',
   'ffffffff-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-0000000000a1');

select is(
  (select count(*)::int from public.team_attendance
    where practice_id = 'a0a0a0a0-0000-4000-a000-000000000001'
      and user_id = 'eeeeeeee-0000-4000-a000-0000000000b1'),
  1,
  'チーム練習を作ると一般メンバーの出欠行はできる'
);
select is(
  (select count(*)::int from public.team_attendance
    where practice_id = 'a0a0a0a0-0000-4000-a000-000000000001'
      and user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  'チーム練習を作っても保護者の出欠行はできない'
);
select is(
  (select count(*)::int from public.team_attendance
    where competition_id = 'abababab-0000-4000-a000-000000000001'
      and user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  'チーム大会を作っても保護者の出欠行はできない'
);

-- =============================================================================
-- 保護者は必ず非泳者
-- =============================================================================
select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active, is_swimmer)
     values ('ffffffff-0000-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-0000000000b1',
             'guardian', 'approved', true, true) $$,
  '23514', null,
  'is_swimmer = true の保護者は作れない'
);

-- =============================================================================
-- ログイン情報 (auth.users)
-- =============================================================================
select throws_ok(
  $$ update auth.users set encrypted_password = 'changed'
     where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian account credentials cannot be changed',
  '保護者のパスワードは変えられない'
);
select throws_ok(
  $$ update auth.users set email = 'qa-guardian-other@example.test'
     where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian account credentials cannot be changed',
  '保護者のメールアドレスは変えられない'
);
select throws_ok(
  $$ update auth.users set email_change = 'qa-guardian-other@example.test'
     where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian account credentials cannot be changed',
  '保護者のメールアドレス変更の申請もできない'
);
select throws_ok(
  $$ delete from auth.users where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '42501', 'guardian accounts cannot be deleted',
  '保護者アカウントは削除できない'
);
select lives_ok(
  $$ update auth.users set encrypted_password = 'changed'
     where id = 'eeeeeeee-0000-4000-a000-0000000000b1' $$,
  '一般メンバーのパスワードは今まで通り変えられる'
);

select set_config('swimhub.allow_guardian_credential_change', 'on', true);
select lives_ok(
  $$ update auth.users set encrypted_password = 'rotated'
     where id = 'eeeeeeee-0000-4000-a000-0000000000c1' $$,
  '運用者は解除フラグを立てれば保護者のパスワードを変えられる'
);
select set_config('swimhub.allow_guardian_credential_change', '', true);

-- =============================================================================
-- テーブルを追加したときの付け忘れ検出
-- =============================================================================
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and not exists (
        select 1 from pg_trigger t
         where t.tgrelid = c.oid
           and t.tgname = 'guardian_read_only_guard'
           and not t.tgisinternal
      )),
  null::text[],
  'public の全テーブルに guardian_read_only_guard トリガが付いている (新しいテーブルにも付けること)'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'Guardian accounts cannot %'
      and permissive = 'RESTRICTIVE'),
  3,
  'storage.objects に保護者の INSERT / UPDATE / DELETE を拒否する RESTRICTIVE ポリシーがある'
);

-- =============================================================================
-- 選手・管理者からは、DB を直接読んでも保護者が見えない
-- =============================================================================
select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000b1');
select is(
  (select count(*)::int from public.team_memberships
    where team_id = 'ffffffff-0000-4000-a000-000000000001'
      and user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  '選手は保護者の membership 行を読めない'
);
select is(
  (select count(*)::int from public.team_memberships
    where team_id = 'ffffffff-0000-4000-a000-000000000001' and role = 'guardian'),
  0,
  '選手が role = guardian で絞っても 1 行も返らない'
);
select is(
  (select count(*)::int from public.team_memberships
    where team_id = 'ffffffff-0000-4000-a000-000000000001'),
  2,
  '選手には保護者以外のメンバー (管理者と自分) は今まで通り見える'
);
select is(
  (select count(*)::int from public.users where id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  '選手は保護者のプロフィール (名前) を読めない'
);
select is(
  (select count(*)::int from public.users where id = 'eeeeeeee-0000-4000-a000-0000000000a1'),
  1,
  '選手は同じチームの管理者のプロフィールを今まで通り読める'
);

select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000a1');
select is(
  (select count(*)::int from public.team_memberships
    where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  '管理者からも保護者の membership 行は見えない (キャプテンなど生徒が管理者のこともある)'
);
select is(
  (select count(*)::int from public.users where id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  0,
  '管理者からも保護者のプロフィールは見えない'
);

select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000c1');
select is(
  (select count(*)::int from public.team_memberships
    where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'),
  1,
  '保護者本人は自分の membership 行を読める (保護者版で出すチームを決めるため)'
);
select is(
  (select count(*)::int from public.team_memberships
    where team_id = 'ffffffff-0000-4000-a000-000000000001' and user_id <> 'eeeeeeee-0000-4000-a000-0000000000c1'),
  2,
  '保護者はチームのメンバー (管理者・選手) を読める'
);
select is(
  (select count(*)::int from public.users where id = 'eeeeeeee-0000-4000-a000-0000000000b1'),
  1,
  '保護者は選手のプロフィールを読める'
);

-- =============================================================================
-- 解除: 運用者が DB で保護者の membership を消すと、普通のアカウントに戻る
-- =============================================================================
select public.qa_logout();
delete from public.team_memberships
 where user_id = 'eeeeeeee-0000-4000-a000-0000000000c1'
   and team_id = 'ffffffff-0000-4000-a000-000000000001';

select public.qa_login_as('eeeeeeee-0000-4000-a000-0000000000c1');
select is(public.is_guardian_account(), false, '外した後は保護者ではない');

select * from finish();
rollback;
