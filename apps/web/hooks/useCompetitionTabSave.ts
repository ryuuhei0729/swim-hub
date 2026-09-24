// =============================================================================
// 大会タブモーダル一括保存フック
// =============================================================================
// NOTE: ダッシュボード (useDashboardHandlers) と 履歴タブ (/competition) の両方から
// 利用される共通ロジック。ダッシュボードの `handleCompetitionTabSave` から抽出したもので、
// 挙動は変更していない（ロジックの移設のみ）。

"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { EntryAPI, CompetitionAPI } from "@apps/shared/api";
import { isPoolType } from "@apps/shared/types";
import type { Style } from "@apps/shared/types";
import {
  computeEntryDiff,
  computeRecordDiff,
} from "@/utils/tabModalDiff";
import type { EntryWithStyle } from "@/stores/types";
import { uploadVideoClient } from "@/lib/video-upload-client";
import type { CompetitionTabSaveParams } from "@/components/forms/CompetitionTabModal";

export interface UseCompetitionTabSaveProps {
  supabase: SupabaseClient<Database>;
  user: { id: string } | null;
  styles: Style[];
  createCompetition: (
    competition: Omit<import("@swim-hub/shared/types").CompetitionInsert, "user_id">,
  ) => Promise<import("@swim-hub/shared/types").Competition>;
  updateCompetition: (
    id: string,
    updates: import("@swim-hub/shared/types").CompetitionUpdate,
  ) => Promise<import("@swim-hub/shared/types").Competition>;
  createRecord: (
    record: Omit<import("@swim-hub/shared/types").RecordInsert, "user_id">,
  ) => Promise<import("@swim-hub/shared/types").Record>;
  updateRecord: (
    id: string,
    updates: import("@swim-hub/shared/types").RecordUpdate,
  ) => Promise<import("@swim-hub/shared/types").Record>;
  deleteRecord: (id: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  createSplitTimes: (params: {
    recordId: string;
    // 唯一の呼び出し元 (下記 handleCompetitionTabSave 内の ADD new records 節) は常に
    // formData.splitTimes[].splitTime (RecordFormDataInput で必須の number) を split_time に
    // 詰めて渡すため undefined は来ない。split_time?/splitTime? の緩い型が実装側の
    // `?? 0` フォールバックを誘発していたため、実態に合わせて締める (CLAUDE.md `??` 規約)。
    splitTimes: Array<{ distance: number; split_time: number }>;
  }) => Promise<import("@swim-hub/shared/types").SplitTime[]>;
  replaceSplitTimes: (params: {
    recordId: string;
    splitTimes: Omit<import("@swim-hub/shared/types").SplitTimeInsert, "record_id">[];
  }) => Promise<import("@swim-hub/shared/types").SplitTime[]>;
  setCompetitionLoading: (loading: boolean) => void;
  setEditingCompetitionId: (id: string | null) => void;
  setCreatedEntries: (entries: EntryWithStyle[]) => void;
  closeCompetitionTabModal: () => void;
  /** 保存成功時に呼び出すコールバック（ダッシュボードでは refreshCalendar、履歴タブでは refetch 等） */
  onSaved: () => void;
  /**
   * 親 (competitions) 行の basicData / image_paths UPDATE を許可するか。
   * 省略時は true (従来動作。チームタブ (TeamCompetitions.tsx) は認可を RLS に委譲するため省略してよい)。
   * **個人画面 (CompetitionClient.tsx / dashboard) は team_id の有無から導出し、必ず明示的に渡すこと。**
   * 省略すると「個人画面から team_id 付き大会の basicData を編集できてしまう」フェイルオープンになる。
   */
  allowParentUpdate?: boolean;
}

/**
 * 大会タブモーダル（CompetitionTabModal）の一括保存ハンドラーを提供するフック。
 * 親 (competitions) INSERT/UPDATE → 画像処理 → エントリー diff → 記録 diff の順に実行する。
 */
export function useCompetitionTabSave({
  supabase,
  user,
  styles,
  createCompetition,
  updateCompetition,
  createRecord,
  updateRecord,
  deleteRecord,
  deleteEntry,
  createSplitTimes,
  replaceSplitTimes,
  setCompetitionLoading,
  setEditingCompetitionId,
  setCreatedEntries,
  closeCompetitionTabModal,
  onSaved,
  allowParentUpdate,
}: UseCompetitionTabSaveProps) {
  const t = useTranslations("dashboard.handlers");
  // 省略時は従来動作 (更新する)。チームタブ (TeamCompetitions.tsx) は明示的に渡さず
  // この既定値に委ね、認可は RLS (is_team_admin) に任せる。
  const canUpdateParent = allowParentUpdate ?? true;

  const handleCompetitionTabSave = useCallback(
    async (params: CompetitionTabSaveParams) => {
      if (!user?.id) throw new Error(t("authRequired"));

      const {
        basicData,
        imageData,
        entries,
        records,
        editingCompetitionId: paramEditingId,
        originalEntryIds,
        originalRecordIds,
        competitionRowResolved,
      } = params;

      setCompetitionLoading(true);
      let competitionId: string | null = paramEditingId;

      try {
        // ── 1. 大会本体 (parent) INSERT / UPDATE ──
        const endDate = basicData.endDate || null;
        if (!competitionId) {
          const created = await createCompetition({
            date: basicData.date,
            end_date: endDate,
            title: basicData.title || null,
            place: basicData.place || null,
            pool_type: basicData.poolType,
            note: basicData.note || null,
          });
          competitionId = created.id;
          setEditingCompetitionId(competitionId);
        } else if (competitionRowResolved && canUpdateParent) {
          await updateCompetition(competitionId, {
            date: basicData.date,
            end_date: endDate,
            title: basicData.title || null,
            place: basicData.place || null,
            pool_type: basicData.poolType,
            note: basicData.note || null,
          });
        }
        // competitionRowResolved === false (D-3): 大会本体が DB から未解決のまま。
        // basicData は暫定値の可能性があるため pool_type 等を推測で書き込まず、
        // 競技会本体の UPDATE をスキップする。エントリー/記録の保存は続行する。
        // canUpdateParent === false: 親 UPDATE をスキップする (Sprint Contract 2)。
        // 個人画面から team_id 付き大会の basicData を書き換えさせないための第二防御
        // (第一防御は D3 の編集ボタン非表示、第三防御は RLS)。エントリー/記録の
        // 保存はこの下で必ず継続する。

        // ── 2. 画像処理 ──
        // image_paths も親行の列のためスキップ対象。アップロードより前に判定する
        // (アップロード後にスキップすると孤児ファイルが Storage に残るため)。
        if (competitionId && imageData && canUpdateParent) {
          const competitionAPI = new CompetitionAPI(supabase);
          const uploadedPaths: string[] = [];
          try {
            if (imageData.newFiles.length > 0) {
              const { processCompetitionImage } = await import("@/utils/imageUtils");
              const processed = await Promise.all(
                imageData.newFiles.map(async (f) => (await processCompetitionImage(f.file)).thumbnail),
              );
              for (const file of processed) {
                uploadedPaths.push(await competitionAPI.uploadCompetitionImage(competitionId!, file));
              }
            }
            // 保存直前に権威ある image_paths を再取得する。取得に失敗した場合 (ネットワークエラー等) に
            // 「不明」を [] とみなして全置換してしまうと、他メンバーがアップロード済みの画像が
            // 参照から外れて消失する (Issue #48)。取得失敗時は throw して image_paths を含む
            // update を送らずに中断する (外側の catch でアップロード済み画像のロールバックを行う)。
            const { data: cur, error: imagePathsError } = await supabase
              .from("competitions")
              .select("image_paths")
              .eq("id", competitionId)
              .single();
            if (imagePathsError || !cur) {
              throw imagePathsError ?? new Error("Failed to fetch competition image_paths");
            }
            const existing: string[] = (cur as { image_paths: string[] | null }).image_paths ?? [];
            await supabase
              .from("competitions")
              .update({ image_paths: [...existing.filter((p) => !imageData.deletedIds.includes(p)), ...uploadedPaths] })
              .eq("id", competitionId);
            for (const path of imageData.deletedIds) {
              await competitionAPI.deleteCompetitionImage(path).catch(() => {});
            }
          } catch {
            for (const path of uploadedPaths) {
              await competitionAPI.deleteCompetitionImage(path).catch(() => {});
            }
            throw new Error(t("competitionCreatedButImageFailed"));
          }
        }
      } catch (err) {
        setCompetitionLoading(false);
        throw err;
      }

      // ── 3. エントリー (children) diff ADD / UPDATE / DELETE ──
      const entryAPI = new EntryAPI(supabase);
      const createdEntriesList: EntryWithStyle[] = [];
      const entryDiff = computeEntryDiff(entries, originalEntryIds);

      // DELETE removed entries
      for (const id of entryDiff.toDelete) {
        await deleteEntry(id);
      }

      if (entryDiff.toAdd.length > 0 || entryDiff.toUpdate.length > 0) {
        const { data: compData } = await supabase
          .from("competitions")
          .select("team_id")
          .eq("id", competitionId!)
          .single();
        const isTeam = (compData as { team_id: string | null } | null)?.team_id != null;
        const teamId = (compData as { team_id: string | null } | null)?.team_id ?? null;

        // UPDATE existing entries
        for (const { id, data: entryData } of entryDiff.toUpdate) {
          const entry = await entryAPI.updateEntry(id, {
            style_id: parseInt(entryData.styleId),
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note || null,
            is_relaying: entryData.isRelaying ?? false,
          });
          if (entry) {
            const style = styles.find((s) => s.id === entry.style_id);
            createdEntriesList.push({
              id: entry.id,
              competitionId: entry.competition_id,
              userId: entry.user_id,
              styleId: entry.style_id,
              entryTime: entry.entry_time,
              note: entry.note,
              teamId: entry.team_id,
              styleName: style?.name_jp ?? "",
            });
          }
        }

        // ADD new entries
        for (const entryData of entryDiff.toAdd) {
          let entry;
          if (isTeam && teamId) {
            entry = await entryAPI.createTeamEntry(teamId, user.id, {
              competition_id: competitionId!,
              style_id: parseInt(entryData.styleId),
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null,
              is_relaying: entryData.isRelaying ?? false,
            });
          } else {
            entry = await entryAPI.createPersonalEntry({
              competition_id: competitionId!,
              style_id: parseInt(entryData.styleId),
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null,
              is_relaying: entryData.isRelaying ?? false,
            });
          }
          if (entry) {
            const style = styles.find((s) => s.id === entry!.style_id);
            createdEntriesList.push({
              id: entry.id,
              competitionId: entry.competition_id,
              userId: entry.user_id,
              styleId: entry.style_id,
              entryTime: entry.entry_time,
              note: entry.note,
              teamId: entry.team_id,
              styleName: style?.name_jp ?? "",
            });
          }
        }

        if (createdEntriesList.length > 0) setCreatedEntries(createdEntriesList);
      }

      // ── 4. レコード (children) diff ADD / UPDATE / DELETE ──
      // pool_type は params.basicData.poolType を直接使う (Warning, R2)。この値は呼び出し元
      // (CompetitionTabModal) が新規作成時は init 時に強制 resolved、編集時は DB 再取得の成功
      // (失敗時は throw して保存自体が行われない) によってのみ確定させているため、ここで
      // competitions テーブルを再 SELECT するのは構造的に冗長。再 SELECT を消すことで、
      // それが失敗した場合に ?? 0 で長水路の大会に短水路の記録を作ってしまう非対称も
      // 構造的に無くなる (Critical 1 が塞いだ穴がここにも残らない)。
      // basicData.poolType は number 型 (フォーム state) のため、DB 書き込み型 PoolType (0 | 1)
      // への境界で narrowing する。範囲外の値は来ない前提だが、来た場合は 0 にフォールバックする。
      const poolType = isPoolType(basicData.poolType) ? basicData.poolType : 0;

      const recordDiff = computeRecordDiff(records, originalRecordIds);

      // DELETE removed records
      for (const id of recordDiff.toDelete) {
        await deleteRecord(id);
      }

      // UPDATE existing records
      for (const { id, data: formData } of recordDiff.toUpdate) {
        await updateRecord(id, {
          style_id: parseInt(formData.styleId),
          time: formData.time,
          video_path: formData.videoPath || null,
          note: formData.note || null,
          is_relaying: formData.isRelaying || false,
          // D-6: 保存対象の競技会の pool_type に揃える (自分の記録を保存する経路の中だけ。RLS 下で自分の行のみ更新される)。
          pool_type: poolType,
          reaction_time: formData.reactionTime?.trim() ? parseFloat(formData.reactionTime) : null,
        });
        if (formData.splitTimes?.length) {
          await replaceSplitTimes({
            recordId: id,
            splitTimes: formData.splitTimes.map((st) => ({
              distance: typeof st.distance === "string" ? parseFloat(st.distance) : st.distance,
              split_time: st.splitTime,
            })) as Array<Omit<import("@swim-hub/shared/types").SplitTimeInsert, "record_id">>,
          });
        }
      }

      // ADD new records
      for (const formData of recordDiff.toAdd) {
        const newRecord = await createRecord({
          style_id: parseInt(formData.styleId),
          time: formData.time,
          video_path: formData.videoPath || null,
          note: formData.note || null,
          is_relaying: formData.isRelaying || false,
          competition_id: competitionId!,
          pool_type: poolType,
          reaction_time: formData.reactionTime?.trim() ? parseFloat(formData.reactionTime) : null,
        });
        if (formData.splitTimes?.length) {
          await createSplitTimes({
            recordId: newRecord.id,
            splitTimes: formData.splitTimes.map((st) => ({ distance: st.distance, split_time: st.splitTime })) as Array<{ distance: number; split_time: number }>,
          });
        }
        if (formData.pendingVideo) {
          await uploadVideoClient({ type: "record", id: newRecord.id, file: formData.pendingVideo.file, thumbnail: formData.pendingVideo.thumbnail }).catch(() => {
            alert(t("videoUploadPartialCompetition"));
          });
        }
      }

      // 全成功 → モーダルを閉じる
      setEditingCompetitionId(null);
      closeCompetitionTabModal();
      onSaved();
      setCompetitionLoading(false);
    },
    [
      user,
      supabase,
      styles,
      createCompetition,
      updateCompetition,
      createRecord,
      updateRecord,
      deleteRecord,
      deleteEntry,
      createSplitTimes,
      replaceSplitTimes,
      setCompetitionLoading,
      setEditingCompetitionId,
      setCreatedEntries,
      closeCompetitionTabModal,
      onSaved,
      canUpdateParent,
      t,
    ],
  );

  return handleCompetitionTabSave;
}
