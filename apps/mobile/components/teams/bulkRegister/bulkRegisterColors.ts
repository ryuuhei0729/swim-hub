/**
 * 一括登録画面の配色。練習系は緑、大会系は青で統一する
 * (予定タブのカードの記録ボタンも同じ割り当て)。
 */
export const BULK_COLORS = {
  practice: {
    main: "#16A34A",
    light: "#F0FDF4",
    border: "#BBF7D0",
    text: "#15803D",
    dot: "#22C55E",
  },
  competition: {
    main: "#2563EB",
    light: "#DBEAFE",
    border: "#BFDBFE",
    text: "#1E40AF",
    dot: "#3B82F6",
  },
} as const;
