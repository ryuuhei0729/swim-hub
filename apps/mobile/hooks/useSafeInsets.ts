import { useMemo } from "react";
import {
  useSafeAreaInsets,
  initialWindowMetrics,
  type EdgeInsets,
} from "react-native-safe-area-context";

/**
 * useSafeAreaInsets のフォールバック付きラッパー
 *
 * Android の一部端末（特に3ボタンナビゲーション）で SafeAreaProvider の
 * ライブ inset イベントが 0 を返し、タブバーやフッターがシステム
 * ナビゲーションバーの背後に隠れる問題への対策。
 * initialWindowMetrics は decor view 基準でネイティブ同期計算されるため
 * イベント経路とは独立しており、こちらを下限として採用する。
 *
 * 注意: initialWindowMetrics は起動時の値のため、この max 合成は
 * portrait 固定アプリ（本アプリは orientation: "portrait"）が前提。
 */
export function useSafeInsets(): EdgeInsets {
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const initial = initialWindowMetrics?.insets;
    if (!initial) {
      return insets;
    }
    return {
      top: Math.max(insets.top, initial.top),
      bottom: Math.max(insets.bottom, initial.bottom),
      left: Math.max(insets.left, initial.left),
      right: Math.max(insets.right, initial.right),
    };
  }, [insets]);
}
