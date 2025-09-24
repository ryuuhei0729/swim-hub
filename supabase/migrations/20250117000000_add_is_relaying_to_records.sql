-- recordsテーブルにis_relayingカラムを追加
-- リレー種目かどうかを示すboolean型のカラム

-- is_relayingカラムを追加（デフォルト値はfalse）
ALTER TABLE records 
ADD COLUMN is_relaying BOOLEAN NOT NULL DEFAULT false;

-- インデックスを追加（リレー種目の検索用）
CREATE INDEX idx_records_is_relaying ON records(is_relaying);

-- 既存のインデックスを更新（is_relayingを含む複合インデックス）
CREATE INDEX idx_records_user_style_relaying ON records(user_id, style_id, is_relaying);
