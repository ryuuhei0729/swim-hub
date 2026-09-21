// =============================================================================
// 練習タブモーダル一括保存フック
// =============================================================================
// NOTE: ダッシュボード (useDashboardHandlers) と 履歴タブ (/practice) の両方から
// 利用される共通ロジック。ダッシュボードの `handlePracticeTabSave` から抽出したもので、
// 挙動は変更していない（ロジックの移設のみ）。

"use client";

import { useCallback, useRef } from "react";
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
  /**
   * 親 (practices) 行の basicData / image_paths UPDATE を許可するか。
   * 省略時は true (従来動作。チームタブ (TeamPractices.tsx) は認可を RLS に委譲するため省略してよい)。
   * **個人画面 (PracticeClient.tsx / dashboard) は team_id の有無から導出し、必ず明示的に渡すこと。**
   * 省略すると「個人画面から team_id 付き練習の basicData を編集できてしまう」フェイルオープンになる。
   */
  allowParentUpdate?: boolean;
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
  allowParentUpdate,
}: UsePracticeTabSaveProps) {
  const t = useTranslations("dashboard.handlers");
  // 省略時は従来動作 (更新する)。チームタブ (TeamPractices.tsx) は明示的に渡さず
  // この既定値に委ね、認可は RLS (is_team_admin) に任せる。
  const canUpdateParent = allowParentUpdate ?? true;

  // Reviewer 指摘 (F3): TeamPractices.tsx の自己ログ追加 (非 admin) は
  // 子 (practice_logs) 保存失敗時、親 practices の作成は成功済みのまま
  // editingPracticeId が保持されモーダルが開いたまま残る (子 INSERT 失敗時の
  // 再送信を可能にするための既存設計)。ユーザーが再送信すると basicData が
  // 無変更でも UPDATE 分岐に入り、非 admin には新 RLS が働いて親 UPDATE 自体が
  // 拒否され、再送信 (本来は子だけのはずの再試行) ごと失敗する。
  // TeamPractices.tsx は編集不可のため、フック側で「直前に自分が適用した
  // basicData と一致するなら UPDATE を発行しない」ダーティチェックを行い、
  // 不要な UPDATE (と、それに伴う RLS 拒否) 自体を発生させない。
  const lastAppliedParentDataRef = useRef<{
    practiceId: string;
    basicData: { date: string; title: string | null; place: string | null; note: string | null };
  } | null>(null);

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
          lastAppliedParentDataRef.current = { practiceId, basicData: payload };
          // 子 INSERT 失敗時に再送信できるよう ID を保持
          setEditingPracticeId(practiceId);
        } else if (canUpdateParent) {
          const payload = {
            date: basicData.date,
            title: basicData.title || null,
            place: basicData.place || null,
            note: basicData.note || null,
          };
          const isUnchangedFromLastApply =
            lastAppliedParentDataRef.current?.practiceId === practiceId &&
            JSON.stringify(lastAppliedParentDataRef.current.basicData) === JSON.stringify(payload);

          if (!isUnchangedFromLastApply) {
            await updatePractice(practiceId, payload);
            lastAppliedParentDataRef.current = { practiceId, basicData: payload };
          }
        }
        // canUpdateParent === false: 親 UPDATE をスキップする (Sprint Contract 2)。
        // 個人画面から team_id 付き練習の basicData を書き換えさせないための第二防御
        // (第一防御は D3 の編集ボタン非表示、第三防御は RLS)。子 (practice_logs) の
        // 保存はこの下で必ず継続する。

        // ── 2. 画像処理 ──
        // image_paths も親行の列のためスキップ対象。アップロードより前に判定する
        // (アップロード後にスキップすると孤児ファイルが Storage に残るため)。
        if (practiceId && imageData && canUpdateParent) {
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
            // 保存直前に権威ある image_paths を再取得する。取得に失敗した場合 (ネットワークエラー等) に
            // 「不明」を [] とみなして全置換してしまうと、他メンバーがアップロード済みの画像が
            // 参照から外れて消失する (Issue #48)。取得失敗時は throw して image_paths を含む
            // update を送らずに中断する (外側の catch でアップロード済み画像のロールバックを行う)。
            const { data: cur, error: imagePathsError } = await supabase
              .from("practices")
              .select("image_paths")
              .eq("id", practiceId)
              .single();
            if (imagePathsError || !cur) {
              throw imagePathsError ?? new Error("Failed to fetch practice image_paths");
            }
            const existing: string[] = (cur as { image_paths: string[] | null }).image_paths ?? [];
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
          style: menu.style || "Fr",
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
            // 生の PostgrestError.message はテーブル名等を含みうるためテンプレートに埋め込まない（情報露出対策）
            if (error) throw new Error(t("insertPracticeTagFailed"));
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
          style: menu.style || "Fr",
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
            // 生の PostgrestError.message はテーブル名等を含みうるためテンプレートに埋め込まない（情報露出対策）
            if (error) throw new Error(t("insertPracticeTagFailed"));
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
      canUpdateParent,
      t,
    ],
  );

  return handlePracticeTabSave;
}
