// =============================================================================
// 振り返り (目標・マイルストーン共通) の選択肢と reflectionNote 組み立て
// =============================================================================

/**
 * 選択肢の唯一の定義元。labelKey は goals.goalReflection.options.* / goals.reflection.options.*
 * の末尾キー (両名前空間で同じキー名を持つ)。
 */
export const REFLECTION_OPTIONS = [
  { id: "goal_too_high", labelKey: "goalTooHigh" },
  { id: "period_too_short", labelKey: "periodTooShort" },
  { id: "practice_insufficient", labelKey: "practiceInsufficient" },
  { id: "condition_poor", labelKey: "conditionPoor" },
  { id: "other", labelKey: "other" },
] as const;

export type ReflectionOptionId = (typeof REFLECTION_OPTIONS)[number]["id"];

export const REFLECTION_OTHER_ID: ReflectionOptionId = "other";

/**
 * 選択された id のラベルを選択順に並べ、「その他」が選択されていて otherNote があれば末尾に追記して
 * 改行で連結する (チェックを外した後に残った自由記述は無視する)。
 * 何も無ければ null (reflectionNote 列に空文字を入れない)。
 */
export function buildReflectionNote(params: {
  selectedIds: readonly string[];
  resolveLabel: (id: string) => string;
  otherNote: string;
  formatOtherNote: (note: string) => string;
}): string | null {
  const { selectedIds, resolveLabel, otherNote, formatOtherNote } = params;
  const note = [
    ...selectedIds.map((id) => resolveLabel(id) || id),
    selectedIds.includes(REFLECTION_OTHER_ID) && otherNote ? formatOtherNote(otherNote) : "",
  ]
    .filter(Boolean)
    .join("\n");
  return note || null;
}
