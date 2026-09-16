"use client";

import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useRouter } from "@/i18n/navigation";
import { useDeleteTeamMutation, useLeaveTeamMutation } from "@apps/shared/hooks/queries/teams";
import { getDeleteTeamErrorMessageKey } from "@apps/shared/api/teams/core";
import { getLeaveBlockReason, type LeaveGuardMember } from "@apps/shared/utils/teamLeaveGuard";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TeamSettings from "@/components/team/TeamSettings";
import TeamCalendarColorSection from "./TeamCalendarColorSection";

export interface TeamSettingsTabProps {
  teamId: string;
  teamName: string;
  teamDescription?: string | null;
  inviteCode?: string | null;
  isAdmin: boolean;
  /**
   * チーム詳細画面が既に持っているメンバー一覧をそのまま渡す。
   * 最後の管理者判定にしか使わないので、`user_id` と `role` だけを要求する
   * 構造的な型にしてある (呼び出し側で詰め替えさせない)。
   */
  members: readonly LeaveGuardMember[];
}

/**
 * チーム詳細の「設定」タブ (全メンバー向け)。
 *
 * 縦積み5セクション: チーム情報 / 招待コード / このチームの記録色 /
 * チーム操作 / 危険な操作。管理者だけに出すのは「チーム情報を編集」と
 * 「チームを削除」の2つだけで、残りは全メンバーが使う。
 *
 * チーム名・説明の編集 UI は既存の `TeamSettings` をそのまま使う (再実装しない)。
 */
export default function TeamSettingsTab({
  teamId,
  teamName,
  teamDescription,
  inviteCode,
  isAdmin,
  members,
}: TeamSettingsTabProps) {
  const t = useTranslations("teams.settingsTab");
  // チーム名/説明のラベルは既存 TeamSettings と同じキーを使う (表記を2系統に分けない)
  const tTeamFields = useTranslations("teamsAdmin.settings");
  const tCommon = useTranslations("common");
  // 名前空間なし = ドット区切りのフルパスで引ける。削除エラーのキーは shared の
  // getDeleteTeamErrorMessageKey がフルパスで返すのでこちらで受ける
  const tRoot = useTranslations();
  const router = useRouter();
  const { supabase, user } = useAuth();

  const leaveTeamMutation = useLeaveTeamMutation(supabase);
  const deleteTeamMutation = useDeleteTeamMutation(supabase);

  const inviteCodeRef = useRef<HTMLInputElement>(null);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      // 権限拒否・非セキュアコンテキストでは clipboard API が使えない。
      // 黙って無反応にせず、手動コピーできるよう入力欄を選択状態にする。
      console.error("招待コードのコピーに失敗しました:", err);
      inviteCodeRef.current?.select();
    }
  };

  /**
   * 編集フォームを閉じて表示モードへ戻す。
   * teamName / teamDescription は Server Component 由来なので、保存後に
   * refresh しないと表示モードへ戻った瞬間に古い名前が出る。キャンセル時も
   * 同じ経路を通るが、その場合は単に再取得するだけで副作用は無い。
   */
  const handleEditingEnd = () => {
    setIsEditingInfo(false);
    router.refresh();
  };

  /**
   * 🚨 最後の管理者の判定は **確認ダイアログを出す前** に行う。
   * ダイアログの「はい」の後ろに置くと、ユーザーが承諾した時点で脱退が成立してしまう。
   * DB 側にこのガードは無いので、ここで止めるのが唯一の防波堤。
   */
  const handleLeaveClick = () => {
    setLeaveError(null);
    if (getLeaveBlockReason(members, user?.id ?? "") !== null) {
      setLeaveError(t("lastAdminCannotLeave"));
      return;
    }
    setIsLeaveConfirmOpen(true);
  };

  const handleLeaveConfirm = async () => {
    setIsLeaveConfirmOpen(false);
    setLeaveError(null);
    try {
      await leaveTeamMutation.mutateAsync(teamId);
      router.push("/teams");
    } catch (err) {
      console.error("チーム脱退エラー:", err);
      setLeaveError(toUserFacingMessage(err, t("leaveFailed")));
    }
  };

  const handleDeleteConfirm = async () => {
    setIsDeleteConfirmOpen(false);
    setDeleteError(null);
    try {
      await deleteTeamMutation.mutateAsync(teamId);
      router.push("/teams");
    } catch (err) {
      console.error("チーム削除エラー:", err);
      // deleteTeam は **TeamOperationError** (message は表示文言ではなくコード) を投げる。
      // そのまま表示すると ja/de/ko/zh のユーザーに英語の識別子が出るので、必ず
      // 共有の対応表でキーへ変換してから t() に通す。
      setDeleteError(tRoot(getDeleteTeamErrorMessageKey(err)));
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="team-settings-tab">
      {/* ------------------------------------------------ チーム情報 */}
      <section className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{t("teamInfoTitle")}</h3>

        {isEditingInfo && isAdmin ? (
          // 編集フォームは既存 TeamSettings をそのまま使う (名前編集 UI を二重に持たない)。
          // embedded で見出しとカード装飾を外し、initialEditing で1クリック目から
          // 入力できる状態にする (mobile の編集モーダルと同じ手数にそろえる)。
          <TeamSettings
            teamId={teamId}
            teamName={teamName}
            teamDescription={teamDescription ?? undefined}
            isAdmin
            embedded
            initialEditing
            onEditingEnd={handleEditingEnd}
          />
        ) : (
          <>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{tTeamFields("nameLabel")}</dt>
                <dd className="text-gray-900 font-medium wrap-break-word">{teamName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{tTeamFields("descriptionLabel")}</dt>
                <dd className="text-gray-700 wrap-break-word">
                  {teamDescription || tTeamFields("noDescription")}
                </dd>
              </div>
            </dl>

            {/* 招待コードはチーム情報の一項目として同じカード内に置く
                (独立セクションにすると設定タブが縦に伸びるため)。
                コード自体は text-xs で控えめに。readOnly とコピーボタンは維持する。 */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-500 text-sm">{t("inviteCodeTitle")}</p>
              {inviteCode ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={inviteCodeRef}
                    type="text"
                    value={inviteCode}
                    readOnly
                    aria-label={tCommon("inviteCode")}
                    className="flex-1 min-w-0 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-xs font-mono font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyInviteCode()}
                    aria-label={t("copyInviteCode")}
                    data-testid="team-settings-copy-invite-code"
                    className="inline-flex items-center justify-center shrink-0 px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {isCopied ? (
                      <CheckIcon className="h-4 w-4 text-green-600" aria-hidden="true" />
                    ) : (
                      <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  {/* 「コピーしました」はアイコンの **右隣** に出す (下に出すと行が増えて
                      カードの高さが変わり、押すたびにレイアウトが跳ねる)。
                      shrink-0 で入力欄側を縮ませ、文言は折り返さない。 */}
                  {isCopied && (
                    <p
                      role="status"
                      className="shrink-0 whitespace-nowrap text-xs text-green-700"
                    >
                      {t("copied")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{tCommon("none")}</p>
              )}
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsEditingInfo(true)}
                data-testid="team-settings-edit-info"
                className="mt-3 inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PencilIcon className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("editTeamInfo")}
              </button>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------ このチームの記録色 */}
      <section className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-1">{t("calendarColorTitle")}</h3>
        <p className="text-xs text-gray-600 mb-3">{t("calendarColorDescription")}</p>
        <TeamCalendarColorSection teamId={teamId} />
      </section>

      {/* ------------------------------------------------ 破壊的操作
          2026-09-16: **前回の「左右2ボタン」構成を撤回**し、1機能 = 1カードの縦積みに変更。
          手本は components/settings/AccountDeleteSettings.tsx (アカウント削除カード)。
          見出し + 説明 + ボタンを揃え、独自のスタイルを作らない。
          ⚠️ 外側の枠だけは手本の `bg-white rounded-lg shadow` ではなく設定タブ既存の
          `border border-gray-200` を使う。タブ本文が既に `bg-white rounded-lg shadow` の
          中にあり、そのまま写すと影が二重になるため。内側 (アイコン+見出し行 / 説明 /
          エラー / ボタン) は手本と同一。

          「チームを削除」カードは管理者のみ。脱退は全メンバーに出す。
          見出し (teams.settingsTab.dangerZoneTitle) は引き続き表示しない (キーは残置)。 */}

      {/* 脱退 */}
      <section className="border border-gray-200 rounded-lg p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-gray-900">{t("leaveTeam")}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">{t("leaveDescription")}</p>
        {leaveError && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
          >
            {leaveError}
          </div>
        )}
        <button
          type="button"
          onClick={handleLeaveClick}
          disabled={leaveTeamMutation.isPending}
          data-testid="team-settings-leave"
          className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          {leaveTeamMutation.isPending ? t("leaving") : t("leaveButton")}
        </button>
      </section>

      {/* 削除 (管理者のみ) */}
      {isAdmin && (
        <section className="border border-gray-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-gray-900">{t("deleteTeam")}</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">{t("deleteDescription")}</p>
          {deleteError && (
            <div
              role="alert"
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
            >
              {deleteError}
            </div>
          )}
          {/* 脱退は枠線ボタン (手本と同一) だが、削除だけは塗りにする。
              脱退は招待コードで復帰できるのに対し、削除は復元不能で破壊力が一段違うため。
              塗りの赤は ConfirmDialog の danger ボタンと同じ bg-red-600/hover:bg-red-700。 */}
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setIsDeleteConfirmOpen(true);
            }}
            disabled={deleteTeamMutation.isPending}
            data-testid="team-settings-delete"
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            {deleteTeamMutation.isPending ? t("deleting") : t("deleteButton")}
          </button>
        </section>
      )}

      <ConfirmDialog
        isOpen={isLeaveConfirmOpen}
        variant="danger"
        title={t("leaveConfirmTitle")}
        message={t("leaveConfirmMessage", { name: teamName })}
        confirmLabel={t("leaveTeam")}
        onConfirm={() => void handleLeaveConfirm()}
        onCancel={() => setIsLeaveConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        variant="danger"
        title={t("deleteConfirmTitle")}
        message={t("deleteConfirmMessage", { name: teamName })}
        confirmLabel={t("deleteTeam")}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </div>
  );
}
