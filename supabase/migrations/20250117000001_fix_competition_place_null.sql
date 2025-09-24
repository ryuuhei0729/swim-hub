-- competitionsテーブルのplaceカラムのnull値を修正
-- 既存のnull値を空文字列に置き換える

UPDATE competitions 
SET place = '' 
WHERE place IS NULL;

-- placeカラムをNOT NULL制約から解放（オプショナルにする）
ALTER TABLE competitions 
ALTER COLUMN place DROP NOT NULL;
