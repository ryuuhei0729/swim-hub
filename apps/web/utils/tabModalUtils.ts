/**
 * タブモーダル用純粋ユーティリティ関数
 *
 * 制約: 外部副作用なし・純粋関数のみ。QA が単体テスト可能。
 */

import { parseISO, isValid } from "date-fns";

// =============================================================================
// isEntryTabVisible — エントリータブ表示判定
// =============================================================================

/**
 * 大会日付が未来のときのみ true を返す純粋関数。
 *
 * - 未来 (date > today) → true
 * - 今日・過去・null・undefined・空文字 → false
 *
 * @param date - ISO 8601 形式の日付文字列 (YYYY-MM-DD) または null/undefined
 */
export function isEntryTabVisible(date: string | null | undefined): boolean {
  if (!date) return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed > today;
}

// =============================================================================
// isDateTodayOrPast — 今日以前判定
// =============================================================================

/**
 * 日付が今日または過去かどうかを判定する純粋関数。
 *
 * @param date - ISO 8601 形式の日付文字列
 */
export function isDateTodayOrPast(date: string | null | undefined): boolean {
  if (!date) return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed <= today;
}

// =============================================================================
// getTabNavAdjacency — タブ前後遷移の隣接タブ算出
// =============================================================================

export interface TabNavAdjacency<T extends string> {
  prevTab?: T;
  nextTab?: T;
}

/**
 * 現在アクティブなタブに対する「前」「次」タブを算出する純粋関数。
 *
 * - `activeTab` が `visibleTabs` の先頭 → prevTab は undefined
 * - `activeTab` が `visibleTabs` の末尾 → nextTab は undefined
 * - `activeTab` が `visibleTabs` に含まれない不正な状態 → prev/next とも undefined
 * - `options.guardedNextTab` が算出された nextTab と一致し、かつ `options.isGuarded` が true の場合、
 *   nextTab は undefined になる (例: 未来日でレースレコードタブがガードされている場合)
 *
 * @param visibleTabs - 現在表示されているタブ ID の配列 (表示順)
 * @param activeTab - 現在アクティブなタブ ID
 * @param options - ガード対象タブとガード有無
 */
export function getTabNavAdjacency<T extends string>(
  visibleTabs: T[],
  activeTab: T,
  options?: { guardedNextTab?: T; isGuarded?: boolean },
): TabNavAdjacency<T> {
  const idx = visibleTabs.indexOf(activeTab);
  const prevTab = idx > 0 ? visibleTabs[idx - 1] : undefined;
  let nextTab = idx >= 0 && idx < visibleTabs.length - 1 ? visibleTabs[idx + 1] : undefined;
  if (nextTab && options?.guardedNextTab === nextTab && options.isGuarded) {
    nextTab = undefined;
  }
  return { prevTab, nextTab };
}

// =============================================================================
// resolveEntryTabIndex — entry.id から項目タブ(ItemTabs)の初期インデックスを解決
// =============================================================================

/**
 * エントリー編集入力画面 (CompetitionTabModal のエントリータブ) の項目サブタブ
 * (「項目1 / 項目2 / +」) を、指定した `entry.id` を持つ項目のインデックスに解決する純粋関数。
 *
 * - `targetEntryId` が指定され、`entries` 内に一致する `id` があればそのインデックスを返す
 * - `targetEntryId` が未指定、または一致する行が見つからない場合は 0 (先頭タブ) を返す
 *   (直前に他端末で削除された等の場合でも、例外・空画面にせずフォールバックする)
 * - 対応付けは `entry.id` で行う。`style_id` はリレーのレグ別行で同一 style が複数行に
 *   現れるため対応付けキーとして使えない (mobile 版 `resolveInitialEntryTabIndex` と同じ制約)
 *
 * @param entries - 項目タブに表示されているエントリー一覧 (id のみ参照)
 * @param targetEntryId - アクティブにしたいエントリーの id
 */
export function resolveEntryTabIndex(
  entries: Array<{ id: string }>,
  targetEntryId: string | null | undefined,
): number {
  if (!targetEntryId) return 0;
  const idx = entries.findIndex((entry) => entry.id === targetEntryId);
  return idx >= 0 ? idx : 0;
}
