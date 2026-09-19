"use client";

import { useState, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { compareMembersByBirthday } from "@apps/shared/utils/memberSort";

export interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "user";
  status?: "pending" | "approved" | "rejected";
  is_active: boolean;
  joined_at: string;
  created_at?: string;
  is_swimmer?: boolean;
  users: {
    id: string;
    name: string;
    gender?: number;
    birthday?: string;
    bio?: string;
    profile_image_path?: string | null;
  };
}

/**
 * 承認済みメンバーを管理するカスタムフック
 */
export const useMembers = (teamId: string, supabase: SupabaseClient) => {
  const t = useTranslations("teams");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // silent: true のときは loading トグルをスキップする。メンバー詳細モーダルでの
  // 変更後にバックグラウンドで一覧を最新化する用途で、既に表示中の一覧を
  // スケルトンに戻して「勝手にリロードがかかった」ように見せないための分岐
  const loadMembers = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("team_memberships")
          .select(
            `
          id,
          user_id,
          role,
          is_active,
          status,
          joined_at,
          is_swimmer,
          users!team_memberships_user_id_fkey (
            id,
            name,
            gender,
            birthday,
            bio,
            profile_image_path
          )
        `,
          )
          .eq("team_id", teamId)
          .eq("status", "approved")
          .eq("is_active", true);

        if (fetchError) throw fetchError;
        // 年上順（生年月日昇順、未設定は末尾）。memberSort.ts が唯一の比較ロジック定義元
        setMembers(((data ?? []) as unknown as TeamMember[]).sort(compareMembersByBirthday));
      } catch (err) {
        console.error("メンバー情報の取得に失敗:", err);
        setError(t("membersHook.loadError"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [teamId, supabase, t],
  );

  const refresh = useCallback(() => {
    loadMembers();
  }, [loadMembers]);

  return {
    members,
    loading,
    error,
    loadMembers,
    refresh,
  };
};
