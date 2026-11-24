"use client";

import { useState, useCallback, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamMembersAPI } from "@apps/shared/api/teams/members";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { MemberDetail } from "@/types/member-detail";
import { useOptionalQueryClient } from "@/hooks/queries/useOptionalQueryClient";
import { invalidateTeamMemberQueries } from "@/hooks/queries/teamDetailKeys";

export function useMemberDetail(
  supabase: SupabaseClient,
  currentUserId: string,
  teamId: string,
  onMembershipChange?: () => void,
) {
  const t = useTranslations("teams.memberDetail.hook");
  const tNonSwimmer = useTranslations("teams.nonSwimmer");
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const membersApi = useMemo(() => new TeamMembersAPI(supabase), [supabase]);
  const queryClient = useOptionalQueryClient();

  // 権限・泳者区分・在籍の変更で中身が変わるメンバー系クエリ (一覧・承認待ち・グループ) を落とす。
  // ベストタイム表は重いので落とさない (追放ならメンバー構成が変わりキー自体が変わる)
  const invalidateMembers = useCallback(() => {
    if (queryClient) void invalidateTeamMemberQueries(queryClient, teamId);
  }, [queryClient, teamId]);

  const handleRoleChange = useCallback(
    async (member: MemberDetail, newRole: "admin" | "user") => {
      if (member.role === newRole) {
        return;
      }

      try {
        setError(null);

        await membersApi.updateRole(teamId, member.user_id, newRole);

        invalidateMembers();
        onMembershipChange?.();
      } catch (err) {
        console.error("権限変更エラー:", err);
        setError(toUserFacingMessage(err, t("roleChangeFailed")));
        throw err;
      }
    },
    [membersApi, teamId, onMembershipChange, invalidateMembers, t],
  );

  const handleSwimmerStatusChange = useCallback(
    async (member: MemberDetail, isSwimmer: boolean) => {
      try {
        setError(null);

        await membersApi.updateSwimmerStatus(teamId, member.user_id, isSwimmer);

        invalidateMembers();
        onMembershipChange?.();
      } catch (err) {
        console.error("非泳者設定エラー:", err);
        setError(toUserFacingMessage(err, tNonSwimmer("updateFailed")));
        throw err;
      }
    },
    [membersApi, teamId, onMembershipChange, invalidateMembers, tNonSwimmer],
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

        invalidateMembers();
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
    [membersApi, teamId, currentUserId, onMembershipChange, invalidateMembers, t],
  );

  return {
    error,
    isRemoving,
    handleRoleChange,
    handleSwimmerStatusChange,
    handleRemoveMember,
    setError,
  };
}
