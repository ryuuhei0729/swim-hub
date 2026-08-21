-- ============================================================================
-- 手動実行専用スクリプト (migration ではない)
--
-- supabase/migrations/ には**置かない**。migration に置くと、無関係な機能の
-- `supabase db push` で 3 アプリ共有の本番 DB に対して一括 DELETE が
-- 意図せず走るため。実行は人間が内容を確認した上で明示的に行うこと。
-- 既存の慣例: scripts/delete-wrong-style-records.sql と同じ扱い。
--
-- 【R1-1 適用後、本スクリプトの実行は必須ではない】
-- buildStyleEntries.ts (Phase2/Phase4) の読み取り側に、この同じ不変条件で
-- 破損レコードを検知し「逆変換せず丸ごと捨てる」ガードを実装済み (R1-1)。
-- 破損レコードを編集モードで開いてそのまま保存するだけで、D2 経由で正しい
-- leg 相対値に上書きされ自己修復する。つまり本スクリプトを一度も実行しなくても、
-- 対象レコードの管理者が次に保存した時点で自然に直る。
-- 本スクリプトはあくまで「今すぐ DB 上のゴミを掃除したい場合の補助」であり、
-- 放置しても機能上の実害は増えない (フォームは破綻しない)。
--
-- ============================================================================
-- 真因 (Sprint Contract 確定・要約)
-- ============================================================================
-- 管理者代理の大会記録一括入力 UI で、リレーの split を各 leg に分配する際、
-- distance は leg 内相対に変換していたが splitTime は無変換のまま DB に書かれていた
-- (records.time は正しく leg 相対に変換済み)。この非対称は D2 (保存時の leg 相対正規化)
-- で修正済み。本スクリプトは D2 適用前に書き込まれた既存の破損データの後始末を行う
-- (前述のとおり実行は必須ではない)。
--
-- ============================================================================
-- 【重要・R1-2】検出述語はヒューリスティックであり、誤検出しうる
-- ============================================================================
-- 述語 `split_time >= record.time` は「リレー split の通算値混入」だけでなく、
-- 全く無関係な正常運用でも成立しうることが Reviewer により実証されている:
--   個人記録で split (ラップタイム) を入力したあと、**合計タイムだけを後から
--   小さく編集**すると (Web/Mobile の合計タイム編集ハンドラは種目距離と同じ split
--   しか同期せず、既存の途中経過 split は追随して縮小されない)、その途中経過 split
--   の値が新しい (小さくなった) record.time 以上になり得る。これはリレーとは
--   無関係な個人記録であり、split を削除すると正しいラップデータを失う。
--
-- そのため、本スクリプトは **述語ベースの一括 DELETE を行わない**。
-- 1. まず下記の SELECT で候補を人間が読める形で列挙する
--    (record_id, style_id, distance, is_relaying, 大会日, split 内容, 破損件数、
--    R2-5 の判別補助列)。
-- 2. 人間がその内容を目視し、「リレー由来の破損」(通常: is_relaying=true の
--    2〜4番目泳者、style が個人種目としては短距離の leg 種目、split 値が
--    record.time よりかなり大きい=leg 分のオフセットが乗っている) と
--    「個人記録の事後編集による誤検出」(is_relaying=false、または split 値が
--    record.time にごく近い) を区別する。R2-5 の `possible_relay_pattern_hint` 列は
--    この判別を助けるヒントであり、断定ではない (最終判断は必ず人間が split_times の
--    内容と record_time を見て行う)。
-- 3. リレー由来と確定した record_id だけを、下部の DELETE テンプレートに
--    明示的に列挙してから実行する。
--
-- 【実行前に必ずこの SELECT で内訳を確認する】
-- ============================================================================

SELECT
  r.id AS record_id,
  r.user_id,
  r.competition_id,
  c.date AS competition_date,
  r.style_id,
  s.name_jp AS style_name,
  s.distance AS style_distance,
  r.is_relaying,
  r.time AS record_time,
  count(*) FILTER (WHERE st.split_time >= r.time) AS offending_split_count,
  -- R2-5 (Reviewer 提案): リレー由来の破損は複数の split が offset 分だけ通算値の
  -- まま残ることが多く (legIdx>=2 の破損レコードは offset だけで1leg分以上の値になる
  -- ため複数件が該当しやすい)、個人記録の事後タイム縮小による誤検出は通常1件・
  -- record_time にごく近い値であることが多い。この非対称を単純な計算式にしたのが
  -- 以下の列であり、**断定ではなく人間の目視判断を助けるヒント**にすぎない。
  -- is_relaying=false でもリレーの誤判定 (is_relaying トグルの入力漏れ等) はあり得るし、
  -- is_relaying=true でも個人記録側の事故はゼロではないため、この列だけで削除対象を
  -- 決定しないこと。必ず split_times の内容 (JSON 列) と record_time を見て判断する。
  (r.is_relaying AND count(*) FILTER (WHERE st.split_time >= r.time) >= 2)
    AS possible_relay_pattern_hint,
  jsonb_agg(
    jsonb_build_object('distance', st.distance, 'split_time', st.split_time)
    ORDER BY st.distance
  ) AS split_times
FROM "public"."split_times" st
JOIN "public"."records" r ON r.id = st.record_id
LEFT JOIN "public"."styles" s ON s.id = r.style_id
LEFT JOIN "public"."competitions" c ON c.id = r.competition_id
WHERE r.id IN (
  SELECT st2.record_id
  FROM "public"."split_times" st2
  JOIN "public"."records" r2 ON r2.id = st2.record_id
  WHERE st2.split_time >= r2.time
)
GROUP BY r.id, r.user_id, r.competition_id, c.date, r.style_id, s.name_jp, s.distance, r.is_relaying, r.time
ORDER BY c.date DESC, r.id;

-- ============================================================================
-- 【R2-3・診断専用】isAlreadyGlobal 分岐 (新UI保存形式) が実データに存在するかの確認
-- 何も変更しない (SELECT のみ)。実行するかどうかは人間の判断に委ねる。
-- ============================================================================
-- buildStyleEntries.ts (web) の Phase2/Phase4 には `st.distance > legDist` を
-- 「新UI保存形式 (全体距離・通算値のまま保存された split)」と解釈し変換をスキップする
-- 分岐がある。Reviewer が `git log -p -S "relaySplitTimes"` で導入コミット (6e0bbef、
-- リレー全体距離スプリット機能の初出コミット) を特定し、それ以前に global distance で
-- 保存する別 UI が存在した形跡はないと確認済み。現在の唯一の書き込み経路 (新規 insert・
-- 編集時 delete+re-insert 共通) は常に `distance <= legDist` を書き、leg 自身のゴール
-- (`distance === legDist`) も保存時フィルタで除外されるため、この分岐は**実データ上
-- 到達不能 (デッドコード) の可能性が高い**。以下の SELECT はその可能性を本番 DB で
-- 確認するための診断であり、結果に応じて何かを自動的に削除・変更することはない。
--
-- 件数が 0 件であれば、isAlreadyGlobal 分岐は実データ上デッドコードである可能性が高い
-- (=このクエリ自体は診断専用で何も変更しない)。

-- 診断①: 件数だけを確認する
SELECT
  count(*) AS split_rows_exceeding_style_distance,
  count(DISTINCT st.record_id) AS distinct_records_exceeding_style_distance
FROM "public"."split_times" st
JOIN "public"."records" r ON r.id = st.record_id
JOIN "public"."styles" s ON s.id = r.style_id
WHERE s.distance IS NOT NULL
  AND st.distance > s.distance;

-- 診断②: 0件でない場合の内訳 (どのレコード・どの distance が該当するか)
SELECT
  r.id AS record_id,
  r.style_id,
  s.name_jp AS style_name,
  s.distance AS style_distance,
  r.is_relaying,
  r.time AS record_time,
  st.distance AS split_distance,
  st.split_time
FROM "public"."split_times" st
JOIN "public"."records" r ON r.id = st.record_id
JOIN "public"."styles" s ON s.id = r.style_id
WHERE s.distance IS NOT NULL
  AND st.distance > s.distance
ORDER BY r.id, st.distance;

-- ============================================================================
-- 【実行は任意・既定では何も削除されない】
-- 上記 SELECT の結果を目視確認し、リレー由来の破損と確定した record_id のみを
-- 以下の配列に人間が明示的に列挙してから、DELETE のコメントアウトを外して実行する。
-- 個人記録でタイムを事後編集したことによる誤検出 (record_id) は絶対に含めないこと。
-- そのままコピペ実行しても (コメントアウトされているため) 1 行も削除されない。
--
-- DELETE FROM "public"."split_times"
-- WHERE "record_id" IN (
--   '00000000-0000-0000-0000-000000000000'  -- 例: 人間が調査して確定した record_id
-- );
-- ============================================================================
