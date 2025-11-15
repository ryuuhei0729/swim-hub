-- =============================================================================
-- テストデータシードファイル
-- 水泳選手管理システム（Swim Manager v2）
-- 作成日: 2025年1月17日
-- =============================================================================

-- 注意: このファイルは開発環境でのみ使用してください
-- 本番環境では実行しないでください

-- =============================================================================
-- 1. テストユーザーの作成（Supabase Authと連携）
-- =============================================================================

-- テストユーザー用のUUIDを生成
DO $$
DECLARE
    user_ids UUID[] := ARRAY[
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777',
        '88888888-8888-8888-8888-888888888888',
        '99999999-9999-9999-9999-999999999999',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ];
    user_id UUID;
    i INTEGER;
BEGIN
    -- 各ユーザーに対してauth.usersとusersテーブルにデータを挿入
    FOR i IN 1..10 LOOP
        user_id := user_ids[i];
        
        -- auth.usersテーブルに挿入（Supabase Auth）
        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            last_sign_in_at,
            app_metadata,
            user_metadata,
            identities,
            factors,
            recovery_sent_at,
            email_change,
            email_change_sent_at,
            last_sign_in_ip,
            raw_user_meta_data,
            is_sso_user,
            created_at,
            updated_at,
            phone,
            phone_confirmed_at,
            phone_change,
            phone_change_token,
            phone_change_sent_at,
            confirmed_at,
            email_change_token_current,
            email_change_confirm_status,
            banned_until,
            reauthentication_token,
            reauthentication_sent_at,
            is_sso_user,
            deleted_at
        ) VALUES (
            user_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'testuser' || i || '@example.com',
            crypt('Pass1234', gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            '{"provider": "email", "providers": ["email"]}',
            '{"name": "テストユーザー' || i || '"}',
            false,
            NOW(),
            '{}',
            '{"name": "テストユーザー' || i || '"}',
            '[]',
            '[]',
            NULL,
            '',
            NULL,
            '127.0.0.1',
            '{"name": "テストユーザー' || i || '"}',
            false,
            NOW(),
            NOW(),
            NULL,
            NULL,
            '',
            '',
            NULL,
            NOW(),
            '',
            0,
            NULL,
            '',
            NULL,
            false,
            NULL
        ) ON CONFLICT (id) DO NOTHING;
        
        -- usersテーブルに挿入
        INSERT INTO users (
            id,
            name,
            gender,
            birthday,
            profile_image_path,
            bio,
            created_at,
            updated_at
        ) VALUES (
            user_id,
            'テストユーザー' || i,
            (i % 2), -- 0: male, 1: female
            '2000-01-01'::date + (i * 30), -- 30日間隔で誕生日を設定
            NULL,
            'テスト用プロフィール ' || i,
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- =============================================================================
-- 2. 練習タグの作成（各ユーザー3つずつ）
-- =============================================================================

INSERT INTO practice_tags (user_id, name, color, created_at, updated_at)
SELECT 
    u.id,
    tag_name,
    tag_color,
    NOW(),
    NOW()
FROM users u
CROSS JOIN (
    VALUES 
        ('基礎練習', '#3B82F6'),
        ('持久力', '#10B981'),
        ('スプリント', '#F59E0B')
) AS tags(tag_name, tag_color)
WHERE u.name LIKE 'テストユーザー%'
ON CONFLICT (user_id, name) DO NOTHING;

-- =============================================================================
-- 3. 10月の練習データ作成（各ユーザー8個のPractice）
-- =============================================================================

-- 10月の練習日を作成
INSERT INTO practices (user_id, date, place, note, created_at, updated_at)
SELECT 
    u.id,
    '2024-10-' || LPAD(day::text, 2, '0') as practice_date,
    CASE 
        WHEN day % 3 = 0 THEN '東京プール'
        WHEN day % 3 = 1 THEN '大阪プール'
        ELSE '名古屋プール'
    END as place,
    '10月練習 ' || day || '日目',
    '2024-10-' || LPAD(day::text, 2, '0')::timestamp,
    '2024-10-' || LPAD(day::text, 2, '0')::timestamp
FROM users u
CROSS JOIN generate_series(1, 8) as day
WHERE u.name LIKE 'テストユーザー%'
  AND day IN (1, 3, 5, 7, 10, 12, 15, 17) -- 10月の8日間
ON CONFLICT DO NOTHING;

-- 10月の練習ログを作成（各Practiceに2-3個のPracticeLog）
INSERT INTO practice_logs (user_id, practice_id, style, rep_count, set_count, distance, circle, note, created_at, updated_at)
SELECT 
    p.user_id,
    p.id,
    practice_style,
    rep_count,
    set_count,
    distance,
    circle_time,
    '10月練習ログ: ' || practice_style,
    p.created_at,
    p.updated_at
FROM practices p
CROSS JOIN (
    VALUES 
        ('自由形', 10, 4, 400, 1.5),
        ('平泳ぎ', 8, 3, 200, 2.0),
        ('背泳ぎ', 6, 2, 150, 1.8)
) AS log_data(practice_style, rep_count, set_count, distance, circle_time)
WHERE p.date >= '2024-10-01' AND p.date <= '2024-10-31'
ON CONFLICT DO NOTHING;

-- 10月の練習タイムを作成（各PracticeLogに複数のPracticeTime）
INSERT INTO practice_times (user_id, practice_log_id, rep_number, set_number, time, created_at, updated_at)
SELECT 
    pl.user_id,
    pl.id,
    rep_num,
    set_num,
    (30 + random() * 20)::numeric(10,2), -- 30-50秒のランダムタイム
    pl.created_at,
    pl.updated_at
FROM practice_logs pl
CROSS JOIN generate_series(1, 3) as rep_num
CROSS JOIN generate_series(1, 2) as set_num
WHERE pl.created_at >= '2024-10-01'::timestamp
  AND pl.created_at <= '2024-10-31'::timestamp
ON CONFLICT DO NOTHING;

-- 練習ログにタグを紐付け（ランダムに3つのタグから選択）
INSERT INTO practice_log_tags (practice_log_id, practice_tag_id, created_at)
SELECT 
    pl.id,
    pt.id,
    pl.created_at
FROM practice_logs pl
JOIN practices p ON p.id = pl.practice_id
JOIN practice_tags pt ON pt.user_id = p.user_id
WHERE pl.created_at >= '2024-10-01'::timestamp
  AND pl.created_at <= '2024-10-31'::timestamp
  AND random() < 0.7 -- 70%の確率でタグを紐付け
ON CONFLICT (practice_log_id, practice_tag_id) DO NOTHING;

-- =============================================================================
-- 4. 大会データの作成（10月2個、9月8個）
-- =============================================================================

-- 10月の大会（2個）
INSERT INTO competitions (title, date, place, pool_type, note, created_at, updated_at)
VALUES 
    ('秋季大会2024', '2024-10-15', '東京プール', 0, '10月の主要大会', '2024-10-15'::timestamp, '2024-10-15'::timestamp),
    ('関東大会', '2024-10-28', '横浜プール', 1, '関東地区大会', '2024-10-28'::timestamp, '2024-10-28'::timestamp)
ON CONFLICT DO NOTHING;

-- 9月の大会（8個）
INSERT INTO competitions (title, date, place, pool_type, note, created_at, updated_at)
SELECT 
    '9月大会' || day,
    '2024-09-' || LPAD(day::text, 2, '0'),
    CASE 
        WHEN day % 4 = 0 THEN '東京プール'
        WHEN day % 4 = 1 THEN '大阪プール'
        WHEN day % 4 = 2 THEN '名古屋プール'
        ELSE '福岡プール'
    END,
    (day % 2),
    '9月の大会 ' || day,
    '2024-09-' || LPAD(day::text, 2, '0')::timestamp,
    '2024-09-' || LPAD(day::text, 2, '0')::timestamp
FROM generate_series(1, 8) as day
WHERE day IN (1, 5, 8, 12, 15, 18, 22, 25) -- 9月の8日間
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. 記録データの作成（各ユーザー10件：10月2件、9月8件）
-- =============================================================================

-- 10月の記録（各ユーザー2件）
INSERT INTO records (user_id, competition_id, style_id, time, video_url, note, is_relaying, created_at, updated_at)
SELECT 
    u.id,
    c.id,
    s.id,
    (30 + random() * 20)::numeric(10,2),
    'https://example.com/video/' || u.id,
    '10月記録: ' || s.name_jp,
    false,
    c.date::timestamp,
    c.date::timestamp
FROM users u
CROSS JOIN competitions c
CROSS JOIN styles s
WHERE u.name LIKE 'テストユーザー%'
  AND c.date >= '2024-10-01' AND c.date <= '2024-10-31'
  AND s.id IN (1, 2, 3, 4, 5) -- 主要種目のみ
  AND random() < 0.3 -- 30%の確率で記録を作成
ON CONFLICT DO NOTHING;

-- 9月の記録（各ユーザー8件）
INSERT INTO records (user_id, competition_id, style_id, time, video_url, note, is_relaying, created_at, updated_at)
SELECT 
    u.id,
    c.id,
    s.id,
    (30 + random() * 20)::numeric(10,2),
    'https://example.com/video/' || u.id,
    '9月記録: ' || s.name_jp,
    false,
    c.date::timestamp,
    c.date::timestamp
FROM users u
CROSS JOIN competitions c
CROSS JOIN styles s
WHERE u.name LIKE 'テストユーザー%'
  AND c.date >= '2024-09-01' AND c.date <= '2024-09-30'
  AND s.id IN (1, 2, 3, 4, 5) -- 主要種目のみ
  AND random() < 0.4 -- 40%の確率で記録を作成
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. スプリットタイムの作成（各記録に2-3個のスプリット）
-- =============================================================================

INSERT INTO split_times (record_id, distance, split_time, created_at, updated_at)
SELECT 
    r.id,
    split_distance,
    (split_distance * 0.5 + random() * 10)::numeric(10,2),
    r.created_at,
    r.updated_at
FROM records r
CROSS JOIN (
    VALUES (25), (50), (75), (100)
) AS splits(split_distance)
WHERE random() < 0.8 -- 80%の確率でスプリットタイムを作成
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 7. データ整合性の確認
-- =============================================================================

-- 作成されたデータの確認
DO $$
DECLARE
    user_count INTEGER;
    practice_count INTEGER;
    record_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users WHERE name LIKE 'テストユーザー%';
    SELECT COUNT(*) INTO practice_count FROM practices WHERE date >= '2024-10-01' AND date <= '2024-10-31';
    SELECT COUNT(*) INTO record_count FROM records WHERE created_at >= '2024-09-01'::timestamp;
    
    RAISE NOTICE 'テストデータ作成完了:';
    RAISE NOTICE '- ユーザー数: %', user_count;
    RAISE NOTICE '- 10月練習数: %', practice_count;
    RAISE NOTICE '- 記録数: %', record_count;
END $$;

-- =============================================================================
-- シードデータ作成完了
-- =============================================================================
