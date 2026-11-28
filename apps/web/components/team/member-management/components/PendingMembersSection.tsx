"use client";

import React, { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { formatDate } from "@apps/shared/utils/date";
import type { TeamMember } from "../hooks/useMembers";
import { useTranslations } from "next-intl";

interface PendingMembersSectionProps {
  pendingMembers: TeamMember[];
  isLoading: boolean;
  onApprove: (membershipId: string) => Promise<boolean>;
  onReject: (membershipId: string) => Promise<boolean>;
  /** 承認・拒否に失敗したときの文言 (無ければ出さない) */
  actionError?: string | null;
  /** 承認・拒否をやり直すとき (確認ダイアログを開いたとき) に前回のエラーを消す */
  onClearActionError?: () => void;
}

type PendingAction = { type: "approve" | "reject"; member: TeamMember };

/**
 * 承認待ちメンバーのリスト表示コンポーネント (管理者ビューのメンバータブ)
 *
 * mobile の PendingMembersSection と同じく、承認・拒否のどちらも確認してから実行し、
 * 失敗したら理由を画面に出す。0 件のときは「承認待ちのメンバーはいません」を出す。
 */
export const PendingMembersSection: React.FC<PendingMembersSectionProps> = ({
  pendingMembers,
  isLoading,
  onApprove,
  onReject,
  actionError = null,
  onClearActionError,
}) => {
  const t = useTranslations("teams");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const memberName = (member: TeamMember) =>
    member.users?.name || t("mobile.unnamedMember");

  const requestAction = (type: PendingAction["type"], member: TeamMember) => {
    onClearActionError?.();
    setPendingAction({ type, member });
  };

  const handleConfirm = async () => {
    if (!pendingAction || processingId) return;
    const { type, member } = pendingAction;
    setPendingAction(null);
    setProcessingId(member.id);
    try {
      await (type === "approve" ? onApprove(member.id) : onReject(member.id));
    } finally {
      setProcessingId(null);
    }
  };

  const renderBody = () => {
    if (isLoading && pendingMembers.length === 0) {
      return (
        <div className="animate-pulse space-y-3">
          {[...Array(2)].map((_, index) => (
            <div
              key={index}
              className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg"
            >
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (pendingMembers.length === 0) {
      return (
        <div
          className="flex items-center gap-2 text-sm text-gray-600"
          data-testid="pending-members-empty"
        >
          <CheckCircleIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
          <span>{t("pendingMembers.empty")}</span>
        </div>
      );
    }

    return (
      <>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t("pendingMembers.sectionTitle", { count: pendingMembers.length })}
        </h3>
        <div className="space-y-3">
          {pendingMembers.map((pendingMember) => {
            const name = memberName(pendingMember);
            return (
              <div
                key={pendingMember.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Avatar
                    avatarUrl={pendingMember.users?.profile_image_path || null}
                    userName={name}
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{name}</p>
                    <p className="text-xs text-gray-500">
                      {t("pending.appliedAtLabel")}{" "}
                      {formatDate(pendingMember.created_at || pendingMember.joined_at, "numeric")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => requestAction("approve", pendingMember)}
                    disabled={processingId !== null}
                    data-testid={`pending-member-approve-${pendingMember.id}`}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-1" aria-hidden="true" />
                    {t("pendingMembers.approveButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => requestAction("reject", pendingMember)}
                    disabled={processingId !== null}
                    data-testid={`pending-member-reject-${pendingMember.id}`}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircleIcon className="h-4 w-4 mr-1" aria-hidden="true" />
                    {t("pendingMembers.rejectButton")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="mb-6 border-b border-gray-200 pb-6" data-testid="pending-members-section">
      {actionError && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
          data-testid="pending-members-error"
        >
          {actionError}
        </div>
      )}
      {renderBody()}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        variant={pendingAction?.type === "reject" ? "danger" : "info"}
        title={
          pendingAction?.type === "reject"
            ? t("mobile.pendingRejectConfirmTitle")
            : t("mobile.pendingApproveConfirmTitle")
        }
        message={
          pendingAction
            ? t(
                pendingAction.type === "reject"
                  ? "mobile.pendingRejectConfirmMessage"
                  : "mobile.pendingApproveConfirmMessage",
                { name: memberName(pendingAction.member) },
              )
            : ""
        }
        confirmLabel={
          pendingAction?.type === "reject"
            ? t("pendingMembers.rejectButton")
            : t("pendingMembers.approveButton")
        }
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};
