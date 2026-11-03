/** Feather のアイコン名。JS 描画はこの名前で描き、ネイティブは同じ形の PNG (assets/icons/tabs) を使う */
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
}
