// =============================================================================
// タグ/カレンダー記録色 共通パレット定義 - Swim Hub共通パッケージ
// =============================================================================
// web (TagInput.tsx) / mobile (constants/tagColors.ts) で重複していたパステル
// パレットと名前ベースの決定的カラー導出ロジックを集約する。
// カレンダー記録色カスタマイズ機能でも同一パレットを再利用する
// (apps/shared/types/calendarColors.ts の Zod enum バリデーション対象)。
//
// 🚨 **ここがパレットの唯一の定義元。** 色を書き写した配列を他所に作らないこと。
// web の useTagManager.ts / TagManagementModal.tsx はここから導出している。
// =============================================================================

/**
 * タグ/カレンダー記録色として **ユーザーが選択できる** パステルカラーパレット（8色固定）。
 *
 * 2026-09-16 に 10色 → 8色へ削減した (ピッカーが2行になるのを解消するため)。
 * 外したのは `#7DD3FC` (水色。`#93C5FD` の青と紛らわしい) と
 * `#D1D5DB` (グレー。下記 DEFAULT_TAG_COLOR と役割が衝突していた)。
 *
 * ⚠️ **既存データに外した色が残っている場合がある** (移行はしない方針)。
 * 描画はそのまま行われるが、ピッカー上では選択状態にならない。
 */
export const TAG_COLORS = [
  "#93C5FD", // 青
  "#86EFAC", // 緑
  "#A3E635", // 黄緑
  "#FCA5A5", // 赤
  "#F9A8D4", // ピンク
  "#FDBA74", // オレンジ
  "#FDE047", // 黄色
  "#C4B5FD", // 紫
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/**
 * 色が未設定・不正だったときに使うフォールバック色（グレー）。
 *
 * 🚨 **`TAG_COLORS` には含めない。** 「選択肢から外す」ことと
 * 「値として無効にする」ことは別物で、この色は選択肢ではないが
 * 保存済みデータや無効入力の受け皿として引き続き有効な値である。
 * したがって `TagColor` 型にも**含まれない** (選択 UI に出さないことを型で表す)。
 */
export const DEFAULT_TAG_COLOR = "#D1D5DB";

/**
 * かつて選択肢に含まれていたが 2026-09-16 に外した色。**既存データに残っている。**
 * 新規に選ばせることはないが、保存済みの値としては有効。
 */
export const LEGACY_TAG_COLORS = [
  "#7DD3FC", // 水色 (2026-09-16 にパレットから除外)
  "#D1D5DB", // グレー (同上。DEFAULT_TAG_COLOR と同値だがこちらは「かつて選べた色」としての列挙)
] as const;

/**
 * **保存を許可する色の集合**（選択肢8色 + 旧色）。バリデーション用。
 *
 * 🚨 **これは `TAG_COLORS` より意図的に広い。8色に揃えてはいけない。**
 *
 * 理由: カレンダー記録色の保存は「変更しない側の色を既存値のまま再送する」実装
 * (CalendarColorSettings の handlePersonalChange / TeamCalendarColorSection の
 * handleChange)。検証を選択肢8色に絞ると、**旧色を保存済みのユーザーが
 * もう片方の色を変えようとした瞬間に parse() が throw して保存できなくなる**。
 * しかも旧色はピッカーに無いので選び直すこともできず、**ユーザーは自力で
 * 回復できない**。ローカル DB では該当0件だったが本番のデータは未知であり、
 * 踏んだ場合の被害が大きいのでバリデーション側を広く取る。
 *
 * つまり「ピッカーに出す色」(TAG_COLORS) と「保存してよい色」(STORABLE_TAG_COLORS) は
 * 別物として扱う。`DEFAULT_TAG_COLOR` を `TAG_COLORS` に含めないのと同じ考え方。
 *
 * 新しい色をパレットに**足す**ときは TAG_COLORS だけを増やせばよい
 * (STORABLE は自動で追従する)。色を**外す**ときは LEGACY_TAG_COLORS へ移すこと。
 */
export const STORABLE_TAG_COLORS = [...TAG_COLORS, ...LEGACY_TAG_COLORS] as const;

/** 保存を許可する色 (選択肢 + 旧色)。`TagColor` より広い */
export type StorableTagColor = (typeof STORABLE_TAG_COLORS)[number];

/**
 * ランダムなタグカラーを取得
 */
export function getRandomTagColor(): TagColor {
  // Math.floor(Math.random() * length) は常に [0, length-1] の整数になるため、
  // TAG_COLORS（固定長8の配列）の範囲外になることはない
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!;
}

/**
 * タグ名から決定的に色を導出する。
 * 候補プレビューと作成後の色を一致させるため、ランダムではなく名前ベースで決める。
 * web/mobile 間で同名タグが同じ色になるよう、アルゴリズムは変更しないこと。
 *
 * ⚠️ **`TAG_COLORS` の要素数を変えると、同じアルゴリズムのままでも
 * 既存タグ名から導出される色が変わる** (`hash % length` のため)。
 * 実際 10色→8色の削減時に既存タグの表示色は総入れ替えになっている。
 * 色の同一性を保証したい要件が将来出たら、名前→色を DB に保存する方式へ変えること。
 */
export function getColorForName(name: string): TagColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  // hash は >>> 0 で非負整数に固定されているため、% length の結果は常に [0, length-1] になり
  // TAG_COLORS（固定長8の配列）の範囲外になることはない
  // (この根拠は配列長に依存しないので、8色になっても引き続き成立する)
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}
