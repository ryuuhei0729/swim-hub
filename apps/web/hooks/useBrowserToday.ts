"use client";

import { useSyncExternalStore } from "react";
import { toISODateString } from "@apps/shared/utils/date";

// 開いたまま日付が変わった場合に備え、タブに戻ったときに今日を取り直す
const subscribe = (onChange: () => void) => {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
};
const getBrowserToday = () => toISODateString(new Date());
const getServerToday = () => null;

/**
 * ブラウザの今日 (YYYY-MM-DD)。サーバー描画中とハイドレーション中は null。
 * サーバー (UTC) とブラウザで今日がずれる時間帯のハイドレーション不一致を避けるため、
 * 今日で表示が変わる部分は null の間は出さない
 */
export function useBrowserToday(): string | null {
  return useSyncExternalStore(subscribe, getBrowserToday, getServerToday);
}
