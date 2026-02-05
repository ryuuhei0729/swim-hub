/**
 * タグ用プリセットカラー定義
 * Web版と同じ10色を使用
 */
export const PRESET_TAG_COLORS = [
  '#93C5FD', // 青
  '#7DD3FC', // 水色
  '#86EFAC', // 緑
  '#A3E635', // 黄緑
  '#FCA5A5', // 赤
  '#F9A8D4', // ピンク
  '#FDBA74', // オレンジ
  '#FDE047', // 黄色
  '#C4B5FD', // 紫
  '#D1D5DB', // グレー
]

/**
 * ランダムなタグカラーを取得
 */
export const getRandomTagColor = (): string => {
  return PRESET_TAG_COLORS[Math.floor(Math.random() * PRESET_TAG_COLORS.length)]
}
