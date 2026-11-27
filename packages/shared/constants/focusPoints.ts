/**
 * 取り組み中 (active) のフォーカスポイントを同時に持てる数。
 * DB のトリガー (enforce_focus_point_active_limit) と同じ値にしておくこと
 */
export const FOCUS_POINT_MAX_ACTIVE = 3;

/** タイトルの最大文字数 (DB の CHECK 制約と同じ) */
export const FOCUS_POINT_TITLE_MAX_LENGTH = 100;

/** メモの最大文字数 (DB の CHECK 制約と同じ) */
export const FOCUS_POINT_NOTE_MAX_LENGTH = 1000;
