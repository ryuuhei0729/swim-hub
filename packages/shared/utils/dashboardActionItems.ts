/**
 * ダッシュボードの「対応が必要なこと」を閉じたときに保存する状態。
 * 閉じた時点に出ていた項目のキーを一緒に持ち、まだ見ていない項目が現れたら開き直すために使う
 * (件数だけで比べると、1件解決して別の1件が増えたときに見落とす)。
 */
export interface ActionItemsCollapseState {
  collapsed: boolean;
  keys: string[];
}

/** 保存先のキー (web は localStorage、mobile は AsyncStorage) */
export function actionItemsCollapseStorageKey(userId: string): string {
  return `swimhub:dashboard:actionItems:${userId}`;
}

/** 対応事項1件ごとのキー。出欠の未回答は練習・大会ごと、エントリーと記録は大会ごと */
export const actionItemKey = {
  attendance: (eventType: string, eventId: string) => `attendance:${eventType}:${eventId}`,
  entry: (competitionId: string) => `entry:${competitionId}`,
  record: (competitionId: string) => `record:${competitionId}`,
} as const;

/** 保存した文字列を読む。壊れていたら null (= 開いた状態) */
export function parseActionItemsCollapseState(
  raw: string | null | undefined,
): ActionItemsCollapseState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as ActionItemsCollapseState).collapsed === "boolean" &&
      Array.isArray((value as ActionItemsCollapseState).keys) &&
      (value as ActionItemsCollapseState).keys.every((k) => typeof k === "string")
    ) {
      return value as ActionItemsCollapseState;
    }
  } catch {
    // 壊れた値は無視して開いた状態にする
  }
  return null;
}

/**
 * 「対応が必要なこと」を開いて表示するか。
 * 閉じていても、閉じた時点に無かった項目が1つでもあれば、見落とさないよう開く。
 */
export function isActionItemsExpanded(
  saved: ActionItemsCollapseState | null,
  currentKeys: readonly string[],
): boolean {
  if (!saved || !saved.collapsed) return true;
  const seen = new Set(saved.keys);
  return currentKeys.some((key) => !seen.has(key));
}
