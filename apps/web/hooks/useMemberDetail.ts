"use client";

import { useState, useCallback, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamMembersAPI } from "@apps/shared/api/teams/members";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { MemberDetail } from "@/types/member-detail";

export function useMemberDetail(
  supabase: SupabaseClient,
  currentUserId: string,
  teamId: string,
  onMembershipChange?: () => void,
) {
  const t = useTranslations("teams.memberDetail.hook");
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const membersApi = useMemo(() => new TeamMembersAPI(supabase), [supabase]);

  const handleRoleChange = useCallback(
    async (member: MemberDetail, newRole: "admin" | "user") => {
      if (member.role === newRole) {
        return;
      }

      try {
        setError(null);

        await membersApi.updateRole(teamId, member.user_id, newRole);

        onMembershipChange?.();
      } catch (err) {
        console.error("権限変更エラー:", err);
        setError(toUserFacingMessage(err, t("roleChangeFailed")));
        throw err;
      }
    },
    [membersApi, teamId, onMembershipChange, t],
  );

  const handleRemoveMember = useCallback(
    async (member: MemberDetail) => {
      try {
        setError(null);
        setIsRemoving(true);

        // 自分自身を削除しようとしている場合は拒否
        if (member.user_id === currentUserId) {
          setError(t("cannotRemoveSelf"));
          return;
        }

        // 確認ダイアログ
        if (!confirm(t("removeConfirm", { name: member.users?.name ?? "" }))) {
          return;
        }

        // shared API 経由で is_active=false + left_at を記録する（updateRole と同経路）
        await membersApi.remove(teamId, member.user_id);

        onMembershipChange?.();
        return true;
      } catch (err) {
        console.error("メンバー削除エラー:", err);
        setError(toUserFacingMessage(err, t("removeFailed")));
        return false;
      } finally {
        setIsRemoving(false);
      }
    },
    [membersApi, teamId, currentUserId, onMembershipChange, t],
  );

  return {
    error,
    isRemoving,
    handleRoleChange,
    handleRemoveMember,
    setError,
  };
}
