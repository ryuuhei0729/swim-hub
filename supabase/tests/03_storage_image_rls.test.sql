-- =============================================================================
-- pgTAP: 画像バケット private 化 + storage.objects 所有者スコープ RLS の実DB検証
--
-- 対象 migration: 20260706000001_privatize_image_buckets.sql
--   - profile-images / practice-images / competition-images を private 化
--   - SELECT/INSERT/UPDATE/DELETE を "{userId}/..." 先頭セグメント所有者に限定
--   - profile-images に file_size_limit(5MB) / allowed_mime_types を設定
--
-- 方針:
--   - 実際の storage.objects RLS を authenticated/anon で評価。
--   - 攻撃者視点: 他人のフォルダの画像は見えない/入れられない。未認証は一切見えない。
--   - INSERT/UPDATE/DELETE は WITH CHECK/USING が false のとき 42501 で拒否される。
--
-- 実行: `supabase test db`（migration 適用済みローカル DB）。全て rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

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
-- L. バケットが private 化され、profile-images の制限値が実装と一致する（回帰）
-- -----------------------------------------------------------------------------
select is(
  (select bool_or(public) from storage.buckets
   where id in ('profile-images', 'practice-images', 'competition-images')),
  false,
  'L-1: 画像 3 バケットはいずれも public=false（署名URL経由のみ）');

select is(
  (select file_size_limit from storage.buckets where id = 'profile-images'),
  5242880::bigint,
  'L-2: profile-images の file_size_limit は 5MB（API 実装値と一致）');

select is(
  (select allowed_mime_types from storage.buckets where id = 'profile-images'),
  ARRAY['image/jpeg', 'image/png', 'image/webp'],
  'L-3: profile-images の allowed_mime_types が jpeg/png/webp に設定されている');

-- -----------------------------------------------------------------------------
-- フィクスチャ: owner が自分のフォルダに 3 バケット分の画像を投入
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-4777-a777-000000000001', 'qa-storage-owner@example.test'),
  ('77777777-7777-4777-a777-000000000002', 'qa-storage-other@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-storage-%@example.test'
on conflict (id) do nothing;

-- owner として自分のフォルダにアップロード（INSERT RLS の正常系も兼ねる）
select public.qa_login_as('77777777-7777-4777-a777-000000000001');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-images', '77777777-7777-4777-a777-000000000001/avatar.png') $$,
  'M-1: 所有者は自分のフォルダに profile 画像をアップロードできる（回帰）');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('practice-images', '77777777-7777-4777-a777-000000000001/practice.png') $$,
  'M-2: 所有者は自分のフォルダに practice 画像をアップロードできる（回帰）');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('competition-images', '77777777-7777-4777-a777-000000000001/comp.png') $$,
  'M-3: 所有者は自分のフォルダに competition 画像をアップロードできる（回帰）');

-- owner は自分の画像を SELECT できる
select is(
  (select count(*)::int from storage.objects
   where name like '77777777-7777-4777-a777-000000000001/%'
     and bucket_id in ('profile-images', 'practice-images', 'competition-images')),
  3,
  'M-4: 所有者は自分の 3 画像すべてを SELECT できる');

-- owner は他人のフォルダにはアップロードできない（先頭セグメント不一致）
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-images', '77777777-7777-4777-a777-000000000002/evil.png') $$,
  '42501', null,
  'M-5: 所有者でも他人のフォルダ配下にはアップロードできない（WITH CHECK 拒否）');

select public.qa_logout();

-- -----------------------------------------------------------------------------
-- N. 他ユーザーは所有者の画像を一切参照/更新/削除できない
-- -----------------------------------------------------------------------------
select public.qa_login_as('77777777-7777-4777-a777-000000000002'); -- other

select is(
  (select count(*)::int from storage.objects
   where name like '77777777-7777-4777-a777-000000000001/%'),
  0,
  'N-1: 別ユーザーからは所有者の画像が 1 件も見えない（所有者スコープ SELECT）');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'profile-images'),
  0,
  'N-2: 別ユーザーには profile-images バケットの他人画像が見えない（旧: 全公開）');

-- 他人の画像を UPDATE しようとしても USING で不可視 → 0 行（エラーにはならない）
select lives_ok(
  $$ update storage.objects set name = name
     where name = '77777777-7777-4777-a777-000000000001/avatar.png' $$,
  'N-3: 他人の画像への UPDATE はエラーにならず 0 行（USING で不可視）');

select lives_ok(
  $$ delete from storage.objects
     where name = '77777777-7777-4777-a777-000000000001/avatar.png' $$,
  'N-4: 他人の画像への DELETE はエラーにならず 0 行（USING で不可視）');

select public.qa_logout();

-- 攻撃後も所有者の画像は無傷であること
select is(
  (select count(*)::int from storage.objects
   where name = '77777777-7777-4777-a777-000000000001/avatar.png'),
  1,
  'N-5: 別ユーザーの UPDATE/DELETE 攻撃後も所有者の avatar.png は存在する');

-- -----------------------------------------------------------------------------
-- O. 所有者自身は自分の画像を UPDATE/DELETE できる（正常系回帰）
-- -----------------------------------------------------------------------------
select public.qa_login_as('77777777-7777-4777-a777-000000000001'); -- owner

select lives_ok(
  $$ update storage.objects set updated_at = now()
     where name = '77777777-7777-4777-a777-000000000001/practice.png' $$,
  'O-1: 所有者は自分の画像を UPDATE できる（回帰）');

select lives_ok(
  $$ delete from storage.objects
     where name = '77777777-7777-4777-a777-000000000001/comp.png' $$,
  'O-2: 所有者は自分の画像を DELETE できる（回帰）');

select is(
  (select count(*)::int from storage.objects
   where name = '77777777-7777-4777-a777-000000000001/comp.png'),
  0,
  'O-3: 所有者による DELETE が反映されている');

select public.qa_logout();

-- -----------------------------------------------------------------------------
-- P. 未認証 (anon) は画像を一切参照/追加できない
--    （バケット private 化 + auth.uid() IS NOT NULL 条件）
-- -----------------------------------------------------------------------------
select public.qa_login_anon();

select is(
  (select count(*)::int from storage.objects
   where bucket_id in ('profile-images', 'practice-images', 'competition-images')),
  0,
  'P-1: anon は private 画像バケットの中身を 1 件も SELECT できない');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-images', 'anon/evil.png') $$,
  '42501', null,
  'P-2: anon は画像をアップロードできない（auth.uid() IS NOT NULL 条件で WITH CHECK 拒否）');

select public.qa_logout();

-- -----------------------------------------------------------------------------
-- Q. パス偽装: 先頭セグメントを他人IDにしたパスは INSERT できない
--    （string_to_array(name,'/')[1] = auth.uid() の検証を実際に破ろうとする）
-- -----------------------------------------------------------------------------
select public.qa_login_as('77777777-7777-4777-a777-000000000002'); -- other

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('practice-images', '77777777-7777-4777-a777-000000000001/steal.png') $$,
  '42501', null,
  'Q-1: 他人IDを先頭セグメントに詐称した practice 画像 INSERT は拒否される');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('competition-images', '77777777-7777-4777-a777-000000000001/steal.png') $$,
  '42501', null,
  'Q-2: 他人IDを先頭セグメントに詐称した competition 画像 INSERT は拒否される');

-- 自分のフォルダには入れられる（対照: ポリシーが単に全拒否ではないことの確認）
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('practice-images', '77777777-7777-4777-a777-000000000002/mine.png') $$,
  'Q-3: 対照 — other は自分のフォルダには practice 画像を入れられる');

select public.qa_logout();

select * from finish();
rollback;
