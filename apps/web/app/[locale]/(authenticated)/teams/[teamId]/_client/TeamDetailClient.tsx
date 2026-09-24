"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import TeamTabs from "@/components/team/TeamTabs";
import MemberDetailModal from "@/components/team/MemberDetailModal";
import TabLoadingSkeleton from "@/components/team/TabLoadingSkeleton";

// タブコンテンツは一度に1つしか表示されないため遅延読み込み。
//
// 🚨 **`loading` は必須。省略するとタブの初回クリックが飲まれる。**
// `next/dynamic` はオプション無しだと Suspense 境界を作らず (loadable.js の
// `hasSuspenseBoundary = !opts.ssr || !!opts.loading` が false → Wrap が Fragment)、
// 初回クリックのチャンク取得によるサスペンドが `page.tsx` の `<Suspense>`
// (このコンポーネントより上) まで伝播する。React は隠したツリーの effect を破棄するため
// 下の `useEffect(..., [reset])` の cleanup が走ってストアが初期化され、
// 押したタブが既定値 (出欠) へ戻ってしまう。2回目はチャンクがキャッシュ済みで
// サスペンドしないため効く ＝「初回だけ効かない」症状になる。
// `loading` を渡すと境界がここにローカル化され、この伝播が起きなくなる。
// 詳細は TabLoadingSkeleton.tsx の docstring を参照。**外さないこと。**
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
const MyMonthlyAttendance = dynamic(() => import("@/components/team/MyMonthlyAttendance"), {
  loading: TabLoadingSkeleton,
});
const TeamSettingsTab = dynamic(() => import("@/components/team/settings/TeamSettingsTab"), {
  loading: TabLoadingSkeleton,
});
import type { MemberDetail } from "@/components/team/MemberDetailModal";
import { isTeamTabType } from "@/components/team/TeamTabs";
import { TeamMembership, TeamWithMembers } from "@apps/shared/types";
import type { LeaveGuardMember } from "@apps/shared/utils/teamLeaveGuard";
import { useTeamDetailStore } from "@/stores/form/teamDetailStore";

interface TeamDetailClientProps {
  teamId: string;
  initialTeam: TeamWithMembers | null;
  initialMembership: TeamMembership | null;
  initialTab?: string;
}

/**
 * チーム詳細ページのインタラクティブ部分を担当するClient Component
 */
export default function TeamDetailClient({
  teamId,
  initialTeam,
  initialMembership,
  initialTab,
}: TeamDetailClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("teams");
  const { user } = useAuth();
  // メンバー詳細モーダルでの権限・泳者区分の変更を、開いたまま裏側の一覧
  // (TeamMemberManagement) にもバックグラウンドで反映するためのシグナル。
  // undefined のままなら一覧側は再取得しない
  const [membersRefreshSignal, setMembersRefreshSignal] = useState<number | undefined>(undefined);

  const {
    team,
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
    reset,
  } = useTeamDetailStore();

  // サーバー側から取得したデータをストアに設定
  useEffect(() => {
    setTeam(initialTeam);
    setMembership(initialMembership);
    setLoading(false);
  }, [initialTeam, initialMembership, setTeam, setMembership, setLoading]);

  // URLパラメータからタブを取得。
  //
  // 記録の目的は「同じ URL 値を再適用しないこと」。ユーザーがタブをクリックした後に
  // 同じ値の effect が再実行されると、選んだタブが URL の値へ引き戻されてしまう。
  //
  // ⚠️ 観測した値は **空 (クエリなし) も含めて必ず記録する**。空を記録せず早期 return すると
  // 「?tab=V → クエリなしのリンク → 戻るで ?tab=V」の3手目で記録がまだ "V" のままになり、
  // URL は V を指しているのに画面が別タブのままになる (同一ルートのクエリ変化では
  // アンマウントしない)。
  //
  // 🚨 **記録は useRef ではなくストア (appliedTabParam) に持ち、購読した値を deps に含める。**
  // ストアは AuthProvider.clearAllClientState() からも reset() されるが、
  // 記録を ref に置くと activeTab だけが初期化されて記録が生き残り、URL のタブが
  // 二度と反映されなくなる。さらに `useStore.getState().appliedTabParam` で読むと
  // (lint も通る自然な書き方に見えるが) reset しても deps が変化せず effect が
  // 再実行されないため、同じバグが**レビューでもテストでも正しく見える形**で残る。
  //
  // 許可判定は TeamTabs.tsx の定義配列から導出した isTeamTabType が唯一の定義元。
  //
  // ⚠️ 残債務「タブクリックで URL を更新する」を実装する場合は必ず `router.replace(?tab=X)`
  // を使うこと。`history.pushState` は Next の canonicalUrl を更新しないため
  // `useSearchParams()` がその変化を一切見ず、URL と表示タブが乖離する。
  useEffect(() => {
    const tabParam = searchParams.get("tab") || initialTab || null;
    if (appliedTabParam === tabParam) return;
    setAppliedTabParam(tabParam);
    if (tabParam && isTeamTabType(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams, initialTab, appliedTabParam, setAppliedTabParam, setActiveTab]);

  // useTeamDetailStore はモジュールシングルトン。アンマウントで初期化しないと
  // 直前に見ていたチームの team / activeTab が次のチームの初回レンダーに乗る
  // (setTeam は上の effect = ペイント後に走るため 1 フレーム遅れる)。
  // 以前は teamId prop しか使わないタブばかりで実害が無かったが、設定タブは
  // チーム名と招待コードを表示し削除まで行うので、混線すると実害が出る。
  //
  // appliedTabParam もストアに入っているので、この reset だけで
  // 「activeTab と 適用済みの ?tab=」が同時に初期化される (対で消える)。
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // 表示用のデータ（ストアから取得、なければ初期データを使用）
  const displayTeam = team || initialTeam;

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
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("detail.notFound.title")}</h1>
          <p className="text-gray-600">{t("detail.notFound.description")}</p>
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

  // アクティブなタブのコンテンツをレンダリング（閲覧専用）
  const renderTabContent = () => {
    switch (activeTab) {
      case "members":
        return (
          <TeamMemberManagement
            teamId={teamId}
            currentUserId={user?.id || ""}
            isCurrentUserAdmin={false}
            onMembershipChange={() => {
              // メンバー情報を再読み込み
              router.refresh();
            }}
            onMemberClick={handleMemberClick}
            membersRefreshSignal={membersRefreshSignal}
          />
        );
      case "practices":
        return <TeamPractices teamId={teamId} isAdmin={false} />;
      case "competitions":
        return <TeamCompetitions teamId={teamId} isAdmin={false} />;
      case "rankings":
        return <TeamRankings teamId={teamId} />;
      case "attendance":
        return <MyMonthlyAttendance teamId={teamId} />;
      case "settings":
        // 🚨 **ストア (displayTeam) ではなく props の initialTeam だけを読む。**
        // ストアはモジュールシングルトンなので、チーム A → B の遷移直後の 1 フレームは
        // A の値を返しうる。設定タブは招待コードを表示し「<名前> を削除しますか？」と
        // 確認して teamId prop のチームを消すため、混線すると
        // 「A のコードが見える」「A と表示して B を消す」になる。
        // initialTeam はこのページのレンダーごとに Server Component から渡る値で、
        // teamId prop と必ず同じチームを指す。
        if (!initialTeam) return null;
        return (
          <TeamSettingsTab
            teamId={teamId}
            teamName={initialTeam.name}
            teamDescription={initialTeam.description}
            inviteCode={initialTeam.invite_code}
            isAdmin={initialMembership?.role === "admin"}
            // getTeam() は承認待ち・退会済みを含む全メンバーシップを返す。脱退ガードは
            // 「他に管理者が残るか」を数えるので、ここで在籍中のメンバーだけに絞る。
            // 絞らないと退会済みの管理者を現役と数えて最後の管理者が抜けられてしまう。
            //
            // shared の TeamMembership.role は string 型なので、ガードが要求する
            // "admin" | "user" に明示的に絞る (admin 以外は一般メンバー扱い)。
            // `as` で迂回すると role が増えたときに型エラーで気付けない。
            members={initialTeam.team_memberships
              .filter(
                (membership) => membership.status === "approved" && membership.is_active === true,
              )
              .map<LeaveGuardMember>((membership) => ({
                user_id: membership.user_id,
                role: membership.role === "admin" ? "admin" : "user",
              }))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* チーム名・招待コードのヘッダーカードは廃止した (2026-09-16)。
          タブの上に常時2行占有していたのをやめ、招待コードは設定タブの
          「チーム情報」カード内へ移設 (components/team/settings/TeamSettingsTab.tsx)。
          チーム名は <title> (page.tsx の generateMetadata) に出る。 */}

      {/* タブナビゲーション */}
      <div className="mt-4">
        <TeamTabs activeTab={activeTab} onTabChange={setActiveTab} isAdmin={false} />
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
        isCurrentUserAdmin={false}
        onMembershipChange={() => {
          // team 等サーバー由来のデータを更新
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
