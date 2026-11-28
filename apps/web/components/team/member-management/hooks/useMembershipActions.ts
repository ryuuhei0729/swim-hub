"use client";

import { useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { approveMembership, rejectMembership } from "@/app/[locale]/(authenticated)/teams/_actions/actions";
import { useTranslations } from "next-intl";

/**
 * メンバーシップの承認・却下アクションを提供するカスタムフック
 *
 * 確認ダイアログは呼び出し側 (PendingMembersSection) で出す (承認・拒否とも。mobile と同じ)。
 * 失敗したときは false を返し、`error` に画面へ出す文言を入れる。
 */
export const useMembershipActions = (teamId: string, onMembershipChange?: () => void) => {
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("teams");
  const router = useRouter();

  const handleApprove = useCallback(
    async (membershipId: string) => {
      try {
        setError(null);
        const result = await approveMembership(membershipId, teamId);
        if (result.success) {
          if (onMembershipChange) {
            onMembershipChange();
          }
          router.refresh();
          return true;
        } else {
          setError(result.error || t("membershipActions.approveError"));
          return false;
        }
      } catch (err) {
        console.error("承認エラー:", err);
        setError(t("membershipActions.approveError"));
        return false;
      }
    },
    [teamId, onMembershipChange, router, t],
  );

  const handleReject = useCallback(
    async (membershipId: string) => {
      try {
        setError(null);
        const result = await rejectMembership(membershipId, teamId);
        if (result.success) {
          if (onMembershipChange) {
            onMembershipChange();
          }
          router.refresh();
          return true;
        } else {
          setError(result.error || t("membershipActions.rejectError"));
          return false;
        }
      } catch (err) {
        console.error("拒否エラー:", err);
        setError(t("membershipActions.rejectError"));
        return false;
      }
    },
    [teamId, onMembershipChange, router, t],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    handleApprove,
    handleReject,
    error,
    clearError,
  };
};
