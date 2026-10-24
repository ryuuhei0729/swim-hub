// =============================================================================
// カレンダー記録色設定 React Query フック - Swim Hub共通パッケージ
// =============================================================================
// users テーブルの個人色2カラム + user_team_calendar_colors の全行を取得し、
// calendarColorResolver.resolveCalendarItemColor が直接消費できる
// CalendarColorSettings 形式へ整形する。
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  CalendarColorInputSchema,
  type CalendarColorInput,
  type CalendarColorSettings,
  type TeamCalendarColors,
  type UserCalendarColors,
} from "../../types/calendarColors";
import { calendarColorKeys } from "./keys";

const EMPTY_SETTINGS: CalendarColorSettings = {
  personal: { practice_color: null, competition_color: null },
  byTeam: {},
};

// C3対応: 生 string ではなく Zod スキーマ由来の型を使う。
// パレット外の値は CalendarColorInputSchema.parse() が throw して弾く(mutationFn内で実施)。
type PersonalColorsInput = CalendarColorInput;

interface TeamColorsInput extends CalendarColorInput {
  teamId: string;
}

/**
 * ログインユーザーのカレンダー記録色設定(個人 + 所属チーム全体)を取得する。
 */
export function useCalendarColorSettingsQuery(
  supabase: SupabaseClient,
  userId?: string,
): {
  settings: CalendarColorSettings;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  updatePersonalColors: UseMutationResult<void, Error, PersonalColorsInput>;
  upsertTeamColors: UseMutationResult<void, Error, TeamColorsInput>;
  deleteTeamColors: UseMutationResult<void, Error, string>;
} {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userId ? calendarColorKeys.settings(userId) : calendarColorKeys.all,
    queryFn: async (): Promise<CalendarColorSettings> => {
      if (!userId) return EMPTY_SETTINGS;

      const [personalResult, teamResult] = await Promise.all([
        supabase
          .from("users")
          .select("personal_practice_color, personal_competition_color")
          .eq("id", userId)
          .single(),
        supabase
          .from("user_team_calendar_colors")
          .select("team_id, practice_color, competition_color")
          .eq("user_id", userId),
      ]);

      if (personalResult.error) throw personalResult.error;
      if (teamResult.error) throw teamResult.error;

      const personal = personalResult.data as UserCalendarColors | null;
      const teamRows = (teamResult.data ?? []) as TeamCalendarColors[];

      const byTeam: CalendarColorSettings["byTeam"] = {};
      for (const row of teamRows) {
        byTeam[row.team_id] = {
          practice_color: row.practice_color,
          competition_color: row.competition_color,
        };
      }

      return {
        personal: {
          practice_color: personal?.personal_practice_color ?? null,
          competition_color: personal?.personal_competition_color ?? null,
        },
        byTeam,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5分
  });

  const invalidate = () => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: calendarColorKeys.settings(userId) });
    }
  };

  // 個人の練習色/大会色を更新
  // C3対応: Supabase へ書く前に必ず CalendarColorInputSchema.parse() でパレット外の値を弾く。
  const updatePersonalColors = useMutation({
    mutationFn: async (colors: PersonalColorsInput) => {
      if (!userId) throw new Error("userId is required");
      const validated = CalendarColorInputSchema.parse(colors);
      const { error } = await supabase
        .from("users")
        .update({
          personal_practice_color: validated.practice_color,
          personal_competition_color: validated.competition_color,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // チーム別の練習色/大会色を作成・更新
  // 省スペース原則: 両方ともデフォルト(null)に戻すなら upsert せず行自体を削除する
  // C3対応: Supabase へ書く前に必ず CalendarColorInputSchema.parse() でパレット外の値を弾く。
  const upsertTeamColors = useMutation({
    mutationFn: async ({ teamId, ...colors }: TeamColorsInput) => {
      if (!userId) throw new Error("userId is required");
      const validated = CalendarColorInputSchema.parse(colors);

      if (validated.practice_color === null && validated.competition_color === null) {
        const { error } = await supabase
          .from("user_team_calendar_colors")
          .delete()
          .eq("user_id", userId)
          .eq("team_id", teamId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("user_team_calendar_colors").upsert(
        {
          user_id: userId,
          team_id: teamId,
          practice_color: validated.practice_color,
          competition_color: validated.competition_color,
        },
        { onConflict: "user_id,team_id" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // チーム別設定をデフォルトに戻す(行削除)
  const deleteTeamColors = useMutation({
    mutationFn: async (teamId: string) => {
      if (!userId) throw new Error("userId is required");
      const { error } = await supabase
        .from("user_team_calendar_colors")
        .delete()
        .eq("user_id", userId)
        .eq("team_id", teamId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    settings: query.data ?? EMPTY_SETTINGS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    updatePersonalColors,
    upsertTeamColors,
    deleteTeamColors,
  };
}
