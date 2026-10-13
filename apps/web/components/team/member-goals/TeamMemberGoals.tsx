"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts";
import { StyleAPI } from "@apps/shared/api/styles";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { useTeamMemberGoalsQuery } from "@apps/shared/hooks/queries/teamMemberGoals";
import { sortTeamMemberGoals } from "@apps/shared/utils/teamMemberGoalSort";
import { excludeNonSwimmers } from "@apps/shared/utils/swimmerFilter";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamMemberGoal } from "@apps/shared/types/teamMemberGoals";
import { buildSwimStyleLabel, styleIdToCodeKey } from "@/utils/swimStyle";
import { useMembers } from "../member-management/hooks/useMembers";
import MemberGoalCard from "./MemberGoalCard";

interface TeamMemberGoalsProps {
  teamId: string;
}

type SectionKey = "upcoming" | "past" | "noCompetition";

function sectionOf(goal: TeamMemberGoal): SectionKey {
  if (!goal.competition_date) return "noCompetition";
  return isCompetitionDateInPast(goal.competition_date) ? "past" : "upcoming";
}

/**
 * 管理者向け「目標」タブ。メンバーを1人選ぶと、その目標とマイルストーンを
 * 読み取り専用で表示する。書き込み系 API・達成判定は一切呼ばない。
 */
export default function TeamMemberGoals({ teamId }: TeamMemberGoalsProps) {
  const t = useTranslations("teamMemberGoals");
  const tGoals = useTranslations("goals");
  const tAdmin = useTranslations("teamsAdmin");
  const tStyles = useTranslations("practice.styles");
  const locale = useLocale();
  const { supabase } = useAuth();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");

  const { members, loading: membersLoading, error: membersError, loadMembers } = useMembers(
    teamId,
    supabase,
  );
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // 候補提示の直前で非泳者を除外する (members 本体は絞らない)
  const candidates = useMemo(() => excludeNonSwimmers(members), [members]);

  // 候補から消えた (退会・非アクティブ・非泳者化) メンバーは未選択扱いに戻す。
  // state は書き換えず導出するので、RPC を例外になる id で呼ばない
  const activeMemberId = candidates.some((m) => m.user_id === selectedMemberId)
    ? selectedMemberId
    : "";

  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: async () => await new StyleAPI(supabase).getStyles(),
    staleTime: Infinity,
  });

  const goalsQuery = useTeamMemberGoalsQuery(supabase, teamId, activeMemberId || undefined);

  const sections = useMemo(() => {
    const sorted = sortTeamMemberGoals(goalsQuery.data ?? []);
    const grouped: Record<SectionKey, TeamMemberGoal[]> = {
      upcoming: [],
      past: [],
      noCompetition: [],
    };
    for (const goal of sorted) grouped[sectionOf(goal)].push(goal);
    return grouped;
  }, [goalsQuery.data]);

  const styleLabelOf = (goal: TeamMemberGoal): string => {
    const style = stylesQuery.data?.find((s) => s.id === goal.style_id);
    const codeKey = styleIdToCodeKey(goal.style_id);
    if (style && codeKey) return buildSwimStyleLabel(style.distance, tStyles(codeKey), locale);
    return style?.name_jp || tGoals("list.styleFallback");
  };

  const renderBody = () => {
    if (!activeMemberId) {
      return <p className="py-8 text-center text-sm text-gray-500">{t("selectMemberHint")}</p>;
    }
    // 切替直後は新しいキーが pending なので data は無く、前メンバーの目標は出ない
    if (goalsQuery.isPending) {
      return (
        <div className="animate-pulse space-y-3" role="status" aria-label={t("title")}>
          <div className="h-28 rounded bg-gray-100" />
          <div className="h-28 rounded bg-gray-100" />
        </div>
      );
    }
    if (goalsQuery.isError) {
      return (
        <div className="py-6 text-center" role="alert">
          <p className="text-sm text-red-600">
            {toUserFacingMessage(goalsQuery.error, t("loadError"))}
          </p>
          <button
            type="button"
            onClick={() => void goalsQuery.refetch()}
            className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("retry")}
          </button>
        </div>
      );
    }
    if (goalsQuery.data.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-gray-500">
          {t("empty")}
          <br />
          {t("emptyDesc")}
        </p>
      );
    }
    return (
      <div className="space-y-6">
        {(["upcoming", "past", "noCompetition"] as const).map((key) =>
          sections[key].length === 0 ? null : (
            <section key={key}>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{t(`section.${key}`)}</h3>
              <div className="space-y-3">
                {sections[key].map((goal) => (
                  <MemberGoalCard key={goal.id} goal={goal} styleLabel={styleLabelOf(goal)} />
                ))}
              </div>
            </section>
          ),
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6">
      <h2 className="mb-3 text-base font-semibold text-gray-900 sm:text-lg">{t("title")}</h2>

      {membersLoading ? (
        <div className="animate-pulse" role="status" aria-label={t("memberLabel")}>
          <div className="h-10 rounded bg-gray-100" />
        </div>
      ) : membersError ? (
        <div className="py-6 text-center" role="alert">
          <p className="text-sm text-red-600">{membersError}</p>
          <button
            type="button"
            onClick={() => void loadMembers()}
            className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("retry")}
          </button>
        </div>
      ) : candidates.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">{t("noSelectableMembers")}</p>
      ) : (
        <>
          <label htmlFor="team-member-goals-member" className="mb-1 block text-xs font-medium text-gray-700">
            {t("memberLabel")}
          </label>
          <select
            id="team-member-goals-member"
            value={activeMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("memberPlaceholder")}</option>
            {candidates.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.users.name || tAdmin("groupMemberList.noNameLabel")}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-gray-500">{t("snapshotNote")}</p>
          <div className="mt-4">{renderBody()}</div>
        </>
      )}
    </div>
  );
}
