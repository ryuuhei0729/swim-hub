-- =============================================================================
-- テストデータ作成SQL（2025年1月〜12月）
-- 水泳選手管理システム（Swim Manager v2）
-- =============================================================================
-- 
-- 作成内容:
-- 1. チーム練習（月・水・金）: 2025年1月〜12月
-- 2. 個人練習（自主練・火曜日、2週間に1回）: 2025年1月〜12月
-- 3. 大会（土日、1ヶ月に2回）: 2025年1月〜12月
--
-- User ID: 79d1aec3-b480-4eee-b427-ab466deea4c6
-- Team ID: 3654f61a-b7ca-4cda-8f40-cebabd91890b
-- =============================================================================

-- =============================================================================
-- 前提データの作成（ユーザーとチーム）
-- =============================================================================

-- ユーザーの作成（存在しない場合のみ）
INSERT INTO users (
    id,
    name,
    gender,
    birthday,
    created_at,
    updated_at
) VALUES (
    '79d1aec3-b480-4eee-b427-ab466deea4c6',
    'テストユーザー',
    0,
    '2000-01-01',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- チームの作成（存在しない場合のみ）
INSERT INTO teams (
    id,
    name,
    description,
    invite_code,
    created_by,
    created_at,
    updated_at
) VALUES (
    '3654f61a-b7ca-4cda-8f40-cebabd91890b',
    'テストチーム',
    'テスト用のチームです',
    'TEST123',
    '79d1aec3-b480-4eee-b427-ab466deea4c6',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- チームメンバーシップの作成（存在しない場合のみ）
INSERT INTO team_memberships (
    team_id,
    user_id,
    role,
    member_type,
    group_name,
    is_active,
    joined_at,
    left_at,
    created_at,
    updated_at
) VALUES (
    '3654f61a-b7ca-4cda-8f40-cebabd91890b',
    '79d1aec3-b480-4eee-b427-ab466deea4c6',
    'admin',
    NULL,
    NULL,
    true,
    CURRENT_DATE,
    NULL,
    NOW(),
    NOW()
) ON CONFLICT (team_id, user_id) DO UPDATE SET
    is_active = true,
    role = 'admin',
    left_at = NULL,
    updated_at = NOW();

-- =============================================================================
-- 既存データの削除（依存関係の順序で削除）
-- =============================================================================

-- スプリットタイムを削除
DELETE FROM split_times
WHERE record_id IN (
    SELECT id FROM records
    WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
       OR team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b'
);

-- レコードを削除
DELETE FROM records
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
   OR team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b';

-- エントリーを削除
DELETE FROM entries
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
   OR team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b';

-- 大会を削除
DELETE FROM competitions
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
   OR team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b';

-- 練習ログタグを削除
DELETE FROM practice_log_tags
WHERE practice_log_id IN (
    SELECT id FROM practice_logs
    WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
);

-- 練習タイムを削除
DELETE FROM practice_times
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6';

-- 練習ログを削除
DELETE FROM practice_logs
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6';

-- 練習を削除
DELETE FROM practices
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
   OR team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b';

-- 練習タグを削除（このユーザーのタグのみ）
DELETE FROM practice_tags
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6';

-- =============================================================================
-- テストデータ作成開始
-- =============================================================================

-- 定数定義
DO $$
DECLARE
    v_user_id UUID := '79d1aec3-b480-4eee-b427-ab466deea4c6';
    v_team_id UUID := '3654f61a-b7ca-4cda-8f40-cebabd91890b';
    v_practice_places TEXT[] := ARRAY['東京プール', '大阪プール', '名古屋プール', '横浜プール', '福岡プール'];
    v_competition_places TEXT[] := ARRAY['東京プール', '大阪プール', '名古屋プール', '横浜プール', '福岡プール', '札幌プール'];
    v_competition_titles TEXT[] := ARRAY['春季大会', '夏季大会', '秋季大会', '冬季大会', '関東大会', '関西大会', '全国大会', '地区大会'];
    v_styles TEXT[] := ARRAY['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー'];
    v_practice_id UUID;
    v_competition_id UUID;
    v_practice_log_id UUID;
    v_date DATE;
    v_day_of_week INTEGER;
    v_has_time BOOLEAN;
    v_style_id INTEGER;
    v_entry_style_ids INTEGER[];
    v_month INTEGER;
    v_week INTEGER;
    v_saturday_date DATE;
    v_sunday_date DATE;
    i INTEGER;
    j INTEGER;
    v_distance INTEGER;
    v_style_distance INTEGER;
    v_practice_time NUMERIC(10,2);
    v_entry_time NUMERIC(10,2);
    v_record_time NUMERIC(10,2);
    v_record_id UUID;
    v_practice_tag_ids UUID[];
    v_tag_id UUID;
    v_tag_names TEXT[] := ARRAY['基礎練習', '持久力', 'スプリント', '技術練習', 'メイン'];
    v_tag_colors TEXT[] := ARRAY['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'];
BEGIN
    -- =============================================================================
    -- 0. 練習タグの作成
    -- =============================================================================
    RAISE NOTICE '練習タグを作成中...';
    
    -- ユーザー用の練習タグを作成
    FOR i IN 1..array_length(v_tag_names, 1) LOOP
        INSERT INTO practice_tags (
            user_id,
            name,
            color,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_tag_names[i],
            v_tag_colors[i],
            NOW(),
            NOW()
        ) ON CONFLICT (user_id, name) DO NOTHING;
    END LOOP;
    
    -- 既存のタグを取得（作成したタグも含む）
    SELECT ARRAY_AGG(id) INTO v_practice_tag_ids
    FROM practice_tags
    WHERE user_id = v_user_id;
    
    RAISE NOTICE '練習タグ作成完了（タグ数: %）', COALESCE(array_length(v_practice_tag_ids, 1), 0);
    
    -- =============================================================================
    -- 1. チーム練習の作成（月・水・金）
    -- =============================================================================
    RAISE NOTICE 'チーム練習データを作成中...';
    
    FOR v_month IN 1..12 LOOP
        FOR v_date IN 
            SELECT generate_series(
                DATE '2025-01-01' + (v_month - 1) * INTERVAL '1 month',
                DATE '2025-01-01' + v_month * INTERVAL '1 month' - INTERVAL '1 day',
                INTERVAL '1 day'
            )::DATE
        LOOP
            v_day_of_week := EXTRACT(DOW FROM v_date); -- 0=日曜日, 1=月曜日, ..., 6=土曜日
            
            -- 月曜日(1)、水曜日(3)、金曜日(5)の場合のみ作成
            IF v_day_of_week IN (1, 3, 5) THEN
                -- 練習タイムが入るかどうか（50%の確率）
                v_has_time := random() < 0.5;
                
                -- チーム練習を作成
                INSERT INTO practices (
                    user_id,
                    date,
                    place,
                    note,
                    team_id,
                    created_by,
                    attendance_status,
                    created_at,
                    updated_at
                ) VALUES (
                    v_user_id,
                    v_date,
                    v_practice_places[1 + floor(random() * array_length(v_practice_places, 1))::integer],
                    'チーム練習 ' || to_char(v_date, 'YYYY-MM-DD'),
                    v_team_id,
                    v_user_id,
                    'open',
                    v_date::timestamp,
                    v_date::timestamp
                ) RETURNING id INTO v_practice_id;
                
                -- 練習ログを作成（1〜3個のランダムな練習内容）
                FOR i IN 1..(1 + floor(random() * 2)::integer) LOOP
                    -- 距離を決定
                    v_distance := 50 * (1 + floor(random() * 4)::integer); -- 50, 100, 150, 200m
                    
                    INSERT INTO practice_logs (
                        user_id,
                        practice_id,
                        style,
                        rep_count,
                        set_count,
                        distance,
                        circle,
                        note,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_user_id,
                        v_practice_id,
                        v_styles[1 + floor(random() * array_length(v_styles, 1))::integer],
                        3 + floor(random() * 5)::integer, -- 3〜5本
                        1 + floor(random() * 3)::integer,  -- 1〜3セット
                        v_distance,
                        (120.0 + floor(random() * 7) * 30.0)::numeric(10,2), -- 2分00秒〜5分00秒（120〜300秒、30秒単位）
                        '練習ログ ' || i,
                        v_date::timestamp,
                        v_date::timestamp
                    ) RETURNING id INTO v_practice_log_id;
                    
                    -- 練習ログにタグを紐付け（ランダムに1〜3個のタグ）
                    IF array_length(v_practice_tag_ids, 1) > 0 THEN
                        FOR j IN 1..(1 + floor(random() * 3)::integer) LOOP
                            IF random() < 0.7 THEN -- 70%の確率でタグを紐付け
                                INSERT INTO practice_log_tags (
                                    practice_log_id,
                                    practice_tag_id,
                                    created_at,
                                    updated_at
                                ) VALUES (
                                    v_practice_log_id,
                                    v_practice_tag_ids[1 + floor(random() * array_length(v_practice_tag_ids, 1))::integer],
                                    v_date::timestamp,
                                    v_date::timestamp
                                ) ON CONFLICT (practice_log_id, practice_tag_id) DO NOTHING;
                            END IF;
                        END LOOP;
                    END IF;
                    
                    -- 練習タイムを作成（v_has_timeがtrueの場合のみ、距離に応じたタイム）
                    IF v_has_time AND random() < 0.7 THEN -- 70%の確率でタイムを記録
                        -- 距離に応じたタイムを計算
                        IF v_distance = 50 THEN
                            v_practice_time := (25.0 + random() * 10.0)::numeric(10,2); -- 25〜35秒
                        ELSIF v_distance = 100 THEN
                            v_practice_time := (55.0 + random() * 15.0)::numeric(10,2); -- 55〜70秒
                        ELSIF v_distance = 200 THEN
                            v_practice_time := (120.0 + random() * 30.0)::numeric(10,2); -- 120〜150秒（2分〜2分30秒）
                        ELSE
                            v_practice_time := NULL; -- その他はタイムなし
                        END IF;
                        
                        -- タイムがある場合のみ記録
                        IF v_practice_time IS NOT NULL THEN
                            INSERT INTO practice_times (
                                user_id,
                                practice_log_id,
                                rep_number,
                                set_number,
                                time,
                                created_at,
                                updated_at
                            ) VALUES (
                                v_user_id,
                                v_practice_log_id,
                                1 + floor(random() * 10)::integer, -- 1〜10本目
                                1 + floor(random() * 3)::integer,  -- 1〜3セット目
                                v_practice_time,
                                v_date::timestamp,
                                v_date::timestamp
                            );
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'チーム練習データ作成完了';
    
    -- =============================================================================
    -- 2. 個人練習（自主練）の作成（火曜日、2週間に1回）
    -- =============================================================================
    RAISE NOTICE '個人練習（自主練）データを作成中...';
    
    v_week := 0;
    FOR v_date IN 
        SELECT generate_series(
            DATE '2025-01-01',
            DATE '2025-12-31',
            INTERVAL '1 day'
        )::DATE
    LOOP
        v_day_of_week := EXTRACT(DOW FROM v_date);
        
        -- 火曜日(2)の場合のみ処理
        IF v_day_of_week = 2 THEN
            -- 2週間に1回のペース（v_weekが偶数の場合）
            IF v_week % 2 = 0 THEN
                -- 個人練習を作成
                INSERT INTO practices (
                    user_id,
                    date,
                    place,
                    note,
                    team_id,
                    created_by,
                    attendance_status,
                    created_at,
                    updated_at
                ) VALUES (
                    v_user_id,
                    v_date,
                    v_practice_places[1 + floor(random() * array_length(v_practice_places, 1))::integer],
                    '自主練 ' || to_char(v_date, 'YYYY-MM-DD'),
                    NULL, -- 個人練習なのでteam_idはNULL
                    v_user_id,
                    NULL, -- 個人練習なのでattendance_statusはNULL
                    v_date::timestamp,
                    v_date::timestamp
                ) RETURNING id INTO v_practice_id;
                
                -- 練習ログを作成（1〜2個のランダムな練習内容）
                FOR i IN 1..(1 + floor(random() * 2)::integer) LOOP
                    INSERT INTO practice_logs (
                        user_id,
                        practice_id,
                        style,
                        rep_count,
                        set_count,
                        distance,
                        circle,
                        note,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_user_id,
                        v_practice_id,
                        v_styles[1 + floor(random() * array_length(v_styles, 1))::integer],
                        3 + floor(random() * 5)::integer, -- 5〜14本
                        1 + floor(random() * 3)::integer,  -- 1〜2セット
                        50 * (1 + floor(random() * 4)::integer), -- 50, 100, 150, ..., 200m
                        (120.0 + floor(random() * 7) * 30.0)::numeric(10,2), -- 2分00秒〜5分00秒（120〜300秒、30秒単位）
                        '自主練ログ ' || i,
                        v_date::timestamp,
                        v_date::timestamp
                    ) RETURNING id INTO v_practice_log_id;
                    
                    -- 練習ログにタグを紐付け（ランダムに1〜2個のタグ）
                    IF array_length(v_practice_tag_ids, 1) > 0 THEN
                        FOR j IN 1..(1 + floor(random() * 2)::integer) LOOP
                            IF random() < 0.6 THEN -- 60%の確率でタグを紐付け
                                INSERT INTO practice_log_tags (
                                    practice_log_id,
                                    practice_tag_id,
                                    created_at,
                                    updated_at
                                ) VALUES (
                                    v_practice_log_id,
                                    v_practice_tag_ids[1 + floor(random() * array_length(v_practice_tag_ids, 1))::integer],
                                    v_date::timestamp,
                                    v_date::timestamp
                                ) ON CONFLICT (practice_log_id, practice_tag_id) DO NOTHING;
                            END IF;
                        END LOOP;
                    END IF;
                END LOOP;
            END IF;
            
            v_week := v_week + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '個人練習（自主練）データ作成完了';
    
    -- =============================================================================
    -- 3. 大会の作成（土日、1ヶ月に2回）
    -- =============================================================================
    RAISE NOTICE '大会データを作成中...';
    
    FOR v_month IN 1..12 LOOP
        -- 月の最初の土曜日と日曜日を探す
        v_saturday_date := DATE '2025-01-01' + (v_month - 1) * INTERVAL '1 month';
        -- 最初の土曜日まで進める
        WHILE EXTRACT(DOW FROM v_saturday_date) != 6 LOOP
            v_saturday_date := v_saturday_date + INTERVAL '1 day';
        END LOOP;
        
        -- 1回目の大会（最初の週末）
        v_date := v_saturday_date + (floor(random() * 2)::integer * INTERVAL '1 day'); -- 土曜日または日曜日
        
        INSERT INTO competitions (
            title,
            date,
            place,
            pool_type,
            note,
            team_id,
            user_id,
            created_by,
            entry_status,
            attendance_status,
            created_at,
            updated_at
        ) VALUES (
            v_competition_titles[1 + floor(random() * array_length(v_competition_titles, 1))::integer] || ' ' || to_char(v_date, 'YYYY年MM月'),
            v_date,
            v_competition_places[1 + floor(random() * array_length(v_competition_places, 1))::integer],
            floor(random() * 2)::integer, -- 0: short, 1: long
            '大会 ' || to_char(v_date, 'YYYY-MM-DD'),
            v_team_id,
            v_user_id,
            v_user_id,
            'closed',
            'closed',
            v_date::timestamp,
            v_date::timestamp
        ) RETURNING id INTO v_competition_id;
        
        -- エントリー（2種目、ランダム）
        SELECT ARRAY_AGG(id ORDER BY random()) INTO v_entry_style_ids
        FROM styles
        WHERE id IN (SELECT id FROM styles ORDER BY random() LIMIT 2);
        
        FOR i IN 1..array_length(v_entry_style_ids, 1) LOOP
            -- style_idから距離を取得
            SELECT distance INTO v_style_distance
            FROM styles
            WHERE id = v_entry_style_ids[i];
            
            -- 距離に応じたエントリータイムを計算
            IF v_style_distance = 50 THEN
                v_entry_time := (25.0 + random() * 10.0)::numeric(10,2); -- 25〜35秒
            ELSIF v_style_distance = 100 THEN
                v_entry_time := (55.0 + random() * 15.0)::numeric(10,2); -- 55〜70秒
            ELSIF v_style_distance = 200 THEN
                v_entry_time := (120.0 + random() * 30.0)::numeric(10,2); -- 120〜150秒（2分〜2分30秒）
            ELSE
                v_entry_time := NULL; -- その他はタイムなし
            END IF;
            
            INSERT INTO entries (
                team_id,
                competition_id,
                user_id,
                style_id,
                entry_time,
                note,
                created_at,
                updated_at
            ) VALUES (
                v_team_id,
                v_competition_id,
                v_user_id,
                v_entry_style_ids[i],
                v_entry_time,
                'エントリー種目 ' || i,
                v_date::timestamp,
                v_date::timestamp
            );
            
            -- レコードを作成（距離に応じたタイム）
            -- 距離に応じたレコードタイムを計算
            IF v_style_distance = 50 THEN
                v_record_time := (25.0 + random() * 10.0)::numeric(10,2); -- 25〜35秒
            ELSIF v_style_distance = 100 THEN
                v_record_time := (55.0 + random() * 15.0)::numeric(10,2); -- 55〜70秒
            ELSIF v_style_distance = 200 THEN
                v_record_time := (120.0 + random() * 30.0)::numeric(10,2); -- 120〜150秒（2分〜2分30秒）
            ELSE
                v_record_time := NULL; -- その他はタイムなし
            END IF;
            
            -- レコードタイムがある場合のみ記録を作成
            IF v_record_time IS NOT NULL THEN
                INSERT INTO records (
                    user_id,
                    competition_id,
                    style_id,
                    time,
                    pool_type,
                    team_id,
                    video_url,
                    note,
                    is_relaying,
                    created_at,
                    updated_at
                ) VALUES (
                    v_user_id,
                    v_competition_id,
                    v_entry_style_ids[i],
                    v_record_time,
                    floor(random() * 2)::smallint, -- 0: short, 1: long
                    v_team_id,
                    NULL,
                    '大会記録 ' || to_char(v_date, 'YYYY-MM-DD'),
                    false,
                    v_date::timestamp,
                    v_date::timestamp
                ) RETURNING id INTO v_record_id;
                
                -- スプリットタイムを作成（50m, 100m, 200mの場合）
                IF v_style_distance = 50 THEN
                    -- 50m: 25m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_record_id,
                        25,
                        (v_record_time * 0.45 + random() * v_record_time * 0.1)::numeric(10,2), -- 全体タイムの45〜55%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                ELSIF v_style_distance = 100 THEN
                    -- 100m: 50m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_record_id,
                        50,
                        (v_record_time * 0.45 + random() * v_record_time * 0.1)::numeric(10,2), -- 全体タイムの45〜55%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                ELSIF v_style_distance = 200 THEN
                    -- 200m: 50m, 100m, 150m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES
                    (
                        v_record_id,
                        50,
                        (v_record_time * 0.22 + random() * v_record_time * 0.03)::numeric(10,2), -- 全体タイムの22〜25%
                        v_date::timestamp,
                        v_date::timestamp
                    ),
                    (
                        v_record_id,
                        100,
                        (v_record_time * 0.45 + random() * v_record_time * 0.05)::numeric(10,2), -- 全体タイムの45〜50%
                        v_date::timestamp,
                        v_date::timestamp
                    ),
                    (
                        v_record_id,
                        150,
                        (v_record_time * 0.70 + random() * v_record_time * 0.05)::numeric(10,2), -- 全体タイムの70〜75%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                END IF;
            END IF;
        END LOOP;
        
        -- 2回目の大会（月の後半の週末）
        v_date := v_saturday_date + INTERVAL '14 days' + (floor(random() * 2)::integer * INTERVAL '1 day'); -- 2週間後の土曜日または日曜日
        
        -- 12月の場合は31日を超えないように調整
        IF v_date > DATE '2025-01-01' + v_month * INTERVAL '1 month' - INTERVAL '1 day' THEN
            v_date := DATE '2025-01-01' + v_month * INTERVAL '1 month' - INTERVAL '1 day';
            -- 日曜日になるまで戻す
            WHILE EXTRACT(DOW FROM v_date) NOT IN (0, 6) AND v_date >= DATE '2025-01-01' + (v_month - 1) * INTERVAL '1 month' LOOP
                v_date := v_date - INTERVAL '1 day';
            END LOOP;
        END IF;
        
        INSERT INTO competitions (
            title,
            date,
            place,
            pool_type,
            note,
            team_id,
            user_id,
            created_by,
            entry_status,
            attendance_status,
            created_at,
            updated_at
        ) VALUES (
            v_competition_titles[1 + floor(random() * array_length(v_competition_titles, 1))::integer] || ' ' || to_char(v_date, 'YYYY年MM月'),
            v_date,
            v_competition_places[1 + floor(random() * array_length(v_competition_places, 1))::integer],
            floor(random() * 2)::integer, -- 0: short, 1: long
            '大会 ' || to_char(v_date, 'YYYY-MM-DD'),
            v_team_id,
            v_user_id,
            v_user_id,
            'closed',
            'closed',
            v_date::timestamp,
            v_date::timestamp
        ) RETURNING id INTO v_competition_id;
        
        -- エントリー（2種目、ランダム）
        SELECT ARRAY_AGG(id ORDER BY random()) INTO v_entry_style_ids
        FROM styles
        WHERE id IN (SELECT id FROM styles ORDER BY random() LIMIT 2);
        
        FOR i IN 1..array_length(v_entry_style_ids, 1) LOOP
            -- style_idから距離を取得
            SELECT distance INTO v_style_distance
            FROM styles
            WHERE id = v_entry_style_ids[i];
            
            -- 距離に応じたエントリータイムを計算
            IF v_style_distance = 50 THEN
                v_entry_time := (25.0 + random() * 10.0)::numeric(10,2); -- 25〜35秒
            ELSIF v_style_distance = 100 THEN
                v_entry_time := (55.0 + random() * 15.0)::numeric(10,2); -- 55〜70秒
            ELSIF v_style_distance = 200 THEN
                v_entry_time := (120.0 + random() * 30.0)::numeric(10,2); -- 120〜150秒（2分〜2分30秒）
            ELSE
                v_entry_time := NULL; -- その他はタイムなし
            END IF;
            
            INSERT INTO entries (
                team_id,
                competition_id,
                user_id,
                style_id,
                entry_time,
                note,
                created_at,
                updated_at
            ) VALUES (
                v_team_id,
                v_competition_id,
                v_user_id,
                v_entry_style_ids[i],
                v_entry_time,
                'エントリー種目 ' || i,
                v_date::timestamp,
                v_date::timestamp
            );
            
            -- レコードを作成（距離に応じたタイム）
            -- 距離に応じたレコードタイムを計算
            IF v_style_distance = 50 THEN
                v_record_time := (25.0 + random() * 10.0)::numeric(10,2); -- 25〜35秒
            ELSIF v_style_distance = 100 THEN
                v_record_time := (55.0 + random() * 15.0)::numeric(10,2); -- 55〜70秒
            ELSIF v_style_distance = 200 THEN
                v_record_time := (120.0 + random() * 30.0)::numeric(10,2); -- 120〜150秒（2分〜2分30秒）
            ELSE
                v_record_time := NULL; -- その他はタイムなし
            END IF;
            
            -- レコードタイムがある場合のみ記録を作成
            IF v_record_time IS NOT NULL THEN
                INSERT INTO records (
                    user_id,
                    competition_id,
                    style_id,
                    time,
                    pool_type,
                    team_id,
                    video_url,
                    note,
                    is_relaying,
                    created_at,
                    updated_at
                ) VALUES (
                    v_user_id,
                    v_competition_id,
                    v_entry_style_ids[i],
                    v_record_time,
                    floor(random() * 2)::smallint, -- 0: short, 1: long
                    v_team_id,
                    NULL,
                    '大会記録 ' || to_char(v_date, 'YYYY-MM-DD'),
                    false,
                    v_date::timestamp,
                    v_date::timestamp
                ) RETURNING id INTO v_record_id;
                
                -- スプリットタイムを作成（50m, 100m, 200mの場合）
                IF v_style_distance = 50 THEN
                    -- 50m: 25m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_record_id,
                        25,
                        (v_record_time * 0.45 + random() * v_record_time * 0.1)::numeric(10,2), -- 全体タイムの45〜55%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                ELSIF v_style_distance = 100 THEN
                    -- 100m: 50m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_record_id,
                        50,
                        (v_record_time * 0.45 + random() * v_record_time * 0.1)::numeric(10,2), -- 全体タイムの45〜55%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                ELSIF v_style_distance = 200 THEN
                    -- 200m: 50m, 100m, 150m地点のスプリット
                    INSERT INTO split_times (
                        record_id,
                        distance,
                        split_time,
                        created_at,
                        updated_at
                    ) VALUES
                    (
                        v_record_id,
                        50,
                        (v_record_time * 0.22 + random() * v_record_time * 0.03)::numeric(10,2), -- 全体タイムの22〜25%
                        v_date::timestamp,
                        v_date::timestamp
                    ),
                    (
                        v_record_id,
                        100,
                        (v_record_time * 0.45 + random() * v_record_time * 0.05)::numeric(10,2), -- 全体タイムの45〜50%
                        v_date::timestamp,
                        v_date::timestamp
                    ),
                    (
                        v_record_id,
                        150,
                        (v_record_time * 0.70 + random() * v_record_time * 0.05)::numeric(10,2), -- 全体タイムの70〜75%
                        v_date::timestamp,
                        v_date::timestamp
                    );
                END IF;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '大会データ作成完了';
    
    -- =============================================================================
    -- データ作成完了メッセージ
    -- =============================================================================
    RAISE NOTICE '========================================';
    RAISE NOTICE 'テストデータ作成が完了しました！';
    RAISE NOTICE '========================================';
END $$;

-- =============================================================================
-- データ確認クエリ
-- =============================================================================

-- チーム練習の件数確認
SELECT 
    COUNT(*) as team_practice_count,
    MIN(date) as first_date,
    MAX(date) as last_date
FROM practices
WHERE team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b'
  AND date >= '2025-01-01'
  AND date <= '2025-12-31';

-- 個人練習（自主練）の件数確認
SELECT 
    COUNT(*) as personal_practice_count,
    MIN(date) as first_date,
    MAX(date) as last_date
FROM practices
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
  AND team_id IS NULL
  AND date >= '2025-01-01'
  AND date <= '2025-12-31';

-- 大会の件数確認
SELECT 
    COUNT(*) as competition_count,
    MIN(date) as first_date,
    MAX(date) as last_date
FROM competitions
WHERE team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b'
  AND date >= '2025-01-01'
  AND date <= '2025-12-31';

-- エントリーの件数確認
SELECT 
    COUNT(*) as entry_count,
    COUNT(DISTINCT competition_id) as competition_count
FROM entries
WHERE user_id = '79d1aec3-b480-4eee-b427-ab466deea4c6'
  AND team_id = '3654f61a-b7ca-4cda-8f40-cebabd91890b';

