"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  BellIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { formatDate, formatDateTime, type SupportedLocale } from "@apps/shared/utils/date";
import { useAuth } from "@/contexts";
import BaseModal from "@/components/ui/BaseModal";
import {
  useUnansweredAttendancesQuery,
  useUnsubmittedEntriesQuery,
} from "@apps/shared/hooks/queries/notifications";
import { useUnrecordedCompetitionsQuery } from "@apps/shared/hooks/queries/dashboard";
import { useTeamsAnnouncementsQuery } from "@apps/shared/hooks/queries/announcements";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
  isActionItemsExpanded,
  parseActionItemsCollapseState,
  type ActionItemsCollapseState,
} from "@apps/shared/utils/dashboardActionItems";
import type { TeamAnnouncement, TeamMembership, Team } from "@apps/shared/types";

/** チームごとに最初に出すお知らせの件数。残りは「すべて表示」で同じカードに広げる */
const ANNOUNCEMENTS_PER_TEAM = 2;

const ACTION_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-gray-800 hover:bg-amber-100 transition-colors";

interface DashboardNoticesSectionProps {
  teams: Array<TeamMembership & { team?: Team }>;
  openEntryLogForm: (competitionId: string) => void;
  onAddRecord: (competitionId: string) => void;
}

/** 黄色い行 (やること) 1件。リンク先かボタンの動作のどちらかを持つ */
interface ActionRow {
  key: string;
  /** その項目のチーム。チームを持たない項目 (記録の未入力) は null */
  teamId: string | null;
  label: string;
  href?: string;
  onClick?: () => void;
}

/**
 * ダッシュボードの「お知らせ」(モバイルの DashboardNoticesSection と同じ構成。2026-11-09 ユーザー指定)。
 * 所属チームごとの「{チーム名}のお知らせ」に、そのチームのやること (出欠の未回答・エントリー受付中で未提出)
 * を黄色い行で並べ、その下にお知らせを出す。チームを持たないやること (記録が未入力) は見出しなしで一番上に出す。
 * 見出しで開閉でき、閉じた状態はユーザーごとに localStorage へ保存する。
 * 閉じた時点に無かった項目 (やること・お知らせ) が現れたら開き直す。どちらも0件なら何も出さない。
 */
export default function DashboardNoticesSection({
  teams,
  openEntryLogForm,
  onAddRecord,
}: DashboardNoticesSectionProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("dashboard");
  const tTeams = useTranslations("teams");
  const locale = useLocale() as SupportedLocale;

  // 承認済みのチームだけを対象にする (取得側で is_active は絞り込み済み)
  const approvedTeams = useMemo(() => teams.filter((m) => m.status === "approved"), [teams]);
  const teamIds = useMemo(() => approvedTeams.map((m) => m.team_id), [approvedTeams]);

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    approvedTeams,
  );
  const { data: unsubmittedEntries = [] } = useUnsubmittedEntriesQuery(
    supabase,
    user?.id,
    approvedTeams,
  );
  const { data: unrecordedCompetitions = [] } = useUnrecordedCompetitionsQuery(supabase, user?.id);
  const announcementsByTeam = useTeamsAnnouncementsQuery(supabase, teamIds);

  // 出欠の未回答はチームごとに1行にまとめる
  const unansweredByTeam = useMemo(() => {
    const byTeam = new Map<string, { teamId: string; count: number }>();
    for (const item of unansweredAttendances) {
      const current = byTeam.get(item.teamId);
      if (current) current.count += 1;
      else byTeam.set(item.teamId, { teamId: item.teamId, count: 1 });
    }
    return [...byTeam.values()];
  }, [unansweredAttendances]);

  const actionRows: ActionRow[] = [
    ...unansweredByTeam.map((item) => ({
      key: `attendance-${item.teamId}`,
      teamId: item.teamId,
      label: t("notices.unansweredAttendance", { count: item.count }),
      href: `/teams/${item.teamId}?tab=attendance`,
    })),
    ...unsubmittedEntries.map((entry) => ({
      key: `entry-${entry.competitionId}`,
      teamId: entry.teamId,
      label: t("actionItems.entryOpen", {
        name: entry.competitionName,
        date: formatDate(entry.competitionDate, "short", locale),
      }),
      onClick: () => openEntryLogForm(entry.competitionId),
    })),
    ...unrecordedCompetitions.map((competition) => ({
      key: `record-${competition.competitionId}`,
      teamId: null,
      label: t("actionItems.unrecorded", {
        name: competition.competitionName,
        date: formatDate(competition.competitionDate, "short", locale),
      }),
      onClick: () => onAddRecord(competition.competitionId),
    })),
  ];

  const teamGroups = approvedTeams
    .map((membership, i) => ({
      teamId: membership.team_id,
      teamName: membership.team?.name || tTeams("mobile.fallbackTeamName"),
      actions: actionRows.filter((row) => row.teamId === membership.team_id),
      announcements: announcementsByTeam[i]?.announcements ?? [],
    }))
    .filter((team) => team.actions.length > 0 || team.announcements.length > 0);
  // チームを持たない項目と、念のため一覧に無いチームの項目は見出しなしで一番上に出す
  const looseActions = actionRows.filter(
    (row) => !teamGroups.some((team) => team.teamId === row.teamId),
  );

  const todoCount = actionRows.length;
  const itemKeys = [
    ...unansweredAttendances.map((a) => actionItemKey.attendance(a.eventType, a.eventId)),
    ...unsubmittedEntries.map((e) => actionItemKey.entry(e.competitionId)),
    ...unrecordedCompetitions.map((c) => actionItemKey.record(c.competitionId)),
    ...teamGroups.flatMap((team) =>
      team.announcements.map((a) => actionItemKey.announcement(a.id)),
    ),
  ];

  const [saved, setSaved] = useState<ActionItemsCollapseState | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    setSaved(
      parseActionItemsCollapseState(
        window.localStorage.getItem(actionItemsCollapseStorageKey(user.id)),
      ),
    );
  }, [user?.id]);

  if (todoCount === 0 && teamGroups.length === 0) return null;

  const expanded = isActionItemsExpanded(saved, itemKeys);

  const toggle = () => {
    const next: ActionItemsCollapseState = { collapsed: expanded, keys: itemKeys };
    setSaved(next);
    if (user?.id) {
      window.localStorage.setItem(actionItemsCollapseStorageKey(user.id), JSON.stringify(next));
    }
  };

  return (
    <section className="rounded-lg bg-white px-4 py-3 shadow lg:p-5" data-testid="dashboard-notices">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left"
      >
        <BellIcon className="h-4 w-4 shrink-0 text-blue-600 lg:h-5 lg:w-5" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-900 lg:text-base">{t("notices.title")}</span>
        {todoCount > 0 && (
          <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-4 text-white lg:px-2 lg:text-xs lg:leading-5">
            {t("notices.todoCount", { count: todoCount })}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-gray-500">
          {expanded ? t("actionItems.close") : t("actionItems.open")}
          <ChevronUpIcon
            className={`h-4 w-4 transition-transform ${expanded ? "" : "rotate-180"}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {looseActions.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {looseActions.map((row) => (
                <li key={row.key}>
                  <ActionItem row={row} />
                </li>
              ))}
            </ul>
          )}
          {teamGroups.length > 0 && (
            <div
              className={`grid grid-cols-1 gap-4 ${teamGroups.length > 1 ? "lg:grid-cols-2" : ""}`}
            >
              {teamGroups.map((team) => (
                <TeamNotices
                  key={team.teamId}
                  teamName={team.teamName}
                  actions={team.actions}
                  announcements={team.announcements}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ActionItem({ row }: { row: ActionRow }) {
  const content = (
    <>
      <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
    </>
  );
  return row.href ? (
    <Link href={row.href} className={ACTION_ITEM_CLASS} title={row.label}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={row.onClick} className={ACTION_ITEM_CLASS} title={row.label}>
      {content}
    </button>
  );
}

/**
 * 1チーム分の「{チーム名}のお知らせ」。そのチームのやること (黄色い行) を先に出し、
 * お知らせは新しい順に ANNOUNCEMENTS_PER_TEAM 件まで出して、残りは「すべて表示」で広げる
 */
function TeamNotices({
  teamName,
  actions,
  announcements,
}: {
  teamName: string;
  actions: ActionRow[];
  announcements: TeamAnnouncement[];
}) {
  const t = useTranslations("dashboard.notices");
  const [showAll, setShowAll] = useState(false);
  const hasMore = announcements.length > ANNOUNCEMENTS_PER_TEAM;
  const visible = showAll ? announcements : announcements.slice(0, ANNOUNCEMENTS_PER_TEAM);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-gray-700">
          {t("teamTitle", { teamName })}
        </h3>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
          >
            {showAll ? t("showLess") : t("showAll", { count: announcements.length })}
          </button>
        )}
      </div>
      {actions.length > 0 && (
        <ul className="space-y-2">
          {actions.map((row) => (
            <li key={row.key}>
              <ActionItem row={row} />
            </li>
          ))}
        </ul>
      )}
      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((announcement) => (
            <li key={announcement.id}>
              <AnnouncementItem announcement={announcement} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * お知らせ1件。行にはタイトルだけを出し、押すとポップアップで日時と本文を見せる (2026-11-10 ユーザー指定)
 */
function AnnouncementItem({ announcement }: { announcement: TeamAnnouncement }) {
  const locale = useLocale() as SupportedLocale;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block w-full truncate rounded-lg bg-gray-50 px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-100"
        title={announcement.title}
      >
        {announcement.title}
      </button>
      <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title={announcement.title} size="md">
        <div className="space-y-3" data-testid={`announcement-detail-${announcement.id}`}>
          <p className="text-xs text-gray-500">
            {formatDateTime(announcement.updated_at, "shortDate", locale)}
          </p>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-sm text-gray-700">
            {announcement.content}
          </p>
        </div>
      </BaseModal>
    </>
  );
}
