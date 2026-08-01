/**
 * body スクロールロックの参照カウント管理。
 *
 * ConfirmDialog / BottomSheet(SortBottomSheet, FilterBottomSheet) など、複数のオーバーレイが
 * 同時に(あるいは連続して)開閉されるケースで、各コンポーネントが個別に
 * `document.body.style.overflow` を保存・復元すると「後勝ち」の originalOverflow 上書きにより
 * 片方が閉じた瞬間にもう片方が開いているのにスクロールロックが解除されてしまう競合が起きる。
 *
 * このモジュールはロックの参照カウントとロック前の overflow 値をモジュールスコープで一元管理し、
 * カウントが 0 に戻った時点でのみ元の値へ復元することで、複数オーバーレイの多重開閉でも
 * 安全にロック/解除できるようにする。
 */

let lockCount = 0;
let originalOverflow: string | null = null;

/**
 * body のスクロールをロックする。呼び出しごとに参照カウントを1増やし、
 * 最初の呼び出し時のみ元の overflow 値を保存する。
 *
 * @returns ロック解除関数。呼び出すと参照カウントを1減らし、0になった時点で
 *          元の overflow 値に復元する。二重呼び出しをしても安全(1回目以降は何もしない)。
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = originalOverflow ?? "";
      originalOverflow = null;
    }
  };
}
