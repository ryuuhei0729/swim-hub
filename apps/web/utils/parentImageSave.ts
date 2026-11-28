// =============================================================================
// 練習・大会 (親行) の画像を保存する
// =============================================================================
// チーム練習・チーム大会の追加/編集 (TeamPractices / TeamCompetitions の基本フォーム) で使う。
// 手順はダッシュボード (useDashboardHandlers) ・usePracticeTabSave の画像処理と同じ:
//   1. 新しい画像を圧縮してアップロードする
//   2. 保存直前に image_paths を取り直す (他の人が足した画像を消さないため。Issue #48)
//   3. image_paths を「既存 - 削除 + 新規」で更新する
//   4. 更新できたら、削除した画像をストレージから消す (失敗しても DB は正しいので無視する)
// 1〜3 のどこかで失敗したら、アップロード済みの画像を消してからエラーを投げる。

import type { SupabaseClient } from "@supabase/supabase-js";
import { PracticeAPI } from "@apps/shared/api/practices";
import { CompetitionAPI } from "@apps/shared/api/competitions";
import type { PracticeImageFile } from "@/components/forms/PracticeImageUploader";

export interface ParentImageChanges {
  newFiles: Pick<PracticeImageFile, "file">[];
  deletedIds: string[];
}

export type ParentImageKind = "practice" | "competition";

const TABLE: Record<ParentImageKind, "practices" | "competitions"> = {
  practice: "practices",
  competition: "competitions",
};

export function hasParentImageChanges(changes?: ParentImageChanges | null): boolean {
  return !!changes && (changes.newFiles.length > 0 || changes.deletedIds.length > 0);
}

export async function saveParentImages(
  supabase: SupabaseClient,
  kind: ParentImageKind,
  parentId: string,
  changes: ParentImageChanges,
): Promise<void> {
  if (!hasParentImageChanges(changes)) return;

  const practiceAPI = new PracticeAPI(supabase);
  const competitionAPI = new CompetitionAPI(supabase);
  const upload = (file: File) =>
    kind === "practice"
      ? practiceAPI.uploadPracticeImage(parentId, file)
      : competitionAPI.uploadCompetitionImage(parentId, file);
  const remove = (path: string) =>
    kind === "practice"
      ? practiceAPI.deletePracticeImage(path)
      : competitionAPI.deleteCompetitionImage(path);

  const uploadedPaths: string[] = [];
  try {
    if (changes.newFiles.length > 0) {
      const { processPracticeImage } = await import("@/utils/imageUtils");
      const processed = await Promise.all(
        changes.newFiles.map(async (f) => (await processPracticeImage(f.file)).thumbnail),
      );
      for (const file of processed) {
        uploadedPaths.push(await upload(file));
      }
    }

    const { data: current, error: selectError } = await supabase
      .from(TABLE[kind])
      .select("image_paths")
      .eq("id", parentId)
      .single();
    if (selectError || !current) {
      throw selectError ?? new Error(`Failed to fetch ${TABLE[kind]}.image_paths`);
    }
    const existing: string[] = (current as { image_paths: string[] | null }).image_paths ?? [];

    const { error: updateError } = await supabase
      .from(TABLE[kind])
      .update({
        image_paths: [
          ...existing.filter((p) => !changes.deletedIds.includes(p)),
          ...uploadedPaths,
        ],
      })
      .eq("id", parentId);
    if (updateError) throw updateError;
  } catch (err) {
    for (const path of uploadedPaths) {
      await remove(path).catch(() => {});
    }
    throw err;
  }

  for (const path of changes.deletedIds) {
    await remove(path).catch((deleteError) => {
      console.error(`画像 ${path} の削除に失敗:`, deleteError);
    });
  }
}
