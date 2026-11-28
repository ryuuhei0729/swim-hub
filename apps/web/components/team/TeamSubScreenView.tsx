"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import type { TeamWithMembers } from "@apps/shared/types";
import type { LeaveGuardMember } from "@apps/shared/utils/teamLeaveGuard";
import TabLoadingSkeleton from "./TabLoadingSkeleton";
import type { TeamSubScreen } from "./teamTabDefs";

// 画面は一度に1つしか表示されないため遅延読み込み。
// 🚨 `loading` は必須 (無いと初回のサスペンドが page.tsx の <Suspense> まで伝播する。
// 詳細は TabLoadingSkeleton.tsx の docstring)。
const TeamAnnouncements = dynamic(
  () => import("./TeamAnnouncements").then((m) => ({ default: m.TeamAnnouncements })),
  { loading: TabLoadingSkeleton },
);
const TeamSettingsTab = dynamic(() => import("./settings/TeamSettingsTab"), {
  loading: TabLoadingSkeleton,
});
const TeamRankings = dynamic(() => import("./rankings/TeamRankings"), {
  loading: TabLoadingSkeleton,
});
const TeamMemberGoals = dynamic(() => import("./member-goals/TeamMemberGoals"), {
  loading: TabLoadingSkeleton,
});
const TeamBulkRegister = dynamic(() => import("./TeamBulkRegister"), {
  loading: TabLoadingSkeleton,
});

/** 画面の見出し (`teams` 名前空間。一括登録だけ `teamsAdmin` なので別に扱う) */
const TITLE_KEYS = {
  announcements: "mobile.headerAnnouncements",
  settings: "mobile.headerSettings",
  rankings: "mobile.others.rankingsTitle",
  goals: "mobile.others.goalsTitle",
} as const satisfies Record<Exclude<TeamSubScreen, "bulkRegister">, string>;

export interface TeamSubScreenViewProps {
  screen: TeamSubScreen;
  teamId: string;
  /**
   * 🚨 設定画面はストアではなく Server Component から渡る team だけを読む
   * (チーム A → B の遷移直後に A の招待コードを出したり、A と表示して B から脱退したりしないため)。
   */
  team: TeamWithMembers;
  isAdminView: boolean;
  onBack: () => void;
}

/**
 * タブの上に重ねて開く画面 (お知らせ・チーム設定・ランキング・メンバーの目標・一括登録)。
 * mobile ではスタックに積む別画面なので、Web でもタブを隠して「戻る」で閉じる形にしている。
 */
export default function TeamSubScreenView({
  screen,
  teamId,
  team,
  isAdminView,
  onBack,
}: TeamSubScreenViewProps) {
  const t = useTranslations("teams");
  const tAdmin = useTranslations("teamsAdmin");
  const tCommon = useTranslations("common");
  const title = screen === "bulkRegister" ? tAdmin("tabs.bulkRegister") : t(TITLE_KEYS[screen]);

  const renderContent = () => {
    switch (screen) {
      case "announcements":
        // 管理者ビューでは下書きも含めて作成・編集・削除できる。利用者ビューは公開中のものを読むだけ
        return isAdminView ? (
          <TeamAnnouncements teamId={teamId} isAdmin={true} viewOnly={false} />
        ) : (
          <div className="p-4">
            <TeamAnnouncements teamId={teamId} isAdmin={false} viewOnly={true} />
          </div>
        );
      case "settings":
        return (
          <TeamSettingsTab
            teamId={teamId}
            teamName={team.name}
            teamDescription={team.description}
            inviteCode={team.invite_code}
            // チーム情報の編集は管理者ビューのときだけ (mobile の TeamSettingsTab と同じ)
            isAdmin={isAdminView}
            // getTeam() は承認待ち・退会済みを含む全メンバーシップを返す。脱退ガードは
            // 「他に管理者が残るか」を数えるので、ここで在籍中のメンバーだけに絞る。
            // shared の TeamMembership.role は string 型なので "admin" | "user" に明示的に絞る
            members={team.team_memberships
              .filter(
                (membership) => membership.status === "approved" && membership.is_active === true,
              )
              .map<LeaveGuardMember>((membership) => ({
                user_id: membership.user_id,
                role: membership.role === "admin" ? "admin" : "user",
              }))}
          />
        );
      case "rankings":
        return <TeamRankings teamId={teamId} />;
      case "goals":
        return <TeamMemberGoals teamId={teamId} />;
      case "bulkRegister":
        return <TeamBulkRegister teamId={teamId} isAdmin={isAdminView} />;
      default:
        return null;
    }
  };

  return (
    <div data-testid={`team-sub-screen-${screen}`}>
      <div className="bg-white rounded-lg shadow mb-4 flex items-center gap-2 px-2 py-2 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="team-sub-screen-back"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          {tCommon("back")}
        </button>
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{title}</h2>
      </div>
      <div className="bg-white rounded-lg shadow">{renderContent()}</div>
    </div>
  );
}
