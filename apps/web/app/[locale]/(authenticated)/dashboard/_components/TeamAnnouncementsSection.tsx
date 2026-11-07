"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { TeamAnnouncements } from "@/components/team/TeamAnnouncements";
import { useTeamAnnouncementsQuery } from "@apps/shared/hooks/queries/announcements";
import type { TeamMembership, Team } from "@apps/shared/types";

interface TeamAnnouncementsSectionProps {
  teams: Array<TeamMembership & { team?: Team }>;
}

/**
 * チームのお知らせセクション。
 * 出欠の未回答・エントリー未提出は「対応が必要なこと」(ActionItemsSection) に出す。
 * どのチームにもお知らせが無ければ何も出さない (外枠は empty:hidden で消え、カレンダーが全幅になる)。
 */
export default function TeamAnnouncementsSection({ teams }: TeamAnnouncementsSectionProps) {
  if (teams.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 empty:hidden xl:w-[380px] xl:shrink-0">
      {teams.map((teamMembership) => (
        <TeamCard key={teamMembership.team_id} teamMembership={teamMembership} />
      ))}
    </div>
  );
}

function TeamCard({ teamMembership }: { teamMembership: TeamMembership & { team?: Team } }) {
  const { supabase } = useAuth();
  const t = useTranslations("dashboard");
  const teamId = teamMembership.team_id;

  const { data: announcements = [] } = useTeamAnnouncementsQuery(supabase, {
    teamId,
    viewOnly: true,
  });

  if (announcements.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-2 sm:mb-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            {teamMembership.team?.name} {t("announcements.title")}
          </h2>
          {teamMembership.role === "admin" && (
            <span className="text-xs text-gray-500">{t("announcements.adminRole")}</span>
          )}
        </div>
        <TeamAnnouncements
          teamId={teamId}
          isAdmin={teamMembership.role === "admin"}
          viewOnly={true}
          hideEmptyMessage={true}
        />
      </div>
    </div>
  );
}
