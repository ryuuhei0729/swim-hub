/**
 * LP v4.2 Deco Dynamic — ラッププログレスバー ユーティリティ
 *
 * スクロール率 (0–100) を往復レーンのアニメーション状態にマッピングする。
 * ブラウザ依存なし。純粋関数のみ export する。
 */

export type LapState = {
  /** 往路バー幅 (0–100) */
  leg1Width: number;
  /** 復路バー幅 (0–100) */
  leg2Width: number;
  /** スイマーの left% (0–100) */
  swimmerLeft: number;
  /** 復路フラグ (pct > 50 で true) */
  isBack: boolean;
  /** ゴールタッチ: pct >= 99.5 で true → __stopStopwatch を呼ぶ */
  shouldStop: boolean;
};

/**
 * スクロール率 (0–100) をラップ状態に変換する。
 *
 * - 往路 (0–50%): leg1 が 0→100%、スイマーが左→右
 * - 復路 (50–100%): leg2 が 0→100%、スイマーが右→左
 *
 * @param scrollRatio  0–100 の数値 (calcScrollRatio の戻り値)
 */
export function calcLapState(scrollRatio: number): LapState {
  // 安全にクランプ（負数・100超も許容しエラーにしない）
  const pct = Math.max(0, scrollRatio);

  // 往路バー幅: min(pct, 50) * 2 → 0–100、100超入力でも 100 以下に収める
  const leg1Width = Math.max(0, Math.min(100, Math.min(pct, 50) * 2));

  // 復路バー幅: max(0, pct - 50) * 2 → 0–100、100超入力でも 100 以下に収める
  const leg2Width = Math.max(0, Math.min(100, Math.max(0, pct - 50) * 2));

  // 復路フラグ
  const isBack = pct > 50;

  // スイマー位置 (0–100 にクランプ。pct>100 等の入力で負値・100超にならないよう保護)
  // 往路: leg1Width と同じ (0→100)
  // 復路: 100 - leg2Width (100→0)
  const swimmerLeft = Math.max(0, Math.min(100, isBack ? 100 - leg2Width : leg1Width));

  // ゴールタッチ判定
  const shouldStop = pct >= 99.5;

  return { leg1Width, leg2Width, swimmerLeft, isBack, shouldStop };
}

/**
 * document.documentElement の scroll 系プロパティからスクロール率 (0–100) を計算する。
 *
 * @param scrollTop    document.documentElement.scrollTop
 * @param scrollHeight document.documentElement.scrollHeight
 * @param clientHeight document.documentElement.clientHeight
 * @returns 0–100 の数値。スクロール不可 (scrollHeight <= clientHeight) のとき 0
 */
export function calcScrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return 0;
  return (scrollTop / maxScroll) * 100;
}
