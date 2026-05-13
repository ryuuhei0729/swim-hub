"use client";

import { useState, useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import type { TeamGroup, TeamGroupMembership } from "@swim-hub/shared/types";

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
        const message = err instanceof Error ? err.message : t("createFailed");
        if (
          message.includes("23505") ||
          message.includes("duplicate") ||
          message.includes("unique")
        ) {
          setError(t("duplicateName"));
        } else {
          setError(message);
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
            const message = err instanceof Error ? err.message : t("createFailedGeneric");
            if (
              message.includes("23505") ||
              message.includes("duplicate") ||
              message.includes("unique")
            ) {
              errors.push(t("duplicateNameSpecific", { name }));
            } else {
              errors.push(`「${name}」: ${message}`);
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
        const message = err instanceof Error ? err.message : t("updateFailed");
        if (
          message.includes("23505") ||
          message.includes("duplicate") ||
          message.includes("unique")
        ) {
          setError(t("duplicateName"));
        } else {
          setError(message);
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
        const message = err instanceof Error ? err.message : t("deleteFailed");
        setError(message);
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
        const message = err instanceof Error ? err.message : t("fetchMembersFailed");
        setError(message);
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
        const message = err instanceof Error ? err.message : t("assignFailed");
        setError(message);
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
