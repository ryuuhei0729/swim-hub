// =============================================================================
// 練習タブモーダル一括保存フック
// =============================================================================
// NOTE: ダッシュボード (useDashboardHandlers) と 履歴タブ (/practice) の両方から
// 利用される共通ロジック。ダッシュボードの `handlePracticeTabSave` から抽出したもので、
// 挙動は変更していない（ロジックの移設のみ）。

"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { PracticeAPI } from "@apps/shared/api";
import type { PracticeLogTagInsert } from "@apps/shared/types";
import { computePracticeLogDiff } from "@/utils/tabModalDiff";
import { uploadVideoClient } from "@/lib/video-upload-client";
import type { PracticeTabSaveParams } from "@/components/forms/PracticeTabModal";

export interface UsePracticeTabSaveProps {
  supabase: SupabaseClient<Database>;
  user: { id: string } | null;
  createPractice: (
    practice: Omit<import("@swim-hub/shared/types").PracticeInsert, "user_id">,
  ) => Promise<import("@swim-hub/shared/types").Practice>;
  updatePractice: (
    id: string,
    updates: import("@swim-hub/shared/types").PracticeUpdate,
  ) => Promise<import("@swim-hub/shared/types").Practice>;
  createPracticeLog: (
    log: Omit<import("@swim-hub/shared/types").PracticeLogInsert, "user_id">,
  ) => Promise<import("@swim-hub/shared/types").PracticeLog>;
  updatePracticeLog: (
    id: string,
    updates: import("@swim-hub/shared/types").PracticeLogUpdate,
  ) => Promise<import("@swim-hub/shared/types").PracticeLog>;
  deletePracticeLog?: (id: string) => Promise<void>;
  createPracticeTime: (
    time: import("@swim-hub/shared/types").PracticeTimeInsert,
  ) => Promise<import("@swim-hub/shared/types").PracticeTime>;
  deletePracticeTime: (id: string) => Promise<void>;
  setPracticeLoading: (loading: boolean) => void;
  setEditingPracticeId: (id: string | null) => void;
  closePracticeTabModal: () => void;
  /** 保存成功時に呼び出すコールバック（ダッシュボードでは refreshCalendar、履歴タブでは refetch 等） */
  onSaved: () => void;
}

/**
 * 練習タブモーダル（PracticeTabModal）の一括保存ハンドラーを提供するフック。
 * 親 (practices) INSERT/UPDATE → 画像処理 → 子 (practice_logs) diff INSERT/UPDATE/DELETE の順に実行する。
 * 親成功・子失敗時は editingPracticeId をセットして編集モードに落とし込み、エラーを再スローする（モーダルは閉じない）。
 */
export function usePracticeTabSave({
  supabase,
  user,
  createPractice,
  updatePractice,
  createPracticeLog,
  updatePracticeLog,
  deletePracticeLog,
  createPracticeTime,
  deletePracticeTime,
  setPracticeLoading,
  setEditingPracticeId,
  closePracticeTabModal,
  onSaved,
}: UsePracticeTabSaveProps) {
  const t = useTranslations("dashboard.handlers");

  const handlePracticeTabSave = useCallback(
    async (params: PracticeTabSaveParams) => {
      if (!user?.id) throw new Error(t("authRequired"));

      const { basicData, imageData, logs, editingPracticeId: paramEditingId, originalLogIds } = params;

      setPracticeLoading(true);
      let practiceId: string | null = paramEditingId;

      try {
        // ── 1. 練習本体 (parent) INSERT / UPDATE ──
        if (!practiceId) {
          const payload = {
            date: basicData.date,
            title: basicData.title || null,
            place: basicData.place || null,
            note: basicData.note || null,
          };
          const created = await createPractice(payload);
          practiceId = created.id;
          // 子 INSERT 失敗時に再送信できるよう ID を保持
          setEditingPracticeId(practiceId);
        } else {
          await updatePractice(practiceId, {
            date: basicData.date,
            title: basicData.title || null,
            place: basicData.place || null,
            note: basicData.note || null,
          });
        }

        // ── 2. 画像処理 ──
        if (practiceId && imageData) {
          const practiceAPI = new PracticeAPI(supabase);
          const uploadedPaths: string[] = [];
          try {
            if (imageData.newFiles.length > 0) {
              const { processPracticeImage } = await import("@/utils/imageUtils");
              const processed = await Promise.all(
                imageData.newFiles.map(async (f) => (await processPracticeImage(f.file)).thumbnail),
              );
              for (const file of processed) {
                uploadedPaths.push(await practiceAPI.uploadPracticeImage(practiceId!, file));
              }
            }
            const { data: cur } = await supabase
              .from("practices")
              .select("image_paths")
              .eq("id", practiceId)
              .single();
            const existing: string[] = (cur as { image_paths?: string[] | null } | null)?.image_paths ?? [];
            await supabase
              .from("practices")
              .update({ image_paths: [...existing.filter((p) => !imageData.deletedIds.includes(p)), ...uploadedPaths] })
              .eq("id", practiceId);
            for (const path of imageData.deletedIds) {
              await practiceAPI.deletePracticeImage(path).catch(() => {});
            }
          } catch {
            for (const path of uploadedPaths) {
              await practiceAPI.deletePracticeImage(path).catch(() => {});
            }
            throw new Error(t("practiceCreatedButImageFailed"));
          }
        }
      } catch (err) {
        setPracticeLoading(false);
        throw err;
      }

      // ── 3. 練習ログ (children) diff INSERT / UPDATE / DELETE ──
      const diff = computePracticeLogDiff(
        logs.map((l) => ({ ...l, tempMenuId: l.tempMenuId })),
        originalLogIds,
      );

      // DELETE
      for (const id of diff.toDelete) {
        if (deletePracticeLog) await deletePracticeLog(id);
      }

      // ADD
      for (const menu of diff.toAdd) {
        const logInput = {
          practice_id: practiceId!,
          style: menu.style || "fr",
          swim_category: menu.swimCategory || "Swim",
          rep_count: Number(menu.reps) || 1,
          set_count: Number(menu.sets) || 1,
          distance: Number(menu.distance) || 100,
          circle: menu.circleTime || null,
          note: menu.note || "",
        };
        const createdLog = await createPracticeLog(logInput);
        if (menu.tags?.length && createdLog) {
          const qb = supabase.from("practice_log_tags") as unknown as {
            insert: (v: PracticeLogTagInsert) => Promise<{ error: { message: string } | null }>;
          };
          for (const tag of menu.tags) {
            const { error } = await qb.insert({ practice_log_id: createdLog.id, practice_tag_id: tag.id });
            if (error) throw new Error(t("insertPracticeTagFailed", { detail: error.message }));
          }
        }
        if (menu.times?.length && createdLog) {
          await Promise.all(
            menu.times
              .filter((te) => te.time > 0)
              .map((te) =>
                createPracticeTime({
                  user_id: user.id,
                  practice_log_id: createdLog.id,
                  set_number: te.setNumber,
                  rep_number: te.repNumber,
                  time: te.time,
                } as import("@swim-hub/shared/types").PracticeTimeInsert),
              ),
          );
        }
        if (menu.pendingVideo && createdLog) {
          await uploadVideoClient({ type: "practice-log", id: createdLog.id, file: menu.pendingVideo.file, thumbnail: menu.pendingVideo.thumbnail }).catch(() => {
            alert(t("videoUploadPartialPractice"));
          });
        }
      }

      // UPDATE
      for (const { id, data: menu } of diff.toUpdate) {
        await updatePracticeLog(id, {
          style: menu.style || "fr",
          swim_category: menu.swimCategory || "Swim",
          rep_count: Number(menu.reps) || 1,
          set_count: Number(menu.sets) || 1,
          distance: Number(menu.distance) || 100,
          circle: menu.circleTime || null,
          note: menu.note || "",
        });
        // タグ再同期
        await supabase.from("practice_log_tags").delete().eq("practice_log_id", id);
        if (menu.tags?.length) {
          const qb = supabase.from("practice_log_tags") as unknown as {
            insert: (v: PracticeLogTagInsert) => Promise<{ error: { message: string } | null }>;
          };
          for (const tag of menu.tags) {
            const { error } = await qb.insert({ practice_log_id: id, practice_tag_id: tag.id });
            if (error) throw new Error(t("insertPracticeTagFailed", { detail: error.message }));
          }
        }
        // 時間再同期
        const { data: existingTimes } = await supabase
          .from("practice_times")
          .select("id")
          .eq("practice_log_id", id);
        if (existingTimes?.length) {
          await Promise.all(
            (existingTimes as Array<{ id: string }>).map((t) => deletePracticeTime(t.id)),
          );
        }
        if (menu.times?.length) {
          await Promise.all(
            menu.times
              .filter((te) => te.time > 0)
              .map((te) =>
                createPracticeTime({
                  user_id: user.id,
                  practice_log_id: id,
                  set_number: te.setNumber,
                  rep_number: te.repNumber,
                  time: te.time,
                } as import("@swim-hub/shared/types").PracticeTimeInsert),
              ),
          );
        }
      }

      // 全成功 → モーダルを閉じる
      setEditingPracticeId(null);
      closePracticeTabModal();
      onSaved();
      setPracticeLoading(false);
    },
    [
      user,
      supabase,
      createPractice,
      updatePractice,
      createPracticeLog,
      updatePracticeLog,
      deletePracticeLog,
      createPracticeTime,
      deletePracticeTime,
      setPracticeLoading,
      setEditingPracticeId,
      closePracticeTabModal,
      onSaved,
      t,
    ],
  );

  return handlePracticeTabSave;
}
