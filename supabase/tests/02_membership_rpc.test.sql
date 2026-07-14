-- =============================================================================
-- pgTAP: request_join_team / reactivate_own_membership RPC の実DB検証（回帰固定）
--
-- 対象 migration: 20260706000000_membership_join_reactivate_rpc.sql
--
-- 方針:
--   - SECURITY DEFINER RPC を実際に authenticated ロール + JWT クレームで呼び、
--     戻り値 jsonb と DB 実状態の両方を検証する（モック不使用）。
--   - reactivate ゲートは「現状の挙動を正として固定」する回帰テスト。
--     製品仕様として「除名済み(approved/inactive/left_at 記録済み)メンバーの
--     再加入は許容」と決定済みのため、ゲートを厳しくする方向のテストは書かない。
--
-- 実行: `supabase test db`（migration 適用済みローカル DB）。全て rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- -----------------------------------------------------------------------------
-- ヘルパー（rollback で消える）
-- -----------------------------------------------------------------------------
create function public.qa_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- authenticated ロールだが JWT クレーム無し = auth.uid() が NULL の状態を作る
create function public.qa_login_authenticated_no_claims() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
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
-- フィクスチャ
--   team1(invite='QA-RPC-CODE-1'): owner_admin
--   users: owner_admin, joiner(未所属), rejected_u(rejected), left_u(退会=approved/inactive/left_at有),
--          removed_u(除名=approved/inactive/left_at有), pending_u(pending/left_at無), active_u(approved/active)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('55555555-5555-4555-a555-000000000001', 'qa-rpc-owner@example.test'),
  ('55555555-5555-4555-a555-000000000002', 'qa-rpc-joiner@example.test'),
  ('55555555-5555-4555-a555-000000000003', 'qa-rpc-rejected@example.test'),
  ('55555555-5555-4555-a555-000000000004', 'qa-rpc-left@example.test'),
  ('55555555-5555-4555-a555-000000000005', 'qa-rpc-removed@example.test'),
  ('55555555-5555-4555-a555-000000000006', 'qa-rpc-pending@example.test'),
  ('55555555-5555-4555-a555-000000000007', 'qa-rpc-active@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-rpc-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('66666666-6666-4666-a666-000000000001', 'QA RPC Team1', 'QA-RPC-CODE-1', '55555555-5555-4555-a555-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000001', 'admin', 'approved', true,  '2026-01-01', null),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000003', 'user',  'rejected', false, '2026-04-01', null),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000004', 'user',  'approved', false, '2026-01-01', '2026-06-01'),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000005', 'user',  'approved', false, '2026-01-01', '2026-06-15'),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000006', 'user',  'pending',  false, '2026-05-01', null),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000007', 'user',  'approved', true,  '2026-03-01', null);

-- =============================================================================
-- G. request_join_team: 新規参加申請 + 招待コード btrim/検証
-- =============================================================================
select public.qa_login_as('55555555-5555-4555-a555-000000000002'); -- joiner (未所属)

-- 前後空白付きの入力でも btrim して照合されるため一致する
select is(
  public.request_join_team('   QA-RPC-CODE-1   ')->>'success',
  'true',
  'G-1: 前後に空白を含む招待コードでも btrim され新規参加申請が成功する');

select public.qa_logout();

-- 新規行は必ず pending / is_active=false / role=user（自己承認スキップの入口を作らない）
select results_eq(
  $$ select role, status::text, is_active, left_at
     from public.team_memberships
     where team_id = '66666666-6666-4666-a666-000000000001'
       and user_id = '55555555-5555-4555-a555-000000000002' $$,
  $$ values ('user'::text, 'pending'::text, false, null::date) $$,
  'G-2: 作成された行は role=user / pending / inactive / left_at=null');

select public.qa_login_as('55555555-5555-4555-a555-000000000002'); -- joiner (今は pending)

-- pending 枝は no-op（重複申請を作らない）
select is(
  public.request_join_team('QA-RPC-CODE-1')->>'error',
  '既に参加申請中です。承認をお待ちください',
  'G-3: 既に pending のユーザーが再申請しても pending 枝の no-op メッセージが返る');

select public.qa_logout();

select is(
  (select count(*)::int from public.team_memberships
   where team_id = '66666666-6666-4666-a666-000000000001'
     and user_id = '55555555-5555-4555-a555-000000000002'),
  1,
  'G-4: pending 枝 no-op のため重複行は作られない (1 行のまま)');

-- 招待コード不一致
select public.qa_login_as('55555555-5555-4555-a555-000000000002');
select is(
  public.request_join_team('WRONG-CODE-XYZ')->>'error',
  '招待コードが正しくありません',
  'G-5: 存在しない招待コードは汎用エラー（チームの存在有無を漏らさない）');

-- 空文字・空白のみ
select is(
  public.request_join_team('   ')->>'error',
  '招待コードが正しくありません',
  'G-6: 空白のみの招待コードは btrim 後に空判定で拒否される');

select is(
  public.request_join_team('')->>'error',
  '招待コードが正しくありません',
  'G-7: 空文字の招待コードは拒否される');

select is(
  public.request_join_team(null)->>'error',
  '招待コードが正しくありません',
  'G-8: NULL 招待コードは拒否される');
select public.qa_logout();

-- =============================================================================
-- H. request_join_team: rejected 枝の再申請 / approved&active / 退会済み再加入
-- =============================================================================
select public.qa_login_as('55555555-5555-4555-a555-000000000003'); -- rejected_u
select is(
  public.request_join_team('QA-RPC-CODE-1')->>'success',
  'true',
  'H-1: rejected ユーザーが招待コードで再申請すると成功する');
select public.qa_logout();

-- rejected → pending へ更新され、role は user のまま（昇格しない）
select results_eq(
  $$ select role, status::text, is_active
     from public.team_memberships
     where team_id = '66666666-6666-4666-a666-000000000001'
       and user_id = '55555555-5555-4555-a555-000000000003' $$,
  $$ values ('user'::text, 'pending'::text, false) $$,
  'H-2: rejected 再申請後は pending / inactive / role=user');

select public.qa_login_as('55555555-5555-4555-a555-000000000007'); -- active_u
select is(
  public.request_join_team('QA-RPC-CODE-1')->>'error',
  '既にこのチームに参加しています',
  'H-3: 既に approved+active のユーザーは参加済みエラー（no-op）');
select public.qa_logout();

select public.qa_login_as('55555555-5555-4555-a555-000000000004'); -- left_u (退会済み)
-- 退会済みメンバーが招待コード提示で再加入 → 即 approved+active（仕様=許容として固定）
select is(
  public.request_join_team('QA-RPC-CODE-1')->'membership'->>'status',
  'approved',
  'H-4: 退会済みメンバーが招待コードで再加入すると即 approved になる（仕様許容・現挙動固定）');
select public.qa_logout();

select results_eq(
  $$ select status::text, is_active, left_at
     from public.team_memberships
     where team_id = '66666666-6666-4666-a666-000000000001'
       and user_id = '55555555-5555-4555-a555-000000000004' $$,
  $$ values ('approved'::text, true, null::date) $$,
  'H-5: 退会済み再加入後は approved/active/left_at=null に更新される');

-- =============================================================================
-- I. 認証ガード + GRANT 層防御（未認証・anon）
-- =============================================================================
-- authenticated ロールだが JWT 無し = auth.uid() NULL → 関数内ガードで拒否
select public.qa_login_authenticated_no_claims();
select is(
  public.request_join_team('QA-RPC-CODE-1')->>'error',
  '認証が必要です',
  'I-1: auth.uid() が NULL のとき request_join_team は認証エラーを返す（関数内ガード）');
select is(
  public.reactivate_own_membership('66666666-6666-4666-a666-000000000001')->>'error',
  '認証が必要です',
  'I-2: auth.uid() が NULL のとき reactivate_own_membership は認証エラーを返す');
select public.qa_logout();

-- anon は EXECUTE を REVOKE 済み → GRANT 層で実行拒否（多層防御）
select public.qa_login_anon();
select throws_ok(
  $$ select public.request_join_team('QA-RPC-CODE-1') $$,
  '42501', null,
  'I-3: anon は request_join_team を EXECUTE できない（GRANT 剥奪）');
select throws_ok(
  $$ select public.reactivate_own_membership('66666666-6666-4666-a666-000000000001') $$,
  '42501', null,
  'I-4: anon は reactivate_own_membership を EXECUTE できない（GRANT 剥奪）');
select public.qa_logout();

-- =============================================================================
-- J. reactivate_own_membership ゲート（現挙動の固定）
-- =============================================================================
-- J-1: pending(left_at=NULL) は再アクティブ化できない = 自己承認スキップ不可（#38 A2b）
select public.qa_login_as('55555555-5555-4555-a555-000000000006'); -- pending_u
select is(
  public.reactivate_own_membership('66666666-6666-4666-a666-000000000001')->>'error',
  '再アクティブ化できるメンバーシップではありません',
  'J-1: pending(left_at=NULL) は reactivate ゲートで弾かれる（承認スキップ不可）');
select public.qa_logout();

select results_eq(
  $$ select status::text, is_active
     from public.team_memberships
     where team_id = '66666666-6666-4666-a666-000000000001'
       and user_id = '55555555-5555-4555-a555-000000000006' $$,
  $$ values ('pending'::text, false) $$,
  'J-2: reactivate 失敗後も pending 行は変化していない');

-- J-3: 除名/退会済み(approved/inactive/left_at 記録済み) は再アクティブ化できる（仕様=許容として固定）
select public.qa_login_as('55555555-5555-4555-a555-000000000005'); -- removed_u
select is(
  public.reactivate_own_membership('66666666-6666-4666-a666-000000000001')->'membership'->>'is_active',
  'true',
  'J-3: 除名/退会済みメンバーは reactivate で再アクティブ化できる（仕様許容・現挙動固定）');
select public.qa_logout();

select results_eq(
  $$ select status::text, is_active, left_at
     from public.team_memberships
     where team_id = '66666666-6666-4666-a666-000000000001'
       and user_id = '55555555-5555-4555-a555-000000000005' $$,
  $$ values ('approved'::text, true, null::date) $$,
  'J-4: reactivate 成功後は approved/active/left_at=null');

-- J-5: 存在しない team_id はメンバーシップ無しエラー
select public.qa_login_as('55555555-5555-4555-a555-000000000007'); -- active_u
select is(
  public.reactivate_own_membership('66666666-6666-4666-a666-0000000000ff')->>'error',
  'メンバーシップが見つかりません',
  'J-5: 未所属チームの reactivate はメンバーシップ無しエラー');

-- J-6: active な自分のメンバーシップは reactivate 対象外（is_active=false 条件を満たさない）
select is(
  public.reactivate_own_membership('66666666-6666-4666-a666-000000000001')->>'error',
  '再アクティブ化できるメンバーシップではありません',
  'J-6: 既に active なメンバーシップは reactivate ゲートで弾かれる');
select public.qa_logout();

-- =============================================================================
-- K. SQLERRM 汎用化: 内部エラー詳細をクライアントに漏らさない
--    テスト用に一時トリガーで team_memberships INSERT を必ず失敗させ、
--    WHEN OTHERS 経路の戻り値に内部トークンが含まれないことを検証する。
--    （migration の関数・ポリシーは変更しない。トリガーは rollback で消える）
-- =============================================================================
create function public.qa_leak_trigger() returns trigger language plpgsql as $$
begin
  raise exception 'QA_SENSITIVE_LEAK_TOKEN internal_column=% role=%', TG_OP, current_user;
end $$;

create trigger qa_leak_bi before insert on public.team_memberships
  for each row execute function public.qa_leak_trigger();

-- 新規 joiner をもう一人用意（INSERT 枝に確実に入るユーザー）
insert into auth.users (id, email) values
  ('55555555-5555-4555-a555-0000000000ee', 'qa-rpc-leakprobe@example.test');
insert into public.users (id, name)
values ('55555555-5555-4555-a555-0000000000ee', 'qa-rpc-leakprobe@example.test')
on conflict (id) do nothing;

select public.qa_login_as('55555555-5555-4555-a555-0000000000ee');

select is(
  public.request_join_team('QA-RPC-CODE-1')->>'error',
  '処理中にエラーが発生しました',
  'K-1: 内部例外発生時は汎用エラーメッセージのみ返す');

select isnt(
  public.request_join_team('QA-RPC-CODE-1')->>'error',
  null,
  'K-2: 例外時も success/error 構造の jsonb を返す（未捕捉例外を外へ漏らさない）');

select ok(
  position('QA_SENSITIVE_LEAK_TOKEN' in (public.request_join_team('QA-RPC-CODE-1')->>'error')) = 0,
  'K-3: 戻り値の error に内部トークン(QA_SENSITIVE_LEAK_TOKEN)が含まれない');

select ok(
  position('current_user' in (public.request_join_team('QA-RPC-CODE-1')->>'error')) = 0
  and position('team_memberships' in (public.request_join_team('QA-RPC-CODE-1')->>'error')) = 0,
  'K-4: 戻り値の error に内部実装名(current_user / team_memberships)が含まれない');

select public.qa_logout();

drop trigger qa_leak_bi on public.team_memberships;

select * from finish();
rollback;
