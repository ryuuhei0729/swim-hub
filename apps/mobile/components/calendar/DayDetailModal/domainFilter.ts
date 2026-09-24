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

/**
 * CalendarItem からその大会IDを解決する（record/entry/competition/team_competition
 * いずれの種別にも対応する唯一の定義元）。DayDetailModal.tsx に散在していた同種の抽出
 * ロジックはここに集約し、片方だけ更新されて静かに壊れるのを防ぐ。
 *
 * - record: metadata.competition.id を優先し、無ければ metadata.record.competition_id、
 *   それも無ければ item.id 自体（calendar_view の record 型行は competitions.id を
 *   そのまま item.id として出す）にフォールバックする
 * - entry: metadata.competition.id を優先し、無ければ metadata.entry.competition_id。
 *   record と異なり item.id へはフォールバックしない（entry.id は entries.id であり
 *   競技会IDと無関係なため）
 * - competition/team_competition: item.id 自体が競技会ID
 * - それ以外の種別（練習系）は競技会と無関係なため undefined を返す
 */
export function getCompetitionId(item: CalendarItem): string | undefined {
  switch (item.type) {
    case "record":
      return (
        item.metadata?.competition?.id ?? item.metadata?.record?.competition_id ?? item.id
      );
    case "entry":
      return item.metadata?.competition?.id ?? item.metadata?.entry?.competition_id;
    case "competition":
    case "team_competition":
      return item.id;
    default:
      return undefined;
  }
}

/**
 * scope="practice"/"competition" のとき、targetId に一致する1件(または大会IDが一致する
 * 複数件)だけに絞り込む純粋関数。scope="day"、または targetId 未指定のときは非破壊で
 * entries をそのまま返す(ダッシュボード無変更)。
 *
 * 一致判定は「item.id === targetId」または「getCompetitionId(item) === targetId」の
 * OR。前者は練習ログ/練習/大会そのものをタップしたケース、後者は大会タブで
 * 大会IDをターゲットに渡し、その大会に属する entry/record を残すケースに対応する。
 */
export function filterEntriesByTargetId(
  entries: CalendarItem[],
  scope: DayDetailScope,
  targetId?: string,
): CalendarItem[] {
  if (scope === "day" || !targetId) {
    return entries;
  }

  return entries.filter(
    (entry) => entry.id === targetId || getCompetitionId(entry) === targetId,
  );
}
