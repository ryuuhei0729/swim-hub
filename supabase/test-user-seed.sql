-- =============================================================================
-- テストユーザー専用シードファイル
-- 既存ユーザー（d704c431-0f15-480f-8d9f-afda42ddc3c9）用のテストデータ
-- 
-- データ期間: 2025年10月〜11月
-- - Competitions: 10個（10/3〜11/29）
-- - Practices: 10個（10/1〜11/26）
-- =============================================================================

-- 既存のテストデータをクリーンアップ（このユーザーのみ）
DELETE FROM practice_times WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
DELETE FROM practice_log_tags WHERE practice_log_id IN (
    SELECT id FROM practice_logs WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
);
DELETE FROM practice_logs WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
DELETE FROM practices WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
DELETE FROM practice_tags WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
DELETE FROM split_times WHERE record_id IN (
    SELECT id FROM records WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
);
DELETE FROM records WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
DELETE FROM competitions WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';

-- =============================================================================
-- 1. Practice Tags（3個）
-- =============================================================================
INSERT INTO practice_tags (user_id, name, color, created_at, updated_at)
VALUES 
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', 'メイン練習', '#3B82F6', NOW(), NOW()),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', 'スプリント', '#EF4444', NOW(), NOW()),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '持久力', '#10B981', NOW(), NOW())
ON CONFLICT (user_id, name) DO NOTHING;

-- =============================================================================
-- 2. Competitions（10個 - 2025年10月〜11月）
-- =============================================================================
INSERT INTO competitions (user_id, title, date, place, pool_type, note, created_at, updated_at)
VALUES 
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '秋季記録会', '2025-10-03', '東京アクアティクスセンター', 1, '10月の記録会', '2025-10-03 09:00:00', '2025-10-03 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '関東選手権予選', '2025-10-08', '横浜国際プール', 1, '関東地区予選', '2025-10-08 09:00:00', '2025-10-08 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '都民大会', '2025-10-12', '東京辰巳国際水泳場', 0, '東京都民大会', '2025-10-12 09:00:00', '2025-10-12 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '秋季大会', '2025-10-18', '大阪プール', 1, '秋の主要大会', '2025-10-18 09:00:00', '2025-10-18 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', 'オープン大会', '2025-10-25', '名古屋市民プール', 0, 'オープン参加大会', '2025-10-25 09:00:00', '2025-10-25 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '関東新人戦', '2025-11-02', '千葉県プール', 1, '新人選手権', '2025-11-02 09:00:00', '2025-11-02 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '県大会', '2025-11-09', '埼玉県営プール', 0, '県選手権大会', '2025-11-09 09:00:00', '2025-11-09 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '秋季選手権', '2025-11-15', '神奈川県立プール', 1, '秋季選手権大会', '2025-11-15 09:00:00', '2025-11-15 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '記録会', '2025-11-23', '群馬県立プール', 0, '11月の記録会', '2025-11-23 09:00:00', '2025-11-23 09:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '冬季前哨戦', '2025-11-29', '栃木県プール', 1, '冬に向けた調整大会', '2025-11-29 09:00:00', '2025-11-29 09:00:00')
RETURNING id;

-- =============================================================================
-- 3. Records（各Competitionに2個、合計20個）
-- =============================================================================

-- Competitionごとに2つのRecordを作成
DO $$
DECLARE
    comp RECORD;
    style_ids INTEGER[] := ARRAY[1, 2, 3, 4, 5, 6, 7, 8]; -- 主要種目のID
    style_id1 INTEGER;
    style_id2 INTEGER;
    base_time NUMERIC;
BEGIN
    FOR comp IN 
        SELECT id, title, date 
        FROM competitions 
        WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
        ORDER BY date
    LOOP
        -- ランダムに2つの異なる種目を選択
        style_id1 := style_ids[1 + floor(random() * 4)::int]; -- 1-4
        style_id2 := style_ids[5 + floor(random() * 4)::int]; -- 5-8
        
        -- Record 1
        base_time := 50.0 + random() * 10; -- 50-60秒
        INSERT INTO records (user_id, competition_id, style_id, time, note, is_relaying)
        VALUES (
            'd704c431-0f15-480f-8d9f-afda42ddc3c9',
            comp.id,
            style_id1,
            base_time,
            comp.title || ' - 種目1',
            false
        );
        
        -- Record 2
        base_time := 55.0 + random() * 15; -- 55-70秒
        INSERT INTO records (user_id, competition_id, style_id, time, note, is_relaying)
        VALUES (
            'd704c431-0f15-480f-8d9f-afda42ddc3c9',
            comp.id,
            style_id2,
            base_time,
            comp.title || ' - 種目2',
            false
        );
    END LOOP;
END $$;

-- =============================================================================
-- 4. Split Times（各Recordに2個、合計40個）
-- =============================================================================

INSERT INTO split_times (record_id, distance, split_time)
SELECT 
    r.id,
    25,
    (r.time / 4 + (random() * 2 - 1))::numeric(10,2) -- 全体タイムの1/4 ± ランダム
FROM records r
WHERE r.user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';

INSERT INTO split_times (record_id, distance, split_time)
SELECT 
    r.id,
    50,
    (r.time / 2 + (random() * 2 - 1))::numeric(10,2) -- 全体タイムの1/2 ± ランダム
FROM records r
WHERE r.user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';

-- =============================================================================
-- 5. Practices（10個 - 2025年10月〜11月）
-- =============================================================================

INSERT INTO practices (user_id, date, place, note, created_at, updated_at)
VALUES 
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-01', '東京アクアティクスセンター', '10月1週目の練習', '2025-10-01 15:00:00', '2025-10-01 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-06', '横浜国際プール', '10月1週目の練習', '2025-10-06 15:00:00', '2025-10-06 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-10', '大阪プール', '10月2週目の練習', '2025-10-10 15:00:00', '2025-10-10 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-15', '名古屋市民プール', '10月3週目の練習', '2025-10-15 15:00:00', '2025-10-15 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-20', '千葉県プール', '10月3週目の練習', '2025-10-20 15:00:00', '2025-10-20 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-10-27', '東京辰巳国際水泳場', '10月4週目の練習', '2025-10-27 15:00:00', '2025-10-27 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-11-05', '埼玉県営プール', '11月1週目の練習', '2025-11-05 15:00:00', '2025-11-05 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-11-12', '群馬県立プール', '11月2週目の練習', '2025-11-12 15:00:00', '2025-11-12 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-11-19', '栃木県プール', '11月3週目の練習', '2025-11-19 15:00:00', '2025-11-19 15:00:00'),
    ('d704c431-0f15-480f-8d9f-afda42ddc3c9', '2025-11-26', '神奈川県立プール', '11月4週目の練習', '2025-11-26 15:00:00', '2025-11-26 15:00:00')
RETURNING id;

-- =============================================================================
-- 6. Practice Logs（各Practiceに1個、合計10個）
-- =============================================================================

DO $$
DECLARE
    prac RECORD;
    styles TEXT[] := ARRAY['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー'];
    style TEXT;
    rep_count INTEGER;
    set_count INTEGER;
BEGIN
    FOR prac IN 
        SELECT id, date, created_at, updated_at
        FROM practices 
        WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
        ORDER BY date
    LOOP
        -- ランダムに泳法、本数、セット数を選択
        style := styles[1 + floor(random() * 5)::int];
        rep_count := 4 + floor(random() * 5)::int; -- 4-8本
        set_count := 2 + floor(random() * 3)::int; -- 2-4セット
        
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
        )
        VALUES (
            'd704c431-0f15-480f-8d9f-afda42ddc3c9',
            prac.id,
            style,
            rep_count,
            set_count,
            100,
            90, -- 1分30秒サークル
            style || 'の練習メニュー',
            prac.created_at,
            prac.updated_at
        );
    END LOOP;
END $$;

-- =============================================================================
-- 7. Practice Times（本数×セット数分）
-- =============================================================================

DO $$
DECLARE
    log RECORD;
    rep INTEGER;
    st INTEGER;
    base_time NUMERIC;
BEGIN
    FOR log IN 
        SELECT id, rep_count, set_count, created_at, updated_at
        FROM practice_logs 
        WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
    LOOP
        -- 各セット、各本数ごとにタイムを作成
        FOR st IN 1..log.set_count LOOP
            FOR rep IN 1..log.rep_count LOOP
                -- ベースタイム + ランダム変動（後半ほど遅くなる傾向）
                base_time := 60.0 + (rep * 0.5) + (random() * 3);
                
                INSERT INTO practice_times (
                    user_id,
                    practice_log_id,
                    rep_number,
                    set_number,
                    time,
                    created_at,
                    updated_at
                )
                VALUES (
                    'd704c431-0f15-480f-8d9f-afda42ddc3c9',
                    log.id,
                    rep,
                    st,
                    base_time,
                    log.created_at,
                    log.updated_at
                );
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- =============================================================================
-- 8. Practice Log Tags（各Practice Logに3つのタグを紐付け）
-- =============================================================================

INSERT INTO practice_log_tags (practice_log_id, practice_tag_id)
SELECT 
    pl.id,
    pt.id
FROM practice_logs pl
CROSS JOIN practice_tags pt
WHERE pl.user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
  AND pt.user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9'
ON CONFLICT (practice_log_id, practice_tag_id) DO NOTHING;

-- =============================================================================
-- 9. データ確認
-- =============================================================================

DO $$
DECLARE
    comp_count INTEGER;
    record_count INTEGER;
    split_count INTEGER;
    practice_count INTEGER;
    log_count INTEGER;
    time_count INTEGER;
    tag_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO comp_count FROM competitions WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    SELECT COUNT(*) INTO record_count FROM records WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    SELECT COUNT(*) INTO split_count FROM split_times WHERE record_id IN (SELECT id FROM records WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9');
    SELECT COUNT(*) INTO practice_count FROM practices WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    SELECT COUNT(*) INTO log_count FROM practice_logs WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    SELECT COUNT(*) INTO time_count FROM practice_times WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    SELECT COUNT(*) INTO tag_count FROM practice_tags WHERE user_id = 'd704c431-0f15-480f-8d9f-afda42ddc3c9';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'テストデータ作成完了';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ユーザーID: d704c431-0f15-480f-8d9f-afda42ddc3c9';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'Competitions: % 個', comp_count;
    RAISE NOTICE 'Records: % 個', record_count;
    RAISE NOTICE 'Split Times: % 個', split_count;
    RAISE NOTICE 'Practices: % 個', practice_count;
    RAISE NOTICE 'Practice Logs: % 個', log_count;
    RAISE NOTICE 'Practice Times: % 個', time_count;
    RAISE NOTICE 'Practice Tags: % 個', tag_count;
    RAISE NOTICE '========================================';
END $$;

