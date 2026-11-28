-- =============================================================================
-- pgTAP: record_feedbacks (チーム内フィードバック)
--
-- 対象 migration: 20261128000000_add_record_feedbacks.sql
-- 仕様: docs/specs/record-feedback.md
--
-- 実行: `supabase test db` (全フィクスチャは rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

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
--   ユーザー (末尾 id):
--     a1 admin1        team1 admin / approved / active
--     a2 admin_inact   team1 admin / approved / is_active=false (退会済み)
--     a3 admin_team2   team2 のみの admin
--     a4 admin2        team1 admin / approved / active (2人目)
--     a5 admin_pending team1 admin / pending
--   (20261201000003 以降 is_active は status / left_at と必ず一致するので、
--    pending は is_active=false、非アクティブの承認済みは left_at ありで作る)
--     p1 player        team1 の一般メンバー (FB を受ける選手)
--     p2 plain         team1 の一般メンバー (管理者ではない)
--   records:
--     r1 p1 の team1 記録
--     r2 p1 の個人記録 (team_id NULL)
--     r3 a1 自身の team1 記録 (自己 FB 禁止の検証用)
--     r4 p1 の team1 記録 (CASCADE 検証用)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
select ('aaaaaaaa-0000-4000-a000-0000000000' || suffix)::uuid, 'qa-fb-' || suffix || '@example.test'
from (values ('a1'),('a2'),('a3'),('a4'),('a5'),('c1'),('c2')) v(suffix);

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-fb-%@example.test'
on conflict (id) do nothing;

-- p1 = ...c1, p2 = ...c2
insert into public.teams (id, name, invite_code, created_by) values
  ('bbbbbbbb-0000-4000-a000-000000000001', 'QA FB Team1', 'QA-FB-T1-CODE', 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'QA FB Team2', 'QA-FB-T2-CODE', 'aaaaaaaa-0000-4000-a000-0000000000a3');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a1', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a2', 'admin', 'approved', false, '2026-01-01', '2026-06-01'),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000a3', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a4', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a5', 'admin', 'pending',  false, '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000c1', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000c2', 'user',  'approved', true,  '2026-01-01', null);

insert into public.competitions (id, title, date, pool_type, team_id, created_by) values
  ('cccccccc-0000-4000-a000-000000000001', 'QA FB Meet', '2026-10-01', 1,
    'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a1');

insert into public.records (id, user_id, competition_id, team_id, style_id, "time", pool_type, is_relaying) values
  ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000c1',
    'cccccccc-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001', 1, 27.50, 1, false),
  ('dddddddd-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000c1',
    null, null, 1, 28.00, 1, false),
  ('dddddddd-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-0000000000a1',
    'cccccccc-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001', 1, 26.00, 1, false),
  ('dddddddd-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-0000000000c1',
    'cccccccc-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001', 2, 60.00, 1, false);

-- =============================================================================
-- 作成 (INSERT)
-- =============================================================================
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');

select lives_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'スタートが良かった') $$,
  '現役の管理者はチーム記録に FB を書ける'
);

select public.qa_logout();
select is(
  (select team_id from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  'bbbbbbbb-0000-4000-a000-000000000001'::uuid,
  'team_id はトリガが records.team_id から埋める'
);
select is(
  (select recipient_id from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  'aaaaaaaa-0000-4000-a000-0000000000c1'::uuid,
  'recipient_id はトリガが records.user_id から埋める'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', '2件目') $$,
  '23505', null,
  '同じ人が同じ記録に2件目を書けない'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000002', '個人記録') $$,
  'P0001', 'not_team_record',
  '個人記録 (team_id NULL) には書けない'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000003', '自分の記録') $$,
  '42501', null,
  '自分の記録には書けない'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000004', '   ') $$,
  '23514', null,
  '空白だけの本文は書けない'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000004', repeat('あ', 1001)) $$,
  '23514', null,
  '1001 文字の本文は書けない'
);
select lives_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000004', repeat('あ', 1000)) $$,
  '1000 文字の本文は書ける'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, team_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000002', 'x') $$,
  '42501', null,
  'team_id はクライアントから指定できない (列単位 GRANT)'
);
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, author_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a4', 'なりすまし') $$,
  '42501', null,
  '他人を author_id にして書けない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a4');
select lives_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'ターンを意識して') $$,
  '別の管理者は同じ記録に FB を書ける (1記録に複数 FB)'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c2');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'x') $$,
  '42501', null,
  '管理者でないメンバーは書けない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a2');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'x') $$,
  '42501', null,
  '非アクティブな管理者は書けない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a5');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'x') $$,
  '42501', null,
  '承認待ちの管理者は書けない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a3');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'x') $$,
  '42501', null,
  '他チームの管理者は書けない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c1');
select throws_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', 'x') $$,
  '42501', null,
  '選手は自分の記録に FB を書けない'
);

-- =============================================================================
-- 閲覧 (SELECT / RPC)
-- =============================================================================
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c1');
select is(
  (select count(*)::int from public.record_feedbacks where record_id = 'dddddddd-0000-4000-a000-000000000001'),
  2, '選手本人は自分の記録の FB をすべて読める'
);
select is(
  (select count(*)::int from public.get_record_feedbacks('dddddddd-0000-4000-a000-000000000001')),
  2, 'get_record_feedbacks: 選手本人は2件取得できる'
);
select is(
  (select author_name from public.get_record_feedbacks('dddddddd-0000-4000-a000-000000000001')
    where author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  'qa-fb-a1@example.test', 'get_record_feedbacks は書いた人の名前を返す'
);
select is(
  (select count(*)::int from public.get_unread_record_feedbacks()),
  3, 'get_unread_record_feedbacks: 未読3件 (r1 に2件 + r4 に1件)'
);
select is(
  (select competition_title from public.get_unread_record_feedbacks() limit 1),
  'QA FB Meet', 'get_unread_record_feedbacks は大会名を返す'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a4');
select is(
  (select count(*)::int from public.record_feedbacks where record_id = 'dddddddd-0000-4000-a000-000000000001'),
  2, '同チームの管理者は他の管理者の FB も読める'
);
select is(
  (select count(*)::int from public.get_unread_record_feedbacks()),
  0, 'get_unread_record_feedbacks は自分宛てのものだけを返す'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c2');
select is(
  (select count(*)::int from public.record_feedbacks),
  0, '管理者でないチームメンバーは他人の FB を読めない'
);
select is(
  (select count(*)::int from public.get_record_feedbacks('dddddddd-0000-4000-a000-000000000001')),
  0, 'get_record_feedbacks: 権限の無い人には行が返らない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a3');
select is(
  (select count(*)::int from public.record_feedbacks),
  0, '他チームの管理者は FB を読めない'
);

select public.qa_login_anon();
select throws_ok(
  $$ select count(*) from public.record_feedbacks $$,
  '42501', null, 'anon はテーブルを読めない'
);
select throws_ok(
  $$ select * from public.get_unread_record_feedbacks() $$,
  '42501', null, 'anon は RPC を実行できない'
);

-- =============================================================================
-- 選手は編集・削除・既読の直接更新ができない
-- =============================================================================
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c1');
update public.record_feedbacks set content = '改ざん' where record_id = 'dddddddd-0000-4000-a000-000000000001';
delete from public.record_feedbacks where record_id = 'dddddddd-0000-4000-a000-000000000001';
select is(
  (select count(*)::int from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001' and content <> '改ざん'),
  2, '選手は FB を編集・削除できない (RLS で 0 行)'
);
select throws_ok(
  $$ update public.record_feedbacks set read_at = now() $$,
  '42501', null, 'read_at はクライアントから直接更新できない'
);

-- =============================================================================
-- 既読化と、編集による未読への戻り
-- =============================================================================
-- created_at / updated_at を過去にずらす (トランザクション内では now() が一定のため)
select public.qa_logout();
alter table public.record_feedbacks disable trigger record_feedbacks_before_update;
update public.record_feedbacks
  set created_at = '2026-10-02 00:00:00+00', updated_at = '2026-10-02 00:00:00+00';
alter table public.record_feedbacks enable trigger record_feedbacks_before_update;

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c1');
select is(
  public.mark_record_feedbacks_read('dddddddd-0000-4000-a000-000000000001'),
  2, 'mark_record_feedbacks_read は既読にした件数を返す'
);
select is(
  (select count(*)::int from public.get_unread_record_feedbacks()),
  1, '既読化した記録の FB は未読一覧から消える'
);
select is(
  (select count(*)::int from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and updated_at = '2026-10-02 00:00:00+00'),
  2, '既読化では updated_at が進まない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
select is(
  public.mark_record_feedbacks_read('dddddddd-0000-4000-a000-000000000001'),
  0, '本人以外は既読にできない'
);

update public.record_feedbacks set content = 'スタートが良かった (追記)'
  where record_id = 'dddddddd-0000-4000-a000-000000000001'
    and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1';

select public.qa_logout();
select ok(
  (select read_at is null and updated_at > created_at from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  '書いた本人は編集でき、編集すると未読に戻り updated_at が進む'
);
select ok(
  (select read_at is not null from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a4'),
  '他の FB の既読状態は変わらない'
);

-- =============================================================================
-- 編集・削除は書いた本人だけ
-- =============================================================================
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a4');
update public.record_feedbacks set content = '他人が編集'
  where record_id = 'dddddddd-0000-4000-a000-000000000001'
    and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1';
delete from public.record_feedbacks
  where record_id = 'dddddddd-0000-4000-a000-000000000001'
    and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1';
select public.qa_logout();
select is(
  (select content from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  'スタートが良かった (追記)', '同チームの別の管理者は他人の FB を編集・削除できない'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
select throws_ok(
  $$ update public.record_feedbacks set record_id = 'dddddddd-0000-4000-a000-000000000004'
     where author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1' $$,
  '42501', null, 'record_id は書き換えられない (列単位 GRANT)'
);

-- 退団した管理者は自分の FB でも編集・削除できない
select public.qa_logout();
-- 退会処理 (members.ts の leave / remove) と同じく is_active と left_at を一緒に書く
update public.team_memberships set is_active = false, left_at = '2026-11-01'
  where team_id = 'bbbbbbbb-0000-4000-a000-000000000001'
    and user_id = 'aaaaaaaa-0000-4000-a000-0000000000a4';
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a4');
delete from public.record_feedbacks where author_id = 'aaaaaaaa-0000-4000-a000-0000000000a4';
select is(
  (select count(*)::int from public.record_feedbacks),
  0, '退団した管理者は FB を読めない'
);
select public.qa_logout();
select is(
  (select count(*)::int from public.record_feedbacks where author_id = 'aaaaaaaa-0000-4000-a000-0000000000a4'),
  1, '退団した管理者は自分の FB を削除できない (FB は残る)'
);
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000c1');
select is(
  (select count(*)::int from public.get_record_feedbacks('dddddddd-0000-4000-a000-000000000001')
    where author_name = 'qa-fb-a4@example.test'),
  1, '書いた管理者が退団しても、選手本人には名前付きで見える'
);

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
delete from public.record_feedbacks
  where record_id = 'dddddddd-0000-4000-a000-000000000001'
    and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1';
select is(
  (select count(*)::int from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001'
      and author_id = 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  0, '書いた本人は自分の FB を削除できる'
);
select lives_ok(
  $$ insert into public.record_feedbacks (record_id, content)
     values ('dddddddd-0000-4000-a000-000000000001', '書き直し') $$,
  '削除後は同じ記録にもう一度書ける'
);

-- =============================================================================
-- ライフサイクル
-- =============================================================================
select public.qa_logout();

-- 書いた人のアカウント削除 → author_id が NULL になって FB は残る
delete from auth.users where id = 'aaaaaaaa-0000-4000-a000-0000000000a4';
select is(
  (select count(*)::int from public.record_feedbacks
    where record_id = 'dddddddd-0000-4000-a000-000000000001' and author_id is null),
  1, '書いた人のアカウントを削除しても FB は残り author_id が NULL になる'
);

-- 記録削除 → CASCADE
delete from public.records where id = 'dddddddd-0000-4000-a000-000000000004';
select is(
  (select count(*)::int from public.record_feedbacks where record_id = 'dddddddd-0000-4000-a000-000000000004'),
  0, '記録を削除すると FB も消える'
);

-- チーム削除 (記録は個人のデータとして残し、FB は消える)
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
select public.delete_team_preserving_records('bbbbbbbb-0000-4000-a000-000000000001');
select public.qa_logout();
select is(
  (select count(*)::int from public.record_feedbacks where record_id = 'dddddddd-0000-4000-a000-000000000001'),
  0, 'チームを削除すると FB も消える'
);
select ok(
  exists (select 1 from public.records where id = 'dddddddd-0000-4000-a000-000000000001' and team_id is null),
  'チーム削除後も記録は個人のデータとして残る'
);

select * from finish();
rollback;
