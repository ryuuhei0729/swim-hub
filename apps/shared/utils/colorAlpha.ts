// =============================================================================
// カラーユーティリティ - Swim Hub共通パッケージ
// =============================================================================
// カレンダー記録色カスタマイズ機能で、Tailwind の静的な bg-*-100 等の
// クラスから inline style への移行に伴い、任意の hex 値を淡い背景色として
// 扱うためのヘルパー。web/mobile 共通で消費する。
//
// hexToRgba (半透明) vs mixWithWhite (不透明) の使い分け:
//   - hexToRgba: 単独で1枚だけ重なる要素(枠線・バッジ等)に使う。
//   - mixWithWhite: 入れ子構造で複数の要素が背景として重なりうる箇所
//     (例: DayDetailModal のセクション外枠 + その中の子カードの背景)に使う。
//     半透明を入れ子にすると α が合成されて内側ほど濃く見える
//     (例: 0.25 の上に 0.25 が重なると実効 ≈0.44 相当になる)。
//     mixWithWhite は常に「選択色 × ratio + 白 × (1-ratio)」の不透明色を返すため、
//     何重に重ねても濃淡が変わらず、旧 bg-green-50 相当のフラットな淡色を再現できる。
// =============================================================================

/**
 * カレンダー記録色カスタマイズのカスタム色(=デフォルト以外)適用時に使う
 * アルファ値/混色比率の名前付き定数。マジックナンバーの散在を防ぐため一元管理する。
 */
export const CALENDAR_COLOR_ALPHA = {
  /** CalendarGrid のアイテム背景(グリッド上のピル。単独要素のため半透明のままでよい) */
  GRID_ITEM_BACKGROUND: 0.35,
  /**
   * DayDetailModal のセクション外枠・カードの背景ウォッシュ(白との混色比率)。
   * 入れ子(外枠+子カード)で重なるため mixWithWhite で使う不透明比率。
   * 旧 bg-green-50/bg-blue-50 相当の淡さになるよう調整済み。
   */
  DAY_DETAIL_WRAPPER_BACKGROUND: 0.25,
  /**
   * DayDetailModal のセクション見出しバッジ背景(カスタム色時)。
   * 旧デザインの淡い bg-green-200/bg-blue-200 相当の控えめさに寄せる。
   * バッジは単独要素(入れ子で重ならない)のため hexToRgba の半透明のままでよい。
   */
  DAY_DETAIL_BADGE_BACKGROUND: 0.3,
  /**
   * DayDetailModal の強調枠線(カスタム色時)。
   * 旧デザインの淡い border-green-300/border-blue-300 相当の控えめさに寄せる。
   * 枠線は面が重ならないため hexToRgba の半透明のままでよい。
   */
  DAY_DETAIL_BORDER: 0.5,
  /**
   * DayDetailModal の小さなアクセント(タイム見出しの縦バー等、カスタム色時)。
   * 旧デザインの bg-green-500 相当の中間トーン。ベタ選択色そのままは避け、
   * 小面積要素として視認できる程度に留める。
   */
  DAY_DETAIL_ACCENT_BAR: 0.6,
} as const;

/** hex カラーコードを {r,g,b} に分解する。不正な hex は null を返す。 */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex?.replace("#", "") ?? "";
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }

  const bigint = parseInt(expanded, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * hex カラーコードを rgba() 文字列に変換する(半透明)。
 * 単独で1枚だけ重なる要素(枠線・バッジ等)向け。入れ子で重ねると濃くなるため
 * 背景が入れ子構造になる箇所には使わないこと(mixWithWhite を使う)。
 * 不正な hex の場合は防御的にニュートラルなグレーへフォールバックする。
 */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return `rgba(209, 213, 219, ${alpha})`; // #D1D5DB (グレー) フォールバック
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * 選択色と白を ratio で混ぜた不透明 hex カラーを返す(opaque tint)。
 * `ratio` は選択色の混合比率(0〜1)。半透明(rgba)と異なり常に不透明のため、
 * 入れ子で複数回重ねてもアルファ合成による濃淡変化が起きない。
 * DayDetailModal のように外枠+子カードの背景が入れ子になる箇所で使う。
 * 不正な hex の場合は防御的にニュートラルな淡いグレー(#F9FAFB)へフォールバックする。
 */
export function mixWithWhite(hex: string, ratio: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return "#F9FAFB"; // gray-50 相当 フォールバック(不透明)
  }

  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const mixChannel = (channel: number) =>
    Math.round(channel * clampedRatio + 255 * (1 - clampedRatio));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");

  return `#${toHex(mixChannel(rgb.r))}${toHex(mixChannel(rgb.g))}${toHex(mixChannel(rgb.b))}`;
}
