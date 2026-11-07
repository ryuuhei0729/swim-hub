"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronRightIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { useAuth } from "@/contexts";
import {
  useUnansweredAttendancesQuery,
  useUnsubmittedEntriesQuery,
} from "@apps/shared/hooks/queries/notifications";
import { useUnrecordedCompetitionsQuery } from "@apps/shared/hooks/queries/dashboard";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
  isActionItemsExpanded,
  parseActionItemsCollapseState,
  type ActionItemsCollapseState,
} from "@apps/shared/utils/dashboardActionItems";
import type { TeamMembership, Team } from "@apps/shared/types";

interface ActionItemsSectionProps {
  teams: Array<TeamMembership & { team?: Team }>;
  openEntryLogForm: (competitionId: string) => void;
  onAddRecord: (competitionId: string) => void;
}

const ITEM_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-amber-50 transition-colors";

/**
 * ダッシュボードの「対応が必要なこと」。
 * 出欠の未回答 (チームごと)・エントリー受付中で未提出の大会・記録が未入力の大会を並べる。
 * 見出しで開閉でき、閉じた状態はユーザーごとに localStorage へ保存する。
 * 閉じた時点に無かった項目が現れたら開き直す。0件なら何も出さない。
 */
export default function ActionItemsSection({
  teams,
  openEntryLogForm,
  onAddRecord,
}: ActionItemsSectionProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("dashboard.actionItems");
  const locale = useLocale() as SupportedLocale;

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    teams,
  );
  const { data: unsubmittedEntries = [] } = useUnsubmittedEntriesQuery(supabase, user?.id, teams);
  const { data: unrecordedCompetitions = [] } = useUnrecordedCompetitionsQuery(supabase, user?.id);

  // 出欠の未回答はチームごとに1行にまとめる
  const unansweredByTeam = useMemo(() => {
    const byTeam = new Map<string, { teamId: string; teamName: string; count: number }>();
    for (const item of unansweredAttendances) {
      const current = byTeam.get(item.teamId);
      if (current) current.count += 1;
      else byTeam.set(item.teamId, { teamId: item.teamId, teamName: item.teamName, count: 1 });
    }
    return [...byTeam.values()];
  }, [unansweredAttendances]);

  const total = unansweredByTeam.length + unsubmittedEntries.length + unrecordedCompetitions.length;
  const itemKeys = useMemo(
    () => [
      ...unansweredAttendances.map((a) => actionItemKey.attendance(a.eventType, a.eventId)),
      ...unsubmittedEntries.map((e) => actionItemKey.entry(e.competitionId)),
      ...unrecordedCompetitions.map((c) => actionItemKey.record(c.competitionId)),
    ],
    [unansweredAttendances, unsubmittedEntries, unrecordedCompetitions],
  );

  const [saved, setSaved] = useState<ActionItemsCollapseState | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    setSaved(
      parseActionItemsCollapseState(
        window.localStorage.getItem(actionItemsCollapseStorageKey(user.id)),
      ),
    );
  }, [user?.id]);

  if (total === 0) return null;

  const expanded = isActionItemsExpanded(saved, itemKeys);

  const toggle = () => {
    const next: ActionItemsCollapseState = { collapsed: expanded, keys: itemKeys };
    setSaved(next);
    if (user?.id) {
      window.localStorage.setItem(actionItemsCollapseStorageKey(user.id), JSON.stringify(next));
    }
  };

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4"
      data-testid="dashboard-action-items"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left"
      >
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <span className="text-sm font-semibold text-amber-900">{t("title")}</span>
        <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold leading-5 text-white">
          {t("count", { count: total })}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-amber-700">
          {expanded ? t("close") : t("open")}
          <ChevronUpIcon
            className={`h-4 w-4 transition-transform ${expanded ? "" : "rotate-180"}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {unansweredByTeam.map((item) => (
            <li key={`attendance-${item.teamId}`}>
              <Link href={`/teams/${item.teamId}?tab=attendance`} className={ITEM_CLASS}>
                <span className="min-w-0">
                  {t("unansweredAttendance", { count: item.count, teamName: item.teamName })}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              </Link>
            </li>
          ))}
          {unsubmittedEntries.map((entry) => (
            <li key={`entry-${entry.competitionId}`}>
              <button
                type="button"
                onClick={() => openEntryLogForm(entry.competitionId)}
                className={ITEM_CLASS}
              >
                <span className="min-w-0">
                  {t("entryOpen", {
                    name: entry.competitionName,
                    date: formatDate(entry.competitionDate, "short", locale),
                  })}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              </button>
            </li>
          ))}
          {unrecordedCompetitions.map((competition) => (
            <li key={`record-${competition.competitionId}`}>
              <button
                type="button"
                onClick={() => onAddRecord(competition.competitionId)}
                className={ITEM_CLASS}
              >
                <span className="min-w-0">
                  {t("unrecorded", {
                    name: competition.competitionName,
                    date: formatDate(competition.competitionDate, "short", locale),
                  })}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
