// =============================================================================
// フォーカスポイント API クラス
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { authRequiredError } from "./auth-utils";
import type {
  CreateFocusPointInput,
  FocusPoint,
  FocusPointStatus,
  UpdateFocusPointInput,
} from "../types/focusPoint";

/** DB のトリガーが取り組み中の上限超えで投げるメッセージ */
const LIMIT_EXCEEDED_MESSAGE = "focus_point_limit_exceeded";

/**
 * 取り組み中 (active) が上限に達しているのに追加・再開しようとしたときのエラー。
 * 画面側は instanceof で見分けて「3つまで」の案内を出す
 */
export class FocusPointLimitError extends Error {
  constructor() {
    super("フォーカスポイントは同時に3つまでです");
    this.name = "FocusPointLimitError";
  }
}

export function isFocusPointLimitError(error: unknown): error is FocusPointLimitError {
  return error instanceof FocusPointLimitError;
}

/** Supabase のエラーが上限超えのトリガー由来なら FocusPointLimitError に置き換える */
function toFocusPointError(error: unknown): unknown {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  return message.includes(LIMIT_EXCEEDED_MESSAGE) ? new FocusPointLimitError() : error;
}

/** 空欄のメモは null で保存する */
function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export class FocusPointAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 自分のフォーカスポイントを全件取得する (取り組み中・身についたの両方)。
   * 古い順。身についたものの並びは画面側で mastered_at を見て決める
   */
  async getFocusPoints(): Promise<FocusPoint[]> {
    const { data, error } = await this.supabase
      .from("focus_points")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []) as FocusPoint[];
  }

  /** 取り組み中として追加する。上限を超えると FocusPointLimitError */
  async createFocusPoint(input: CreateFocusPointInput): Promise<FocusPoint> {
    const {
      data: { user },
      error: authError,
    } = await this.supabase.auth.getUser();
    if (!user) throw authRequiredError(authError);

    const { data, error } = await this.supabase
      .from("focus_points")
      .insert({
        user_id: user.id,
        title: input.title.trim(),
        note: normalizeNote(input.note),
      })
      .select()
      .single();

    if (error) throw toFocusPointError(error);
    return data as FocusPoint;
  }

  /** タイトル・メモを更新する */
  async updateFocusPoint(id: string, input: UpdateFocusPointInput): Promise<FocusPoint> {
    const { data, error } = await this.supabase
      .from("focus_points")
      .update({
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.note !== undefined && { note: normalizeNote(input.note) }),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as FocusPoint;
  }

  /**
   * 「身についた」にする / 取り組み中に戻す。
   * mastered_at は DB のトリガーが状態に合わせて入れる (端末の時計に頼らない)。
   * 戻すときに取り組み中が上限に達していると FocusPointLimitError
   */
  async setStatus(id: string, status: FocusPointStatus): Promise<FocusPoint> {
    const { data, error } = await this.supabase
      .from("focus_points")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw toFocusPointError(error);
    return data as FocusPoint;
  }

  /** 削除する */
  async deleteFocusPoint(id: string): Promise<void> {
    // PostgREST は RLS で DELETE が拒否されても 0 行削除で正常終了するため、
    // 削除された行を返させて件数で成否を見る (practiceLogTemplates.ts の deleteTemplate と同型)
    const { data, error } = await this.supabase
      .from("focus_points")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("フォーカスポイントの削除に失敗しました");
    }
  }
}
