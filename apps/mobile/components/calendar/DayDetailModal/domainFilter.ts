import type { CalendarItem } from "@apps/shared/types/ui";
import type { CalendarItemType } from "@apps/shared/types/common";

/**
 * DayDetailModal の表示スコープ。
 * - "day": 全種別混在（ダッシュボード用、フィルタなし）
 * - "practice": 練習系のみ（練習履歴タブ用）
 * - "competition": 大会系のみ（大会記録履歴タブ用）
 */
export type DayDetailScope = "day" | "practice" | "competition";

type EntryDomain = "practice" | "competition";

/**
 * 各 CalendarItemType がどちらの表示ドメインに属するかの分類マップ。
 * `satisfies Record<CalendarItemType, EntryDomain>` により、CalendarItemType に
 * 新しい種別が追加された際、このマップへの分類追加漏れをコンパイルエラーで検知する
 * (未分類のまま allowlist から漏れて両scopeで表示されなくなるサイレント故障を防ぐ)。
 */
const TYPE_DOMAIN = {
  practice: "practice",
  team_practice: "practice",
  practice_log: "practice",
  competition: "competition",
  team_competition: "competition",
  entry: "competition",
  record: "competition",
} satisfies Record<CalendarItemType, EntryDomain>;

function typesForDomain(domain: EntryDomain): ReadonlySet<CalendarItemType> {
  const types = (Object.keys(TYPE_DOMAIN) as CalendarItemType[]).filter(
    (type) => TYPE_DOMAIN[type] === domain,
  );
  return new Set(types);
}

const PRACTICE_TYPES = typesForDomain("practice");
const COMPETITION_TYPES = typesForDomain("competition");

/**
 * scope に応じてエントリーを allowlist 方式でフィルタリングする純粋関数。
 * scope="day" は入力をそのまま（非破壊で）返す。
 */
export function filterEntriesByScope(
  entries: CalendarItem[],
  scope: DayDetailScope,
): CalendarItem[] {
  if (scope === "day") {
    return entries;
  }

  const allowlist = scope === "practice" ? PRACTICE_TYPES : COMPETITION_TYPES;
  return entries.filter((entry) => allowlist.has(entry.type));
}
