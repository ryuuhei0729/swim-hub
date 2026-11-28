"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import TeamTabs from "@/components/team/TeamTabs";
import MemberDetailModal from "@/components/team/MemberDetailModal";
import type { MemberDetail } from "@/components/team/MemberDetailModal";
import TabLoadingSkeleton from "@/components/team/TabLoadingSkeleton";
import TeamOthersTab from "@/components/team/TeamOthersTab";
import type { TeamSubScreen, TeamTabType } from "@/components/team/teamTabDefs";
import type { TeamMembership } from "@apps/shared/types";
import type { TeamScheduleLink } from "@/utils/teamView";
import { useTeamTabPrefetch } from "@/hooks/queries/useTeamTabPrefetch";

// タブコンテンツは一度に1つしか表示されないため遅延読み込み。
//
// 🚨 **`loading` は必須。省略するとタブの初回クリックが飲まれる。**
// `next/dynamic` はオプション無しだと Suspense 境界を作らず (loadable.js の
// `hasSuspenseBoundary = !opts.ssr || !!opts.loading` が false → Wrap が Fragment)、
// 初回クリックのチャンク取得によるサスペンドが `page.tsx` の `<Suspense>`
// (このコンポーネントより上) まで伝播する。React は隠したツリーの state を捨てるため、
// 押したタブが元に戻ったように見える。2回目はチャンクがキャッシュ済みで
// サスペンドしないため効く ＝「初回だけ効かない」症状になる。
// `loading` を渡すと境界がここにローカル化され、この伝播が起きなくなる。
// 詳細は TabLoadingSkeleton.tsx の docstring を参照。**外さないこと。**
const TeamMemberManagement = dynamic(() => import("@/components/team/TeamMemberManagement"), {
  loading: TabLoadingSkeleton,
});
const TeamGroupManagement = dynamic(
  () => import("@/components/team/group-management/TeamGroupManagement"),
  { loading: TabLoadingSkeleton },
);
const TeamSchedule = dynamic(() => import("@/components/team/TeamSchedule"), {
  loading: TabLoadingSkeleton,
});
const MyMonthlyAttendance = dynamic(() => import("@/components/team/MyMonthlyAttendance"), {
  loading: TabLoadingSkeleton,
});
const AdminMonthlyAttendance = dynamic(() => import("@/components/team/AdminMonthlyAttendance"), {
  loading: TabLoadingSkeleton,
});

/** メンバータブ (管理者ビュー) の表示切替 */
type MembersSegment = "members" | "groups";

interface TeamDetailClientProps {
  teamId: string;
  initialMembership: TeamMembership | null;
  /** 管理者ビューか (実際の role と AND を取った値) */
  isAdminView: boolean;
  activeTab: TeamTabType;
  onTabChange: (tab: TeamTabType) => void;
  /** タブの上に重ねる画面 (ランキング・目標・一括登録) を開く */
  onOpenSubScreen: (screen: TeamSubScreen) => void;
  /** 出欠タブのバッジ (このチームの出欠の未回答数) */
  attendanceBadgeCount?: number;
  /** メンバータブのバッジ (承認待ち数。自分が管理者のときだけ数える) */
  pendingBadgeCount?: number;
  /** 予定タブで詳細を開く練習・大会 (URL の `?practice=` / `?competition=`) */
  scheduleLink?: TeamScheduleLink | null;
  /** scheduleLink を処理し終えた */
  onScheduleLinkHandled?: () => void;
}

/**
 * チーム画面のタブと本文 (利用者ビュー・管理者ビュー共通)。
 * ヘッダー (チーム名・お知らせ・設定・表示切替) とタブの選択状態は TeamPageClient が持つ。
 *
 * タブの数は管理者ビューでも変えない (mobile の TeamDetailView と同じ)。管理者向けの機能は:
 *   - 承認待ち・グループ管理 … メンバータブ (「メンバー / グループ」切替)
 *   - 練習・大会の追加・一括登録 … 予定タブ
 *   - 出欠の受付管理 … 出欠タブ (管理者ビューでは管理用の表示に切り替わる)
 *   - メンバーの目標 … その他タブ
 */
export default function TeamDetailClient({
  teamId,
  initialMembership,
  isAdminView,
  activeTab,
  onTabChange,
  onOpenSubScreen,
  attendanceBadgeCount = 0,
  pendingBadgeCount = 0,
  scheduleLink,
  onScheduleLinkHandled,
}: TeamDetailClientProps) {
  const router = useRouter();
  const t = useTranslations("teams");
  const { user } = useAuth();
  const [membersSegment, setMembersSegment] = useState<MembersSegment>("members");
  // グループ管理は管理者ビューでのみ選べる。利用者ビューに戻したらメンバー表を出す
  const activeMembersSegment: MembersSegment = isAdminView ? membersSegment : "members";
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null);
  // メンバー詳細モーダルでの権限・泳者区分の変更を、開いたまま裏側の一覧
  // (TeamMemberManagement) にもバックグラウンドで反映するためのシグナル。
  // undefined のままなら一覧側は再取得しない
  const [membersRefreshSignal, setMembersRefreshSignal] = useState<number | undefined>(undefined);

  const isMember = initialMembership !== null;

  // 開いているタブの読み込みが終わったら、既定タブと隣のタブのデータを先読みする
  // (所属していないチームでは取得できないので先読みしない)
  useTeamTabPrefetch(teamId, activeTab, isAdminView ? "admin" : "member", isMember);

  // タブのバッジ (出欠の未回答・承認待ち) は TeamPageClient が useTeamBadgeCounts で数えて渡す。
  // 承認待ちは mobile と同じく、管理者なら表示中のビューに関係なく出す (swimhub-tasks #73)。
  // 承認・却下では invalidateTeamMemberQueries が teamKeys.pendingMembers ごと落とすので数え直される

  const renderMembersTab = () => (
    <div>
      {isAdminView && (
        <div className="px-4 pt-4" role="tablist" aria-label={t("mobile.tabMembers")}>
          <div className="flex rounded-lg bg-gray-200 p-0.5">
            {(
              [
                ["members", "mobile.tabMembers"],
                ["groups", "mobile.tabGroups"],
              ] as const
            ).map(([id, labelKey]) => {
              const isActive = activeMembersSegment === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setMembersSegment(id)}
                  data-testid={`team-members-segment-${id}`}
                  className={`flex-1 rounded-md py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-white font-bold text-gray-900 shadow-sm"
                      : "font-medium text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {activeMembersSegment === "groups" ? (
        <TeamGroupManagement teamId={teamId} />
      ) : (
        <TeamMemberManagement
          teamId={teamId}
          currentUserId={user?.id || ""}
          // 承認待ちの承認・権限変更などの管理操作は管理者ビューでだけ出す
          isCurrentUserAdmin={isAdminView}
          onMembershipChange={() => {
            // メンバー情報を再読み込み
            router.refresh();
          }}
          onMemberClick={setSelectedMember}
          membersRefreshSignal={membersRefreshSignal}
        />
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "members":
        return renderMembersTab();
      case "schedule":
        return (
          <TeamSchedule
            teamId={teamId}
            isAdmin={isAdminView}
            onOpenBulkRegister={isAdminView ? () => onOpenSubScreen("bulkRegister") : undefined}
            linkedItem={scheduleLink}
            onLinkedItemHandled={onScheduleLinkHandled}
          />
        );
      case "attendance":
        return isAdminView ? (
          <AdminMonthlyAttendance teamId={teamId} />
        ) : (
          <MyMonthlyAttendance teamId={teamId} />
        );
      case "others":
        return <TeamOthersTab isAdminView={isAdminView} onOpen={onOpenSubScreen} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <TeamTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        pendingCount={pendingBadgeCount}
        attendanceCount={attendanceBadgeCount}
      />

      <div className="bg-white rounded-lg shadow">{renderTabContent()}</div>

      {/* メンバー詳細モーダル */}
      <MemberDetailModal
        isOpen={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
        teamId={teamId}
        currentUserId={user?.id || ""}
        isCurrentUserAdmin={isAdminView}
        onMembershipChange={() => {
          // team / pendingCount 等サーバー由来のデータを更新
          router.refresh();
          // メンバー一覧 (TeamMemberManagement) をバックグラウンドで最新化する。
          // モーダル自体の表示は displayMember (MemberDetailModal 内) が
          // 即時反映するので、この再取得の完了を待つ必要はない
          setMembersRefreshSignal((prev) => (prev ?? 0) + 1);
        }}
      />
    </div>
  );
}
