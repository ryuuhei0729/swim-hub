// =============================================================================
// チーム大会エントリー代理一括入力 - Swim Hub共通パッケージ
// entries/ 画面 (web) の UI 状態層で使う型
// =============================================================================

/**
 * エントリー代理入力フォームの1行 (UI状態)。
 *
 * 規約: `records.time` (number) と `entries.entry_time` (number | null) の
 * 混同を防ぐため、この型は裸の `time` プロパティを持たない。
 * 入力中は `entryTimeInput` (文字列1本) のみを保持し、送信境界でのみ数値化する
 * (既存 `EntryFormData.entryTime: string` と同じ規約)。
 */
export interface EntryDraftRow {
  /** UI管理用ID (DBのidではない、行の追加・削除・重複検出に使う) */
  localId: string;
  /** 既存 entries.id。新規行は null */
  existingEntryId: string | null;
  targetUserId: string;
  targetUserName: string;
  styleId: number | "";
  /** エントリータイムの入力文字列。空文字は未入力。送信境界で parseTimeFlexible で数値化する */
  entryTimeInput: string;
  note: string;
  /** この行のタイムがどこから来たか。プリフィル値の視覚的マーキングに使う */
  prefillSource: "bestTime" | "manual" | null;
  /** プリフィル直後の入力値のスナップショット (未編集判定用)。プリフィルされていない行は null */
  prefilledInput: string | null;
}
