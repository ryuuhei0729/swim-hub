"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  ChevronDownIcon,
  PlusIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import type { TeamMembershipWithUser } from "@apps/shared/types";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import {
  isApprovedMembership,
  shouldOpenAsAdmin,
  teamViewHref,
} from "@/utils/teamView";

const TeamCreateModal = dynamic(
  () => import("@/components/team/TeamCreateModal"),
);
const TeamJoinModal = dynamic(() => import("@/components/team/TeamJoinModal"));

export interface TeamViewHeaderProps {
  teamId: string;
  teamName: string;
  /** 実際の権限 (role === "admin")。管理者でなければスイッチは出さない */
  isCurrentUserAdmin: boolean;
  /** いま表示しているのが管理者ビューか */
  isAdminView: boolean;
  /**
   * 表示切替スイッチを押したとき。ページ遷移はせず、呼び出し側 (TeamPageClient) が
   * ヘッダーより下の本文だけを入れ替える (ヘッダーは作り直さない)
   */
  onToggleView: () => void;
  /** 招待コード (利用者・管理者どちらのビューでも右側に出す) */
  inviteCode?: string | null;
}

/**
 * チーム画面のヘッダー (利用者ビュー・管理者ビュー共通)。
 * - チーム名を押すと所属チームの一覧が開き、別チームへの切替・作成・参加ができる
 * - 管理者にだけ「利用者 / 管理者」の表示切替スイッチを出す
 * - 右側に招待コード (コピー可)
 *
 * モバイルのチームタブ (TeamDetailView のヘッダー + TeamSwitcherSheet) と同じ操作感にしている。
 */
export default function TeamViewHeader({
  teamId,
  teamName,
  isCurrentUserAdmin,
  isAdminView,
  onToggleView,
  inviteCode,
}: TeamViewHeaderProps) {
  const t = useTranslations("teams");
  const tAdmin = useTranslations("teamsAdmin");
  const [isCopied, setIsCopied] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { teams = [] } = useTeamsQuery(supabase, { enableRealtime: false });

  const { approvedTeams, pendingTeams } = useMemo(() => {
    const approved: TeamMembershipWithUser[] = [];
    const pending: TeamMembershipWithUser[] = [];
    for (const membership of teams) {
      if (isApprovedMembership(membership)) approved.push(membership);
      else if (membership.status === "pending") pending.push(membership);
    }
    return { approvedTeams: approved, pendingTeams: pending };
  }, [teams]);

  // メニューの外側クリック・Escape で閉じる
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      setIsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const openTeam = useCallback(
    (membership: TeamMembershipWithUser) => {
      setIsMenuOpen(false);
      if (membership.team_id === teamId) return;
      const prefs = useTeamViewStore.getState().byTeam[membership.team_id];
      router.push(
        teamViewHref(membership.team_id, shouldOpenAsAdmin(membership, prefs)),
      );
    },
    [router, teamId],
  );

  const handleCopyInviteCode = useCallback(() => {
    if (!inviteCode) return;
    void navigator.clipboard.writeText(inviteCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [inviteCode]);

  const viewLabel = isAdminView
    ? t("mobile.adminToggle.admin")
    : t("mobile.adminToggle.user");

  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左: チーム名 (= 切替メニューを開くボタン) とそのすぐ右の 利用者/管理者 スイッチ */}
        <div className="flex min-w-0 flex-auto items-center gap-3 sm:gap-4">
          <div className="relative flex min-w-0">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label={t("mobile.switcher.openAria")}
              className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 -mx-1 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="team-switcher-open"
            >
              <span className="truncate text-xl sm:text-2xl font-bold text-gray-900">
                {teamName}
              </span>
              <ChevronDownIcon
                className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200 ${isMenuOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isMenuOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label={t("mobile.switcher.title")}
                className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
              >
                <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-500">
                  {t("mobile.switcher.title")}
                </p>
                <div className="max-h-72 overflow-y-auto py-1">
                  {approvedTeams.map((membership) => {
                    const selected = membership.team_id === teamId;
                    return (
                      <button
                        key={membership.team_id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => openTeam(membership)}
                        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-blue-50 font-semibold text-blue-700"
                            : "text-gray-900 hover:bg-gray-50"
                        }`}
                        data-testid={`team-switcher-option-${membership.team_id}`}
                      >
                        <span className="flex-1 truncate">
                          {membership.teams?.name ||
                            t("mobile.fallbackTeamName")}
                        </span>
                        {membership.role === "admin" && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                            {t("badge.admin")}
                          </span>
                        )}
                        {selected && (
                          <CheckIcon
                            className="h-4 w-4 shrink-0 text-blue-600"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}

                  {pendingTeams.length > 0 && (
                    <>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500">
                        {t("mobile.switcher.pendingGroup")}
                      </p>
                      {pendingTeams.map((membership) => (
                        <div
                          key={membership.team_id}
                          role="menuitem"
                          aria-disabled="true"
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400"
                        >
                          <span className="flex-1 truncate">
                            {membership.teams?.name ||
                              t("mobile.fallbackTeamName")}
                          </span>
                          <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                            {t("mobile.statusPending")}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="flex gap-2 border-t border-gray-100 p-3">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsCreateModalOpen(true);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-2 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    data-testid="team-switcher-create"
                  >
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    {t("empty.createButton")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsJoinModalOpen(true);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    data-testid="team-switcher-join"
                  >
                    <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
                    {t("empty.joinButton")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 利用者 / 管理者 の表示切替 (管理者のみ) */}
          {isCurrentUserAdmin && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-700">
                {viewLabel}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isAdminView}
                aria-label={t("mobile.adminToggle.label")}
                onClick={onToggleView}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isAdminView ? "bg-blue-600" : "bg-gray-300"
                }`}
                data-testid="team-admin-view-toggle"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    isAdminView ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* 右: 招待コード */}
        {inviteCode && (
          <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5">
            <div className="flex flex-row items-center gap-2">
              <span className="block text-xs font-medium text-gray-700 whitespace-nowrap">
                {tAdmin("client.inviteCodeLabel")}
              </span>
              <input
                type="text"
                value={inviteCode}
                readOnly
                aria-label={tAdmin("client.inviteCodeLabel")}
                className="w-28 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-xs font-mono font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                data-testid="team-invite-code"
              />
              <button
                type="button"
                onClick={handleCopyInviteCode}
                className="inline-flex items-center justify-center px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                title={tAdmin("common.copyTitle")}
                aria-label={tAdmin("common.copyTitle")}
              >
                {isCopied ? (
                  <CheckIcon className="h-3 w-3 text-green-600" />
                ) : (
                  <ClipboardDocumentIcon className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <TeamCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(newTeamId) => {
          void queryClient.invalidateQueries({ queryKey: teamKeys.list() });
          router.push(teamViewHref(newTeamId, false));
        }}
      />
      <TeamJoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={() => {
          // 参加申請は承認待ちになるので、メニューの「承認待ち」に出るよう一覧だけ取り直す
          void queryClient.invalidateQueries({ queryKey: teamKeys.list() });
          setIsJoinModalOpen(false);
        }}
      />
    </div>
  );
}
