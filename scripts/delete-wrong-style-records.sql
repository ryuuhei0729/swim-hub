-- =============================================================================
-- 2026-02-20 版 register-users-with-records.sql で誤登録された記録の削除SQL
--
-- 旧 STYLE_MAP のバグにより、以下の誤IDで記録が登録されていた:
--   背泳ぎ 50m       → style_id 8  (実際は「25m平泳ぎ」のID。正: 13)
--   個人メドレー 200m → style_id 20 (実際は「100m個人メドレー」のID。正: 21)
--
-- 対象: users.csv で一括作成した28ユーザーの style_id 8/20 の記録すべて。
--   これらのアカウントの 25m平泳ぎ/100m個メ の記録はインポート由来以外に
--   存在しない前提。手動入力した心当たりがある場合は先にプレビューで確認すること。
--
-- ※ 旧SQLを適用していない DB で実行しても 0 件削除で無害 (冪等)
-- ※ 実行順序: ①プレビュー → ②この DELETE → ③修正版 register-users-with-records.sql
--   (③が背泳ぎ50/100/200・個メ200 を正しい style_id で投入し直す)
-- =============================================================================

-- ① プレビュー (削除対象の確認。まずこれだけを実行推奨)
-- SELECT u.email, s.name_jp AS wrong_style, r.time, r.pool_type, c.title, c.date, r.note, r.created_at
-- FROM records r
-- JOIN auth.users u ON u.id = r.user_id
-- JOIN styles s ON s.id = r.style_id
-- LEFT JOIN competitions c ON c.id = r.competition_id
-- WHERE r.style_id IN (8, 20)
--   AND u.email IN (
--     'hikaru@koishikawa.com', 'shingo@koishikawa.com', 'mika@koishikawa.com',
--     'akari@koishikawa.com', 'jyosyua@koishikawa.com', 'yurina@koishikawa.com',
--     'haruka@koishikawa.com', 'ema@koishikawa.com', 'mio@koishikawa.com',
--     'yuma@koishikawa.com', 'eishi@koishikawa.com', 'soyu@koishikawa.com',
--     'nana@koishikawa.com', 'sousuke@koishikawa.com', 'chihiro@koishikawa.com',
--     'haru@koishikawa.com', 'miharu@koishikawa.com', 'yuna@koishikawa.com',
--     'youta@koishikawa.com', 'risa.m@koishikawa.com', 'arisa@koishikawa.com',
--     'sara@koishikawa.com', 'akito@koishikawa.com', 'asahi@koishikawa.com',
--     'ryunosuke@koishikawa.com', 'yuho@koishikawa.com', 'chika@koishikawa.com',
--     'shota@koishikawa.com'
--   )
-- ORDER BY u.email, c.date;

-- ② 削除 (削除した行が RETURNING で表示される)
DELETE FROM records r
USING auth.users u
WHERE r.user_id = u.id
  AND r.style_id IN (8, 20)
  AND u.email IN (
    'hikaru@koishikawa.com', 'shingo@koishikawa.com', 'mika@koishikawa.com',
    'akari@koishikawa.com', 'jyosyua@koishikawa.com', 'yurina@koishikawa.com',
    'haruka@koishikawa.com', 'ema@koishikawa.com', 'mio@koishikawa.com',
    'yuma@koishikawa.com', 'eishi@koishikawa.com', 'soyu@koishikawa.com',
    'nana@koishikawa.com', 'sousuke@koishikawa.com', 'chihiro@koishikawa.com',
    'haru@koishikawa.com', 'miharu@koishikawa.com', 'yuna@koishikawa.com',
    'youta@koishikawa.com', 'risa.m@koishikawa.com', 'arisa@koishikawa.com',
    'sara@koishikawa.com', 'akito@koishikawa.com', 'asahi@koishikawa.com',
    'ryunosuke@koishikawa.com', 'yuho@koishikawa.com', 'chika@koishikawa.com',
    'shota@koishikawa.com'
  )
RETURNING u.email, r.style_id, r.time, r.pool_type, r.note;
