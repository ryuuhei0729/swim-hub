"use client";

import { useState, useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import type { TeamGroup, TeamGroupMembership } from "@swim-hub/shared/types";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";

/**
 * グループCRUD操作ラッパー
 */
export const useGroupActions = (
  teamId: string,
  supabase: SupabaseClient,
  onSuccess?: () => void,
) => {
  const t = useTranslations("teamsAdmin.groupManagement.errors");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => new TeamGroupsAPI(supabase), [supabase]);

  const createGroup = useCallback(
    async (category: string | null, name: string): Promise<TeamGroup | null> => {
      try {
        setSaving(true);
        setError(null);
        const result = await api.create({
          team_id: teamId,
          category,
          name,
          created_by: null, // APIが上書きする
        });
        onSuccess?.();
        return result;
      } catch (err: unknown) {
        // 重複制約違反 (23505) の判定にのみ生メッセージを使い、画面には出さない
        const rawMessage = err instanceof Error ? err.message : "";
        if (
          rawMessage.includes("23505") ||
          rawMessage.includes("duplicate") ||
          rawMessage.includes("unique")
        ) {
          setError(t("duplicateName"));
        } else {
          setError(toUserFacingMessage(err, t("createFailed")));
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [teamId, api, onSuccess, t],
  );

  /** カンマ区切りで複数グループを一括作成 */
  const createGroups = useCallback(
    async (category: string | null, names: string[]): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);
        const errors: string[] = [];
        for (const name of names) {
          try {
            await api.create({
              team_id: teamId,
              category,
              name,
              created_by: null,
            });
          } catch (err: unknown) {
            // 重複制約違反 (23505) の判定にのみ生メッセージを使い、画面には出さない
            const rawMessage = err instanceof Error ? err.message : "";
            if (
              rawMessage.includes("23505") ||
              rawMessage.includes("duplicate") ||
              rawMessage.includes("unique")
            ) {
              errors.push(t("duplicateNameSpecific", { name }));
            } else {
              errors.push(`「${name}」: ${toUserFacingMessage(err, t("createFailedGeneric"))}`);
            }
          }
        }
        onSuccess?.();
        if (errors.length > 0) {
          setError(errors.join("\n"));
          return false;
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [teamId, api, onSuccess, t],
  );

  const updateGroup = useCallback(
    async (id: string, category: string | null, name: string): Promise<TeamGroup | null> => {
      try {
        setSaving(true);
        setError(null);
        const result = await api.update(id, { category, name });
        onSuccess?.();
        return result;
      } catch (err: unknown) {
        // 重複制約違反 (23505) の判定にのみ生メッセージを使い、画面には出さない
        const rawMessage = err instanceof Error ? err.message : "";
        if (
          rawMessage.includes("23505") ||
          rawMessage.includes("duplicate") ||
          rawMessage.includes("unique")
        ) {
          setError(t("duplicateName"));
        } else {
          setError(toUserFacingMessage(err, t("updateFailed")));
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [api, onSuccess, t],
  );

  const deleteGroup = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);
        await api.remove(id);
        onSuccess?.();
        return true;
      } catch (err: unknown) {
        setError(toUserFacingMessage(err, t("deleteFailed")));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, onSuccess, t],
  );

  const listGroupMembers = useCallback(
    async (
      groupId: string,
    ): Promise<
      (TeamGroupMembership & {
        users: { id: string; name: string; profile_image_path: string | null };
      })[]
    > => {
      try {
        setError(null);
        return await api.listGroupMembers(groupId);
      } catch (err: unknown) {
        setError(toUserFacingMessage(err, t("fetchMembersFailed")));
        return [];
      }
    },
    [api, t],
  );

  const setGroupMembers = useCallback(
    async (groupId: string, userIds: string[]): Promise<boolean> => {
      try {
        setSaving(true);
        setError(null);
        await api.setGroupMembers(groupId, userIds);
        onSuccess?.();
        return true;
      } catch (err: unknown) {
        setError(toUserFacingMessage(err, t("assignFailed")));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, onSuccess, t],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    saving,
    error,
    createGroup,
    createGroups,
    updateGroup,
    deleteGroup,
    listGroupMembers,
    setGroupMembers,
    clearError,
  };
};
