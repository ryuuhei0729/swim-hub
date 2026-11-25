"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "@/hooks/queries/teamDetailKeys";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import BaseModal from "@/components/ui/BaseModal";
import Avatar from "@/components/ui/Avatar";
import { UsersIcon } from "@heroicons/react/24/outline";
import type { TeamGroupWithCount } from "../hooks/useTeamGroups";
import type { MemberDetail } from "@/types/member-detail";
import { compareMembersByBirthday } from "@apps/shared/utils/memberSort";

interface GroupMemberListModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TeamGroupWithCount | null;
  teamId: string;
  onMemberClick: (member: MemberDetail) => void;
  /**
   * メンバー詳細モーダル (このモーダルの上に重ねて開く) での権限・泳者区分の変更を
   * この一覧にも反映するためのトリガー。値が変わるたびにバックグラウンドで
   * 再取得する (silent: ローディングスケルトンは出さない)。
   * 初期値の `undefined` では再取得しない
   */
  membersRefreshSignal?: number;
}

const EMPTY_MEMBERS: MemberDetail[] = [];

export const GroupMemberListModal: React.FC<GroupMemberListModalProps> = ({
  isOpen,
  onClose,
  group,
  teamId,
  onMemberClick,
  membersRefreshSignal,
}) => {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  // 閉じるときに親が group を null に戻しても、閉じアニメーション中にクエリキーが
  // 変わって一覧が空にならないよう、最後に開いていたグループを保持して使う
  // (React 公式の「レンダー中に state を調整する」パターン)
  const [lastGroup, setLastGroup] = useState<TeamGroupWithCount | null>(group);
  if (group && group !== lastGroup) {
    setLastGroup(group);
  }
  const displayGroup = group ?? lastGroup;
  const groupId = displayGroup?.id ?? null;

  // 開くたびに再取得するが (staleTime 0)、前回開いたときの一覧があれば先に表示する
  const membersQuery = useQuery({
    queryKey: teamDetailKeys.groupMembers(teamId, groupId ?? ""),
    queryFn: async (): Promise<MemberDetail[]> => {
      // グループに所属するuser_idを取得
      const { data: groupMemberships, error: gmError } = await supabase
        .from("team_group_memberships")
        .select("user_id")
        .eq("team_group_id", groupId!); // enabled で groupId !== null を保証済み
      if (gmError) throw gmError;

      const userIds = (groupMemberships ?? []).map((m) => m.user_id);
      if (userIds.length === 0) return [];

      // team_membershipsからMemberDetail情報を取得
      const { data, error: tmError } = await supabase
        .from("team_memberships")
        .select(
          `
          id,
          user_id,
          role,
          is_active,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path,
            gender
          )
        `,
        )
        .eq("team_id", teamId)
        .eq("status", "approved")
        .eq("is_active", true)
        .in("user_id", userIds);

      if (tmError) throw tmError;
      // 年上順（生年月日昇順、未設定は末尾）。memberSort.ts が唯一の比較ロジック定義元
      return ((data ?? []) as unknown as MemberDetail[]).sort(compareMembersByBirthday);
    },
    enabled: isOpen && groupId !== null,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  // 以前と同じく、取得に失敗したら (表示できる一覧が無ければ) 空の一覧になる
  const loading = !membersQuery.data && membersQuery.isFetching;
  const fetchError = membersQuery.error;
  useEffect(() => {
    if (fetchError) console.error("グループメンバー取得エラー:", fetchError);
  }, [fetchError]);

  // メンバー詳細モーダル (このモーダルの上に開く) での変更をバックグラウンドで反映する
  const { refetch } = membersQuery;
  useEffect(() => {
    if (membersRefreshSignal === undefined) return;
    if (!isOpen || groupId === null) return;
    void refetch();
  }, [membersRefreshSignal, isOpen, groupId, refetch]);

  if (!displayGroup) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`${displayGroup.name}`} size="md">
      <div className="space-y-1">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <UsersIcon className="h-4 w-4" />
          <span>{t("groupMemberList.memberCount", { count: members.length })}</span>
        </div>

        {/* ローディング */}
        {loading ? (
          <div className="py-8">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 bg-gray-200 rounded-full" />
                  <div className="h-4 bg-gray-200 rounded w-32" />
                </div>
              ))}
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <UsersIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t("groupMemberList.empty")}</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onMemberClick(member)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                aria-label={t("groupMemberList.viewDetailAriaLabel", { name: member.users?.name || t("groupMemberList.noNameLabel") })}
              >
                <Avatar
                  avatarUrl={member.users?.profile_image_path ?? null}
                  userName={member.users?.name || "?"}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">
                    {member.users?.name || t("groupMemberList.noNameLabel")}
                  </span>
                </div>
                {member.role === "admin" && (
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                    {t("badge.admin")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
};
