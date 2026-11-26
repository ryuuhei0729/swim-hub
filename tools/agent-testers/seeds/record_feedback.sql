-- =============================================================================
-- Agent testers 用テストデータ: チーム内フィードバック (RECORD_FEEDBACK_BRIEF.md)
-- =============================================================================
-- 対象: development の Supabase (SwimHub-dev) だけ。本番では絶対に実行しない。
-- 実行: SQL Editor に貼り付け、下の v_tester_email をテスト用アカウントのメールアドレスに
--       書き換えて実行する。何度実行しても、AT-FB のデータは初期状態に戻る。
--
-- 作るもの:
--   - 補助ユーザー 2 人 (ログイン不可。auth.users にパスワード無しで作る)
--       AT-FB コーチ  : テスト用チームの管理者。テスト用アカウントの記録に FB を書いた人
--       AT-FB メンバー: テスト用チームの一般メンバー。テスト用アカウントが FB を書く相手
--   - チーム「AT-FB テストチーム」: テスト用アカウント = 管理者
--   - ペルソナごとの大会 AT-FB-<persona> (haruto / sachiko / yui / lena) に
--       テスト用アカウントの記録 1 件 (AT-FB コーチの未読 FB 付き)
--       AT-FB メンバーの記録 1 件 (FB なし)
-- =============================================================================
DO $$
DECLARE
  v_tester_email text := 'REPLACE_WITH_TESTER_EMAIL';

  v_tester   uuid;
  v_coach    uuid := 'a7fb0000-0000-4000-a000-000000000001';
  v_member   uuid := 'a7fb0000-0000-4000-a000-000000000002';
  v_team     uuid := 'a7fb0000-0000-4000-b000-000000000001';
  v_persona  text;
  v_comp     uuid;
  v_rec      uuid;
  v_idx      integer := 0;
BEGIN
  SELECT id INTO v_tester FROM auth.users WHERE email = v_tester_email;
  IF v_tester IS NULL THEN
    RAISE EXCEPTION 'テスト用アカウントが見つかりません: %', v_tester_email;
  END IF;

  -- 補助ユーザー (handle_new_user トリガが public.users を作る)
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_coach,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'agent-testers-fb-coach@example.invalid',  '{"name": "AT-FB コーチ"}'::jsonb,  now(), now()),
    (v_member, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'agent-testers-fb-member@example.invalid', '{"name": "AT-FB メンバー"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, name) VALUES (v_coach, 'AT-FB コーチ'), (v_member, 'AT-FB メンバー')
  ON CONFLICT (id) DO NOTHING;

  -- チーム
  INSERT INTO public.teams (id, name, description, invite_code, created_by)
  VALUES (v_team, 'AT-FB テストチーム', 'Agent testers のフィードバック機能テスト用', 'AT-FB-TEAM-0001', v_tester)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_memberships (team_id, user_id, role, status, is_active, joined_at)
  VALUES
    (v_team, v_tester, 'admin', 'approved', true, CURRENT_DATE),
    (v_team, v_coach,  'admin', 'approved', true, CURRENT_DATE),
    (v_team, v_member, 'user',  'approved', true, CURRENT_DATE)
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = EXCLUDED.status, is_active = true, left_at = NULL;

  -- 前回分を消して作り直す (records の削除で FB も CASCADE で消える)
  DELETE FROM public.records WHERE competition_id IN (
    SELECT id FROM public.competitions WHERE team_id = v_team AND title LIKE 'AT-FB-%'
  );
  DELETE FROM public.competitions WHERE team_id = v_team AND title LIKE 'AT-FB-%';

  FOREACH v_persona IN ARRAY ARRAY['haruto', 'sachiko', 'yui', 'lena'] LOOP
    v_idx := v_idx + 1;

    -- 直近の日付に 1 日ずつずらして置く (カレンダーで別の日になるように)
    INSERT INTO public.competitions (title, date, place, pool_type, team_id, created_by)
    VALUES ('AT-FB-' || v_persona, CURRENT_DATE - (v_idx + 1), 'AT-FB プール', 1, v_team, v_tester)
    RETURNING id INTO v_comp;

    -- テスト用アカウント自身の記録 + AT-FB コーチの未読 FB
    INSERT INTO public.records (user_id, competition_id, team_id, style_id, time, pool_type, is_relaying)
    VALUES (v_tester, v_comp, v_team, 1, 27.50 + v_idx, 1, false)
    RETURNING id INTO v_rec;

    INSERT INTO public.record_feedbacks (record_id, author_id, content)
    VALUES (v_rec, v_coach,
      'AT-FB-' || v_persona || ': スタートの反応が良かったです。' || E'\n' ||
      '後半 15m で失速しているので、ラスト 5 本のキックを意識しましょう。');

    -- AT-FB メンバーの記録 (FB なし)
    INSERT INTO public.records (user_id, competition_id, team_id, style_id, time, pool_type, is_relaying)
    VALUES (v_member, v_comp, v_team, 2, 60.00 + v_idx, 1, false);
  END LOOP;

  RAISE NOTICE 'AT-FB のテストデータを作成しました (tester=%)', v_tester;
END $$;
