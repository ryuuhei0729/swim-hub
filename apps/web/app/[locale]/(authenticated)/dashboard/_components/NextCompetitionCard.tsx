"use client";

import React, { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatTimeBest } from "@apps/shared/utils/time";
import {
  buildNextCompetitionRows,
  daysUntilCompetition,
  entryStatusOn,
  formatNextCompetitionEvent,
  resolveNextCompetitionState,
  type NextCompetitionRow,
} from "@apps/shared/utils/dashboardNextCompetition";
import { useNextCompetitionQuery } from "@apps/shared/hooks/queries/dashboard";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useAuth } from "@/contexts";
import { useBrowserToday } from "@/hooks/useBrowserToday";

interface NextCompetitionCardProps {
  hasTeams: boolean;
  openEntryLogForm: (competitionId: string) => void;
  onAddCompetition: () => void;
  /**
   * 目標を設定する。competitionId は目標フォームの大会一覧 (今日以降の大会) に入るときだけ渡す。
   * 開催中の複数日大会は一覧に無く、選んでおくと画面に出ないまま保存されるので渡さない
   */
  onSetGoal: (target: { competitionId?: string; styleId: number }) => void;
  /** カード上部 (見出し・大会名・日数) を押したとき、その大会日の詳細を開く */
  onOpenDay: (date: string) => void;
}

const CARD_CLASS = "bg-white rounded-lg shadow p-4 sm:p-5";

/**
 * ダッシュボードの「次の大会」。
 * 状態は none (予定なし) / noEntries (エントリー未登録) / entries (エントリーあり) の3つで、
 * entries のときは種目ごとにエントリータイム・ベスト・目標を出す (「目標まで」の差の列は 2026-11-09 に外した。
 * 届いているかは目標ラベルの色で示す)。
 * 目標が無い種目は「目標を設定」に置き換え、押すとその大会・種目を選んだ状態で目標作成を開く。
 */
export default function NextCompetitionCard({
  hasTeams,
  openEntryLogForm,
  onAddCompetition,
  onSetGoal,
  onOpenDay,
}: NextCompetitionCardProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("dashboard.nextCompetition");
  const tCommon = useTranslations("common");
  const locale = useLocale() as SupportedLocale;
  const today = useBrowserToday();

  const { data, isLoading, isError } = useNextCompetitionQuery(supabase, user?.id);
  const { data: bestTimes = [] } = useBestTimesQuery(supabase, { userId: user?.id });

  const rows = useMemo<NextCompetitionRow[]>(
    () =>
      data
        ? buildNextCompetitionRows(data.entries, data.goals, bestTimes, data.competition.pool_type)
        : [],
    [data, bestTimes],
  );

  if (isLoading || today === null) {
    return (
      <section className={CARD_CLASS} aria-busy="true">
        <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-24 animate-pulse rounded bg-gray-100" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className={CARD_CLASS}>
        <h2 className="text-base font-semibold text-gray-900">{t("title")}</h2>
        <p className="mt-3 text-sm text-red-600">{t("loadError")}</p>
      </section>
    );
  }

  const state = resolveNextCompetitionState(data?.competition ?? null, data?.entries.length ?? 0);

  if (state === "none" || !data) {
    return (
      <section className={CARD_CLASS} data-testid="next-competition-none">
        <h2 className="text-base font-semibold text-gray-900">{t("title")}</h2>
        <div className="flex flex-col items-center px-2 py-4 text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <TrophyIcon className="h-6 w-6 text-gray-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-gray-900">{t("noneTitle")}</p>
          <p className="mt-1 max-w-sm text-xs text-gray-500">{t("noneDescription")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onAddCompetition}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("addCompetition")}
            </button>
            {hasTeams && (
              <Link
                href="/teams"
                className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                {t("viewTeamCompetitions")}
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const { competition } = data;
  const days = daysUntilCompetition(competition.date, today);
  const isOngoing = competition.date < today;
  const poolLabel =
    competition.pool_type === 1 ? tCommon("poolTypeLong") : tCommon("poolTypeShort");

  return (
    // カードのどこを押しても、その大会日の詳細 (カレンダーの日付を押したときと同じモーダル) を開く。
    // 中のボタン (「＋ 目標を設定」「エントリーする」と上部の見出しボタン) からのクリックは除く。
    // 見出しは <button> のまま残し、キーボードではそこから開く
    <section
      className={`${CARD_CLASS} cursor-pointer transition-colors hover:bg-gray-50`}
      data-testid={`next-competition-${state}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        onOpenDay(competition.date);
      }}
    >
      <h2>
        <button
          type="button"
          onClick={() => onOpenDay(competition.date)}
          className="flex w-full items-start justify-between gap-3 text-left"
          data-testid="next-competition-open-day"
        >
          <span className="min-w-0">
            {/* 「次の大会（YYYY/MM/DD）」「大会名」「場所（水路）」の3行 (2026-11-07 ユーザー指定) */}
            <span className="block text-sm font-semibold text-gray-700">
              {t("titleWithDate", { date: formatDate(competition.date, "numeric", locale) })}
            </span>
            <span className="mt-1 block truncate text-base font-bold text-gray-900">
              {competition.title ?? ""}
            </span>
            <span className="mt-0.5 block truncate text-sm text-gray-500">
              {competition.place ? t("placeWithPool", { place: competition.place, pool: poolLabel }) : poolLabel}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 text-center">
            {isOngoing || days === 0 ? (
              <span className="block text-sm font-bold text-blue-700">
                {isOngoing ? t("ongoing") : t("today")}
              </span>
            ) : (
              <>
                <span className="block text-2xl font-bold leading-tight text-blue-700">{days}</span>
                <span className="block text-[11px] text-blue-700">{t("daysLater")}</span>
              </>
            )}
          </span>
        </button>
      </h2>

      {state === "noEntries" ? (
        <NoEntries
          isTeamCompetition={!!competition.team_id}
          entryStatus={entryStatusOn(competition.date, competition.entry_status, today)}
          onEnter={() => openEntryLogForm(competition.id)}
        />
      ) : (
        <EntriesTable
          rows={rows}
          onSetGoal={(styleId) =>
            onSetGoal({ competitionId: isOngoing ? undefined : competition.id, styleId })
          }
        />
      )}
    </section>
  );
}

function NoEntries({
  isTeamCompetition,
  entryStatus,
  onEnter,
}: {
  isTeamCompetition: boolean;
  entryStatus: "before" | "open" | "closed";
  onEnter: () => void;
}) {
  const t = useTranslations("dashboard.nextCompetition");
  // チーム大会は受付状態で文言とボタンを変える。自分で登録した大会は受付状態が無いので常に登録できる
  const canEnter = !isTeamCompetition || entryStatus === "open";
  const subText = !isTeamCompetition
    ? t("personalNoEntries")
    : entryStatus === "open"
      ? t("entryOpen")
      : t("entryBefore");

  return (
    <div className="mt-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center">
      <p className="text-sm font-semibold text-gray-900">{t("noEntriesTitle")}</p>
      <p className="mt-1 text-xs text-gray-500">{subText}</p>
      {canEnter && (
        <button
          type="button"
          onClick={onEnter}
          className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {isTeamCompetition ? t("enter") : t("registerEvents")}
        </button>
      )}
    </div>
  );
}

function EntriesTable({
  rows,
  onSetGoal,
}: {
  rows: NextCompetitionRow[];
  onSetGoal: (styleId: number) => void;
}) {
  const t = useTranslations("dashboard.nextCompetition");

  // エントリー列は画面幅ではなくカードの幅で出し分ける (@sm = 384px)。
  // ダッシュボードではベストタイム表と横並びになり、広い画面でもカードが細くなるため
  return (
    <div className="mt-4 @container">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <th className="py-1.5 text-left font-medium">{t("columnEvent")}</th>
            <th className="hidden py-1.5 text-right font-medium @sm:table-cell">
              {t("columnEntryTime")}
            </th>
            <th className="py-1.5 text-right font-medium">{t("columnBest")}</th>
            <th className="py-1.5 text-right font-medium">{t("columnTarget")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entryId} className="border-b border-gray-100">
              <td className="py-2 text-left font-medium text-gray-900">
                {formatNextCompetitionEvent(row.style)}
                {row.isRelaying && (
                  <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 text-[11px] font-normal text-indigo-700">
                    {t("relay")}
                  </span>
                )}
                {!row.isRelaying && row.bestTime === null && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-[11px] font-normal text-gray-600">
                    {t("firstTime")}
                  </span>
                )}
              </td>
              <td className="hidden py-2 text-right text-gray-700 @sm:table-cell">
                {row.entryTime !== null ? formatTimeBest(row.entryTime) : "—"}
              </td>
              <td className="py-2 text-right text-gray-700">
                {row.bestTime !== null ? formatTimeBest(row.bestTime) : "—"}
              </td>
              {row.isRelaying ? (
                <td className="py-2 text-right text-gray-400">
                  —
                </td>
              ) : row.targetTime === null ? (
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onSetGoal(row.styleId)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {t("setGoal")}
                  </button>
                </td>
              ) : (
                <td className="py-2 text-right">
                  <TargetLabel goalId={row.goalId} targetTime={row.targetTime} gap={row.gapToTarget} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 目標タイムのラベル。押すと目標ページでその目標を選んだ状態で開く (2026-11-07 ユーザー指定)。
 * 色: ベストが目標に届いていなければ橙、届いていれば緑、ベストが無ければ灰
 */
function TargetLabel({
  goalId,
  targetTime,
  gap,
}: {
  goalId: string | null;
  targetTime: number;
  gap: number | null;
}) {
  const t = useTranslations("dashboard.nextCompetition");
  const time = formatTimeBest(targetTime);
  const tone =
    gap === null
      ? "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
      : gap >= 0
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
  const className = `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`;
  if (!goalId) return <span className={className}>{time}</span>;
  return (
    <Link
      href={`/goals?goalId=${encodeURIComponent(goalId)}`}
      className={className}
      aria-label={t("openGoal", { time })}
    >
      {time}
    </Link>
  );
}
