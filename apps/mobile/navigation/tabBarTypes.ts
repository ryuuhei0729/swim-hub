import type { SFSymbol } from "sf-symbols-typescript";

/** Android 用 PNG (assets/icons/tabs) と JS 描画で使う Feather のアイコン名 */
export type TabFeatherIcon =
  | "home"
  | "clipboard"
  | "bar-chart-2"
  | "award"
  | "users"
  | "target"
  | "user";

/**
 * タブ 1 つぶんの見た目。プラットフォームごとの option に変換するのは
 * `tabBar.tsx` (JS 描画) / `tabBar.native.tsx` (ネイティブ) の `tabScreenOptions`。
 */
export interface TabVisual {
  label: string;
  /** JS 描画のタブボタンに付く testID (ナビゲーション統合テストが参照する) */
  testID: string;
  feather: TabFeatherIcon;
  /** iOS のネイティブタブバーで使う SF Symbol */
  sfSymbol: SFSymbol;
}
