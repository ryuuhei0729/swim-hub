"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import BaseModal from "@/components/ui/BaseModal";
import { useTranslations } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { useMemberDetail } from "@/hooks/useMemberDetail";
import { useBestTimes } from "@/hooks/useBestTimes";
import { ProfileSection } from "@/components/member-detail/ProfileSection";
import { AdminControls } from "@/components/member-detail/AdminControls";
import { BestTimesTable } from "@/components/member-detail/BestTimesTable";
import { RoleChangeModal } from "@/components/member-detail/RoleChangeModal";
import { SwimmerStatusChangeModal } from "@/components/member-detail/SwimmerStatusChangeModal";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import type { MemberDetail } from "@/types/member-detail";

// 型を再エクスポート（後方互換性のため）
export type { MemberDetail, BestTime } from "@/types/member-detail";

export interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberDetail | null;
  teamId: string;
  currentUserId: string;
  isCurrentUserAdmin: boolean;
  onMembershipChange?: () => void;
}

export default function MemberDetailModal({
  isOpen,
  onClose,
  member,
  teamId,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange,
}: MemberDetailModalProps) {
  const [isRoleChangeConfirmOpen, setIsRoleChangeConfirmOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<"admin" | "user" | null>(null);
  const [isSwimmerChangeConfirmOpen, setIsSwimmerChangeConfirmOpen] = useState(false);
  const [pendingIsSwimmer, setPendingIsSwimmer] = useState<boolean | null>(null);
  const t = useTranslations("teams");

  // `member` prop は呼び出し元 (Zustand ストアのスナップショット、または呼び出し元の
  // ローカル state) が持つ固定オブジェクト。呼び出し元は router.refresh() 等の
  // バックグラウンド再取得でしかこれを更新しないため、モーダルを開いたまま
  // 権限・泳者区分を変更しても `member` 自体は古いまま反映されない。
  // このモーダル内で完結する `displayMember` を持ち、変更成功時に直接上書きすることで
  // 呼び出し元の再取得を待たずにモーダル表示を即時反映する。
  //
  // 🚨 再同期は「モーダルが開いた瞬間」または「表示中のメンバーが変わった瞬間」だけに限定する。
  // isOpen が true のまま毎レンダー member で上書きすると、上記の直接上書きが
  // 呼び出し元から渡され続ける古い prop で即座に打ち消されてしまう。
  // (React 公式の「レンダー中に state を調整する」パターン。useEffect にすると
  // 新しいメンバーを開いた最初のフレームで直前のメンバーのデータが一瞬見える)
  const [displayMember, setDisplayMember] = useState<MemberDetail | null>(member);
  const [trackedIsOpen, setTrackedIsOpen] = useState(isOpen);
  const [trackedMemberId, setTrackedMemberId] = useState<string | null>(member?.id ?? null);
  const currentMemberId = member?.id ?? null;
  if (isOpen && (!trackedIsOpen || currentMemberId !== trackedMemberId)) {
    setTrackedIsOpen(true);
    setTrackedMemberId(currentMemberId);
    setDisplayMember(member);
  } else if (!isOpen && trackedIsOpen) {
    setTrackedIsOpen(false);
  }

  const { supabase } = useAuth();
  const { error, isRemoving, handleRoleChange, handleSwimmerStatusChange, handleRemoveMember } =
    useMemberDetail(supabase, currentUserId, teamId, onMembershipChange);
  const { bestTimes, loading, error: bestTimesError, loadBestTimes } = useBestTimes(supabase);

  // 年齢別ポイント比較用の区分。生の birthday はテーブルコンポーネントへ渡さない
  // (必要なのは区分だけ。生年月日は gender より機微度が高い)
  const ageCategory = useMemo(
    () => resolveAgeCategory(displayMember?.users.birthday),
    [displayMember?.users.birthday],
  );

  // 依存配列は displayMember の user_id のみに絞る。displayMember オブジェクトへの
  // 依存だと、role/is_swimmer 変更で displayMember の参照が変わるたびに
  // ベストタイムを再取得してしまい、モーダル内で無関係な再読み込み(ローディング表示の
  // ちらつき)が発生する
  const displayMemberUserId = displayMember?.user_id ?? null;

  useEffect(() => {
    if (isOpen && displayMemberUserId) {
      loadBestTimes(displayMemberUserId);
    }
  }, [isOpen, displayMemberUserId, loadBestTimes]);

  const handleRoleChangeClick = (newRole: "admin" | "user") => {
    if (displayMember?.role === newRole) return;
    setPendingRole(newRole);
    setIsRoleChangeConfirmOpen(true);
  };

  const confirmRoleChange = async () => {
    if (pendingRole && displayMember) {
      try {
        await handleRoleChange(displayMember, pendingRole);
        // モーダルを閉じずにその場反映する。裏側の一覧は onMembershipChange
        // (呼び出し元) がバックグラウンドで更新する
        setDisplayMember((prev) => (prev ? { ...prev, role: pendingRole } : prev));
      } catch {
        // エラーはhookで処理される
      }
    }
    setIsRoleChangeConfirmOpen(false);
    setPendingRole(null);
  };

  const cancelRoleChange = () => {
    setIsRoleChangeConfirmOpen(false);
    setPendingRole(null);
  };

  const handleSwimmerStatusChangeClick = (isSwimmer: boolean) => {
    if (!displayMember) return;
    // セグメントコントロール化により、既にアクティブな側を押した場合も
    // onSwimmerStatusChange が呼ばれうる (権限セグメントの handleRoleChangeClick と同じ
    // 早期 return が必要)
    const isCurrentlySwimmer = displayMember.is_swimmer !== false;
    if (isCurrentlySwimmer === isSwimmer) return;
    // 即座には更新せず確認ダイアログを挟む。セグメントの表示は
    // displayMember.is_swimmer 由来のままなので、ここでは state を一切変更しない
    // (キャンセル時に見た目だけ変わったままになるのを防ぐ)
    setPendingIsSwimmer(isSwimmer);
    setIsSwimmerChangeConfirmOpen(true);
  };

  const confirmSwimmerStatusChange = async () => {
    if (pendingIsSwimmer !== null && displayMember) {
      try {
        await handleSwimmerStatusChange(displayMember, pendingIsSwimmer);
        setDisplayMember((prev) => (prev ? { ...prev, is_swimmer: pendingIsSwimmer } : prev));
      } catch {
        // エラーはhookで処理される
      }
    }
    setIsSwimmerChangeConfirmOpen(false);
    setPendingIsSwimmer(null);
  };

  const cancelSwimmerStatusChange = () => {
    setIsSwimmerChangeConfirmOpen(false);
    setPendingIsSwimmer(null);
  };

  const handleRemove = async () => {
    if (!displayMember) return;
    const success = await handleRemoveMember(displayMember);
    if (success) {
      onClose();
    }
  };

  const displayError = error || bestTimesError;

  if (!displayMember) return null;

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
        <div className="w-full max-w-4xl mx-auto p-6" data-testid="team-member-detail-modal">
          {/* エラー表示 */}
          {displayError && (
            <div className="mb-8 rounded-md bg-red-50 p-4" data-testid="team-member-detail-error">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{t("createModal.errorTitle")}</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{displayError}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* プロフィール情報 */}
          <ProfileSection member={displayMember} currentUserId={currentUserId} />

          {/* 区切り線 */}
          <div className="border-t border-gray-200 mb-8"></div>

          {/* 管理者機能 */}
          {isCurrentUserAdmin && displayMember.user_id !== currentUserId && (
            <AdminControls
              member={displayMember}
              isRemoving={isRemoving}
              onRoleChangeClick={handleRoleChangeClick}
              onRemoveMember={handleRemove}
              onSwimmerStatusChange={handleSwimmerStatusChangeClick}
            />
          )}

          {/* ベストタイム */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <TrophyIcon className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-medium text-gray-900">{t("memberDetail.bestTimesTitle")}</h3>
            </div>

            {loading ? (
              <div className="animate-pulse">
                <div className="bg-gray-200 rounded-lg h-64"></div>
              </div>
            ) : bestTimes.length > 0 ? (
              <BestTimesTable
                bestTimes={bestTimes}
                gender={displayMember.users.gender}
                ageCategory={ageCategory}
              />
            ) : (
              <div className="text-center py-8">
                <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">{t("memberDetail.bestTimesEmpty")}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {t("memberDetail.noRecords")}
                </p>
              </div>
            )}

            {/* 閉じるボタン */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                data-testid="team-member-detail-close-button"
              >
                {t("memberDetail.close")}
              </button>
            </div>
          </div>
        </div>
      </BaseModal>

      {/* 権限変更確認モーダル */}
      <RoleChangeModal
        isOpen={isRoleChangeConfirmOpen}
        member={displayMember}
        pendingRole={pendingRole}
        onConfirm={confirmRoleChange}
        onCancel={cancelRoleChange}
      />

      {/* 泳者設定変更確認モーダル */}
      <SwimmerStatusChangeModal
        isOpen={isSwimmerChangeConfirmOpen}
        member={displayMember}
        pendingIsSwimmer={pendingIsSwimmer}
        onConfirm={confirmSwimmerStatusChange}
        onCancel={cancelSwimmerStatusChange}
      />
    </>
  );
}
