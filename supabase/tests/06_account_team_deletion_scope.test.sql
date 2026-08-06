-- =============================================================================
-- pgTAP: アカウント退会時のストレージ全削除 タスクの DB 側検証 (QA Sprint Contract V-05/V-06)
--
-- 対象:
--   - 20260218000000_prepare_account_deletion.sql (CASCADE → SET NULL)
--   - team_memberships.is_active = false (チーム退会) が何もデータを消さないこと
--
-- 観点:
--   V-05: チーム退会 (team_memberships.is_active=false) では
--         practices/practice_logs/records/entries/team_attendance/画像パス配列が
--         一切削除されないこと（DB行数の変化がゼロであること）。
--   V-06: チーム管理者(作成者)のアカウントを削除 (auth.users DELETE で実カスケードを再現)
--         しても、他メンバーの practice_logs / records / entries / team_attendance が
--         1件も失われないこと。practices/competitions 自体は削除されず
--         user_id/created_by が NULL になるだけで残ること (image_paths も保持される)。
--         削除された本人の practice_logs / records / entries / team_attendance は
--         CASCADE により削除される想定(自分のデータなので正しい)。
--
-- 方針: モックせず実際に auth.users から DELETE し、FK CASCADE / SET NULL の
-- 実際の挙動を確認する。rollback で全フィクスチャは消える。
--
-- 実行: `supabase test db` (ローカル Supabase 起動 + migration 適用済みの状態で)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- -----------------------------------------------------------------------------
-- フィクスチャ
--   team: qa-del-team (creator = admin_u)
--   admin_u: チーム作成者・管理者ロール。後で「アカウント削除」される対象。
--   member_u: 一般メンバー。admin_u作成の練習/大会に自分のログ・記録・エントリーを持つ。
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-4777-a777-000000000001', 'qa-del-admin@example.test'),
  ('77777777-7777-4777-a777-000000000002', 'qa-del-member@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-del-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('88888888-8888-4888-a888-000000000001', 'QA Del Team', 'QA-DEL-CODE-1', '77777777-7777-4777-a777-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('88888888-8888-4888-a888-000000000001', '77777777-7777-4777-a777-000000000001', 'admin', 'approved', true, '2026-01-01'),
  ('88888888-8888-4888-a888-000000000001', '77777777-7777-4777-a777-000000000002', 'user',  'approved', true, '2026-01-01');

-- admin_u が作成したチーム練習 (他メンバーがログを書き込む対象)
insert into public.practices (id, user_id, created_by, team_id, date, title, image_paths) values
  ('99999999-9999-4999-a999-000000000001', '77777777-7777-4777-a777-000000000001', '77777777-7777-4777-a777-000000000001',
   '88888888-8888-4888-a888-000000000001', '2026-07-01', 'QA Del Practice', '["practice-images/77777777-7777-4777-a777-000000000001/99999999-9999-4999-a999-000000000001/photo.jpg"]'::jsonb);

-- admin_u が作成したチーム大会
insert into public.competitions (id, user_id, created_by, team_id, date, title) values
  ('99999999-9999-4999-a999-000000000002', '77777777-7777-4777-a777-000000000001', '77777777-7777-4777-a777-000000000001',
   '88888888-8888-4888-a888-000000000001', '2026-07-05', 'QA Del Competition');

-- member_u の練習ログ・出欠・大会エントリー・記録 (admin_u作成のイベントに対して)
-- 注: team_attendance は practices/competitions 作成時のトリガー
-- (create_attendance_for_team_practice/competition) で全アクティブメンバー分が
-- 自動作成済みのため、INSERT ではなく UPDATE で id を固定する。
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('aaaaaaaa-1111-4aaa-a111-000000000001', '77777777-7777-4777-a777-000000000002', '99999999-9999-4999-a999-000000000001', 'Fr', 4, 1, 100);

update public.team_attendance set id = 'aaaaaaaa-1111-4aaa-a111-000000000002', status = 'present'
where practice_id = '99999999-9999-4999-a999-000000000001'
  and user_id = '77777777-7777-4777-a777-000000000002';

insert into public.entries (id, team_id, competition_id, user_id, style_id, entry_time) values
  ('aaaaaaaa-1111-4aaa-a111-000000000003', '88888888-8888-4888-a888-000000000001', '99999999-9999-4999-a999-000000000002', '77777777-7777-4777-a777-000000000002', 1, 30.00);

insert into public.records (id, user_id, competition_id, team_id, style_id, time, pool_type) values
  ('aaaaaaaa-1111-4aaa-a111-000000000004', '77777777-7777-4777-a777-000000000002', '99999999-9999-4999-a999-000000000002', '88888888-8888-4888-a888-000000000001', 1, 30.00, 0);

-- admin_u 自身の練習ログ・出欠・エントリー・記録 (自分のデータ、アカウント削除で消えるのが正しい)
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('aaaaaaaa-1111-4aaa-a111-000000000005', '77777777-7777-4777-a777-000000000001', '99999999-9999-4999-a999-000000000001', 'Br', 2, 1, 50);

update public.team_attendance set id = 'aaaaaaaa-1111-4aaa-a111-000000000006', status = 'present'
where practice_id = '99999999-9999-4999-a999-000000000001'
  and user_id = '77777777-7777-4777-a777-000000000001';

insert into public.entries (id, team_id, competition_id, user_id, style_id, entry_time) values
  ('aaaaaaaa-1111-4aaa-a111-000000000007', '88888888-8888-4888-a888-000000000001', '99999999-9999-4999-a999-000000000002', '77777777-7777-4777-a777-000000000001', 1, 28.00);

insert into public.records (id, user_id, competition_id, team_id, style_id, time, pool_type) values
  ('aaaaaaaa-1111-4aaa-a111-000000000008', '77777777-7777-4777-a777-000000000001', '99999999-9999-4999-a999-000000000002', '88888888-8888-4888-a888-000000000001', 1, 28.00, 0);

-- =============================================================================
-- V-05: チーム退会 (is_active=false) では何も消えない
-- =============================================================================

select is(
  (select count(*)::int from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  1,
  'V-05 前提: practices 行が存在する'
);

update public.team_memberships
set is_active = false, left_at = current_date
where team_id = '88888888-8888-4888-a888-000000000001'
  and user_id = '77777777-7777-4777-a777-000000000002';

select is(
  (select is_active from public.team_memberships
   where team_id = '88888888-8888-4888-a888-000000000001' and user_id = '77777777-7777-4777-a777-000000000002'),
  false,
  'V-05: team_memberships.is_active が false に更新される'
);

select is(
  (select count(*)::int from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  1,
  'V-05: チーム退会後も practices 行は削除されない'
);

select is(
  (select count(*)::int from public.practice_logs where id = 'aaaaaaaa-1111-4aaa-a111-000000000001'),
  1,
  'V-05: チーム退会後も退会者自身の practice_logs は削除されない'
);

select is(
  (select count(*)::int from public.team_attendance where id = 'aaaaaaaa-1111-4aaa-a111-000000000002'),
  1,
  'V-05: チーム退会後も退会者自身の team_attendance は削除されない'
);

select is(
  (select count(*)::int from public.entries where id = 'aaaaaaaa-1111-4aaa-a111-000000000003'),
  1,
  'V-05: チーム退会後も退会者自身の entries は削除されない'
);

select is(
  (select count(*)::int from public.records where id = 'aaaaaaaa-1111-4aaa-a111-000000000004'),
  1,
  'V-05: チーム退会後も退会者自身の records は削除されない'
);

select is(
  (select image_paths from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  '["practice-images/77777777-7777-4777-a777-000000000001/99999999-9999-4999-a999-000000000001/photo.jpg"]'::jsonb,
  'V-05: チーム退会後も image_paths は一切変更されない'
);

-- 退会状態を元に戻す (V-06 の前提を汚さないため)
update public.team_memberships
set is_active = true, left_at = null
where team_id = '88888888-8888-4888-a888-000000000001'
  and user_id = '77777777-7777-4777-a777-000000000002';

-- =============================================================================
-- V-06: チーム管理者(作成者)のアカウント削除で他メンバーのデータが残ること
-- =============================================================================

-- auth.users から実際に DELETE し、public.users への CASCADE 経由で
-- practices/competitions の SET NULL FK・他テーブルの CASCADE FK の実挙動を確認する。
delete from auth.users where id = '77777777-7777-4777-a777-000000000001';

select is(
  (select count(*)::int from public.users where id = '77777777-7777-4777-a777-000000000001'),
  0,
  'V-06 前提: public.users もCASCADEで削除された(auth.users削除が正しく波及している)'
);

select is(
  (select count(*)::int from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  1,
  'V-06: 作成者アカウント削除後も practices 行自体は削除されない'
);

select is(
  (select user_id from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  null,
  'V-06: practices.user_id は SET NULL される(CASCADEで行ごと消えない)'
);

select is(
  (select created_by from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  null,
  'V-06: practices.created_by も SET NULL される'
);

select is(
  (select count(*)::int from public.competitions where id = '99999999-9999-4999-a999-000000000002'),
  1,
  'V-06: 作成者アカウント削除後も competitions 行自体は削除されない'
);

select is(
  (select image_paths from public.practices where id = '99999999-9999-4999-a999-000000000001'),
  '["practice-images/77777777-7777-4777-a777-000000000001/99999999-9999-4999-a999-000000000001/photo.jpg"]'::jsonb,
  'V-06: 作成者アカウント削除後も image_paths は保持される(ストレージのファイル自体は別途Edge Functionで削除される想定)'
);

select is(
  (select count(*)::int from public.practice_logs where id = 'aaaaaaaa-1111-4aaa-a111-000000000001'),
  1,
  'V-06: 他メンバー(member_u)の practice_logs は1件も失われない'
);

select is(
  (select count(*)::int from public.team_attendance where id = 'aaaaaaaa-1111-4aaa-a111-000000000002'),
  1,
  'V-06: 他メンバーの team_attendance は1件も失われない'
);

select is(
  (select count(*)::int from public.entries where id = 'aaaaaaaa-1111-4aaa-a111-000000000003'),
  1,
  'V-06: 他メンバーの entries は1件も失われない'
);

select is(
  (select count(*)::int from public.records where id = 'aaaaaaaa-1111-4aaa-a111-000000000004'),
  1,
  'V-06: 他メンバーの records は1件も失われない'
);

-- 削除された本人 (admin_u) 自身のデータは CASCADE で消えるのが正しい仕様
select is(
  (select count(*)::int from public.practice_logs where id = 'aaaaaaaa-1111-4aaa-a111-000000000005'),
  0,
  'V-06 (回帰でない仕様確認): 削除された本人自身の practice_logs はCASCADEで削除される'
);

select is(
  (select count(*)::int from public.team_attendance where id = 'aaaaaaaa-1111-4aaa-a111-000000000006'),
  0,
  'V-06 (回帰でない仕様確認): 削除された本人自身の team_attendance はCASCADEで削除される'
);

select is(
  (select count(*)::int from public.entries where id = 'aaaaaaaa-1111-4aaa-a111-000000000007'),
  0,
  'V-06 (回帰でない仕様確認): 削除された本人自身の entries はCASCADEで削除される'
);

select is(
  (select count(*)::int from public.records where id = 'aaaaaaaa-1111-4aaa-a111-000000000008'),
  0,
  'V-06 (回帰でない仕様確認): 削除された本人自身の records はCASCADEで削除される'
);

select * from finish();
rollback;
