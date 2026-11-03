/**
 * 画面共通の配色と面の定義
 *
 * 画面の背景は中間色 (薄いグレー)、カードは白地に細い線で区切る。影は使わない
 * (影はトースト・シート・ドロップダウンのような「浮いている」部品専用)。
 * 既存画面にはまだ直書きの色が残っているが、新しく書く/手を入れる箇所はここを参照する。
 */
export const colors = {
  /** 画面の背景。白いカードとの差が出る程度の薄いグレー (わずかに青み) */
  background: "#F1F5F9",
  /** カード・セクションの面 */
  surface: "#FFFFFF",
  /** カードの輪郭線・区切り線 */
  border: "#E5E7EB",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  primary: "#2563EB",
} as const;

export const radius = {
  /** 一覧のカード・設定のセクション */
  card: 12,
} as const;

/**
 * 一覧の中に置くカードの面。`StyleSheet.create` の中で `...cardSurface` として展開する。
 * 余白 (margin/padding) は置き場所ごとに違うので含めない。
 */
export const cardSurface = {
  backgroundColor: colors.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

/**
 * 画面の左右いっぱいに置くセクション (マイページなど)。角丸は付けず上下の線だけで区切る。
 */
export const sectionSurface = {
  backgroundColor: colors.surface,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.border,
} as const;
