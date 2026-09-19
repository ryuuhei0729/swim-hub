"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import TeamAdminTabs from "@/components/team/TeamAdminTabs";
import { isTeamAdminTabType } from "@/components/team/TeamAdminTabs";
import MemberDetailModal from "@/components/team/MemberDetailModal";
import TabLoadingSkeleton from "@/components/team/TabLoadingSkeleton";

// タブコンテンツは一度に1つしか表示されないため遅延読み込み。
//
// 🚨 **`loading` は必須。** 一般ページ (teams/[teamId]/_client/TeamDetailClient.tsx) と
// 同じ構造上の穴がここにもある: `next/dynamic` はオプション無しだと Suspense 境界を
// 作らないため、初回クリックのサスペンドが `page.tsx` の `<Suspense>` まで伝播し、
// 隠されたツリーの effect が破棄される。
//
// 管理ページで「初回クリックが飲まれる」症状が出ていないのは、**この画面には
// ストアを書き換える cleanup が無い**から (TeamAdminClient は unmount 時の
// `reset()` を持たない)。effect の破棄自体は同様に起きており、
// 将来この画面に cleanup を足した瞬間に同じバグが再発する。
// またスケルトンが無いとチャンク取得中に本文が空になり「押しても無反応」に見える。
// 詳細は TabLoadingSkeleton.tsx の docstring を参照。**外さないこと。**
const TeamAnnouncements = dynamic(
  () => import("@/components/team/TeamAnnouncements").then((m) => ({ default: m.TeamAnnouncements })),
  { loading: TabLoadingSkeleton },
);
const TeamMemberManagement = dynamic(() => import("@/components/team/TeamMemberManagement"), {
  loading: TabLoadingSkeleton,
});
const TeamPractices = dynamic(() => import("@/components/team/TeamPractices"), {
  loading: TabLoadingSkeleton,
});
const TeamCompetitions = dynamic(() => import("@/components/team/TeamCompetitions"), {
  loading: TabLoadingSkeleton,
});
const TeamRankings = dynamic(() => import("@/components/team/rankings/TeamRankings"), {
  loading: TabLoadingSkeleton,
});
const TeamSettings = dynamic(() => import("@/components/team/TeamSettings"), {
  loading: TabLoadingSkeleton,
});
const TeamBulkRegister = dynamic(() => import("@/components/team/TeamBulkRegister"), {
  loading: TabLoadingSkeleton,
});
const AdminMonthlyAttendance = dynamic(() => import("@/components/team/AdminMonthlyAttendance"), {
  loading: TabLoadingSkeleton,
});
const TeamGroupManagement = dynamic(
  () => import("@/components/team/group-management/TeamGroupManagement"),
  { loading: TabLoadingSkeleton },
);
import type { MemberDetail } from "@/components/team/MemberDetailModal";
import { TeamMembership, TeamWithMembers } from "@swim-hub/shared/types";
import { useTeamAdminStore } from "@/stores/form/teamAdminStore";
import { TeamMembersAPI } from "@apps/shared/api/teams/members";
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";

interface TeamAdminClientProps {
  teamId: string;
  initialTeam: TeamWithMembers | null;
  initialMembership: TeamMembership | null;
  initialTab?: string;
}

/**
 * チーム管理ページのインタラクティブ部分を担当するClient Component
 */
export default function TeamAdminClient({
  teamId,
  initialTeam,
  initialMembership,
  initialTab,
}: TeamAdminClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("teamsAdmin");
  const { user, supabase } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  // メンバー詳細モーダルでの権限・泳者区分の変更を、開いたまま裏側の一覧
  // (TeamMemberManagement) にもバックグラウンドで反映するためのシグナル。
  // undefined のままなら一覧側は再取得しない
  const [membersRefreshSignal, setMembersRefreshSignal] = useState<number | undefined>(undefined);

  const {
    team,
    membership,
    loading,
    activeTab,
    selectedMember,
    isMemberModalOpen,
    setTeam,
    setMembership,
    setLoading,
    setActiveTab,
    openMemberModal,
    closeMemberModal,
    appliedTabParam,
    setAppliedTabParam,
  } = useTeamAdminStore();

  // サーバー側から取得したデータをストアに設定
  useEffect(() => {
    setTeam(initialTeam);
    setMembership(initialMembership);
    setLoading(false);
  }, [initialTeam, initialMembership, setTeam, setMembership, setLoading]);

  // 表示用のデータ（ストアから取得、なければ初期データを使用）
  const displayTeam = team || initialTeam;
  const displayMembership = membership || initialMembership;

  // URLパラメータからタブを取得。
  //
  // ref の目的は「同じ URL 値を再適用しないこと」。ユーザーがタブをクリックした後に
  // 同じ値の effect が再実行されると、選んだタブが URL の値へ引き戻されてしまう。
  //
  // ⚠️ 観測した値は **空 (クエリなし) も含めて必ず記録する**。空を記録せず早期 return すると
  // 「?tab=V → クエリなしのリンク → 戻るで ?tab=V」の3手目で ref がまだ "V" のままになり、
  // URL は V を指しているのに画面が別タブのままになる (同一ルートのクエリ変化では
  // アンマウントしない)。
  //
  // 🚨 **記録は useRef ではなくストア (appliedTabParam) に持ち、購読した値を deps に含める。**
  // ストアは AuthProvider.clearAllClientState() からも reset() される。記録を ref に
  // 置くと activeTab だけが初期化されて記録が生き残り、URL のタブが二度と反映されない。
  // `useTeamAdminStore.getState().appliedTabParam` で読むのも不可 — reset しても
  // deps が変化せず effect が再実行されないため、同じバグが静かに残る。
  // (一般ページの TeamDetailClient と同じ構造。片方だけ直さないこと)
  //
  // 許可判定は TeamAdminTabs.tsx の定義配列から導出した isTeamAdminTabType が
  // 唯一の定義元。
  //
  // ⚠️ 残債務「タブクリックで URL を更新する」を実装する場合は必ず `router.replace(?tab=X)`
  // を使うこと。`history.pushState` は Next の canonicalUrl を更新しないため
  // `useSearchParams()` がその変化を一切見ず、URL と表示タブが乖離する。
  useEffect(() => {
    const tabParam = searchParams.get("tab") || initialTab || null;
    if (appliedTabParam === tabParam) return;
    setAppliedTabParam(tabParam);
    if (tabParam && isTeamAdminTabType(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams, initialTab, appliedTabParam, setAppliedTabParam, setActiveTab]);

  // 承認待ち数を取得
  useEffect(() => {
    const loadPendingCount = async () => {
      if (displayMembership?.role !== "admin") return;

      try {
        const api = new TeamMembersAPI(supabase);
        const count = await api.countPending(teamId);
        setPendingCount(count);
      } catch (err) {
        console.error("承認待ち数の取得に失敗:", err);
      }
    };

    if (displayTeam && displayMembership?.role === "admin") {
      loadPendingCount();
    }
  }, [teamId, displayTeam, displayMembership, supabase]);

  if (loading && !displayTeam) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!displayTeam) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("client.notFound.title")}</h1>
          <p className="text-gray-600">
            {t("client.notFound.description")}
          </p>
        </div>
      </div>
    );
  }

  // 管理者権限チェック（このページは管理者専用）
  if (displayMembership?.role !== "admin") {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("client.unauthorized.title")}</h1>
          <p className="text-gray-600">{t("client.unauthorized.description")}</p>
        </div>
      </div>
    );
  }

  const handleMemberClick = (member: MemberDetail) => {
    openMemberModal(member);
  };

  const handleCloseMemberModal = () => {
    closeMemberModal();
  };

  // アクティブなタブのコンテンツをレンダリング（管理者モード）
  const renderTabContent = () => {
    switch (activeTab) {
      case "announcements":
        return <TeamAnnouncements teamId={teamId} isAdmin={true} viewOnly={false} />;
      case "members":
        return (
          <TeamMemberManagement
            teamId={teamId}
            currentUserId={user?.id || ""}
            isCurrentUserAdmin={true}
            onMembershipChange={() => {
              // メンバー情報を再読み込み
              router.refresh();
            }}
            onMemberClick={handleMemberClick}
            membersRefreshSignal={membersRefreshSignal}
          />
        );
      case "groups":
        return <TeamGroupManagement teamId={teamId} />;
      case "practices":
        return <TeamPractices teamId={teamId} isAdmin={true} />;
      case "competitions":
        return <TeamCompetitions teamId={teamId} isAdmin={true} />;
      case "rankings":
        return <TeamRankings teamId={teamId} />;
      case "attendance":
        return <AdminMonthlyAttendance teamId={teamId} />;
      case "bulk-register":
        return <TeamBulkRegister teamId={teamId} isAdmin={true} />;
      case "settings":
        return (
          <TeamSettings
            teamId={teamId}
            teamName={displayTeam.name}
            teamDescription={displayTeam.description || undefined}
            isAdmin={true}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* チームヘッダー */}
      <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 wrap-break-word">
              {displayTeam.name}
            </h1>
            {displayTeam.description && (
              <p className="text-xs sm:text-sm text-gray-600 wrap-break-word">
                {displayTeam.description}
              </p>
            )}
          </div>
          {displayTeam.invite_code && (
            <div className="w-full md:w-auto md:shrink-0">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5 w-full md:w-auto">
                <div className="flex flex-row items-center gap-2">
                  <label className="block text-xs font-medium text-gray-700 whitespace-nowrap">
                    {t("client.inviteCodeLabel")}
                  </label>
                  <input
                    type="text"
                    value={displayTeam.invite_code}
                    readOnly
                    className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-xs font-mono font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(displayTeam.invite_code || "");
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 2000);
                    }}
                    className="inline-flex items-center justify-center px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                    title={t("common.copyTitle")}
                  >
                    {isCopied ? (
                      <CheckIcon className="h-3 w-3 text-green-600" />
                    ) : (
                      <ClipboardDocumentIcon className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="mt-4">
        <TeamAdminTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingCount={pendingCount}
        />
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white rounded-lg shadow">{renderTabContent()}</div>

      {/* メンバー詳細モーダル */}
      <MemberDetailModal
        isOpen={isMemberModalOpen}
        onClose={handleCloseMemberModal}
        member={selectedMember}
        teamId={teamId}
        currentUserId={user?.id || ""}
        isCurrentUserAdmin={true}
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
