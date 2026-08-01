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
    splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }>;
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
}: UseCompetitionTabSaveProps) {
  const t = useTranslations("dashboard.handlers");

  const handleCompetitionTabSave = useCallback(
    async (params: CompetitionTabSaveParams) => {
      if (!user?.id) throw new Error(t("authRequired"));

      const { basicData, imageData, entries, records, editingCompetitionId: paramEditingId, originalEntryIds, originalRecordIds } = params;

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
        } else {
          await updateCompetition(competitionId, {
            date: basicData.date,
            end_date: endDate,
            title: basicData.title || null,
            place: basicData.place || null,
            pool_type: basicData.poolType,
            note: basicData.note || null,
          });
        }

        // ── 2. 画像処理 ──
        if (competitionId && imageData) {
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
            const { data: cur } = await supabase
              .from("competitions")
              .select("image_paths")
              .eq("id", competitionId)
              .single();
            const existing: string[] = (cur as { image_paths?: string[] | null } | null)?.image_paths ?? [];
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
      const { data: competition } = await supabase
        .from("competitions")
        .select("pool_type")
        .eq("id", competitionId!)
        .single();
      const poolType = (competition as { pool_type: 0 | 1 } | null)?.pool_type ?? 0;

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
            splitTimes: formData.splitTimes.map((st) => ({ distance: st.distance, split_time: st.splitTime })) as Array<{ distance: number; split_time?: number; splitTime?: number }>,
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
      t,
    ],
  );

  return handleCompetitionTabSave;
}
