"use client";

import React from "react";
import type { PracticeTag, Style } from "@apps/shared/types";
import type { TimeEntry } from "@apps/shared/types/ui";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import type {
  PracticeMenuFormData,
  EntryFormData,
  RecordFormDataInternal,
} from "@/stores/types";
import { convertRecordFormData } from "@/stores/types";
import { getCompetitionId } from "../_utils/dashboardHelpers";
import { getEntryDataListForRecord } from "@/utils/getEntryDataListForRecord";
import { useAuth } from "@/contexts";
import { useCompetitionInfoQuery } from "@apps/shared/hooks/queries/records";
import PracticeLogForm from "@/components/forms/PracticeLogForm";
import EntryLogForm from "@/components/forms/EntryLogForm";
import RecordLogForm from "@/components/forms/RecordLogForm";
import PracticeTabModal from "@/components/forms/PracticeTabModal";
import CompetitionTabModal from "@/components/forms/CompetitionTabModal";
import type { PracticeTabSaveParams } from "@/components/forms/PracticeTabModal";
import type { CompetitionTabSaveParams } from "@/components/forms/CompetitionTabModal";

interface FormModalsProps {
  onPracticeLogSubmit: (formDataArray: PracticeMenuFormData[]) => Promise<void>;
  onEntrySubmit: (entriesData: EntryFormData[]) => Promise<void>;
  onEntrySkip: () => void;
  onRecordLogSubmit: (formDataList: RecordFormDataInternal[]) => Promise<void>;
  onPracticeTabSave: (params: PracticeTabSaveParams) => Promise<void>;
  onCompetitionTabSave: (params: CompetitionTabSaveParams) => Promise<void>;
  styles: Style[];
}

export function FormModals({
  onPracticeLogSubmit,
  onEntrySubmit,
  onEntrySkip,
  onRecordLogSubmit,
  onPracticeTabSave,
  onCompetitionTabSave,
  styles,
}: FormModalsProps) {
  const { supabase } = useAuth();

  const {
    isLogFormOpen: isPracticeLogFormOpen,
    isOpen: isPracticeTabModalOpen,
    selectedDate,
    editingData,
    createdPracticeId,
    editingPracticeId,
    isLoading,
    availableTags,
    activeTab: practiceActiveTab,
    closeLogForm: closePracticeLogForm,
    closeTabModal: closePracticeTabModal,
    setAvailableTags,
  } = usePracticeStore();

  const {
    isEntryFormOpen: isEntryLogFormOpen,
    isRecordFormOpen: isRecordLogFormOpen,
    isOpen: isCompetitionTabModalOpen,
    selectedDate: competitionSelectedDate,
    createdCompetitionId,
    createdEntries,
    editingData: competitionEditingData,
    editingCompetitionId,
    isLoading: competitionIsLoading,
    activeTab: competitionActiveTab,
    entryLocked: competitionEntryLocked,
    styles: competitionStyles,
    closeEntryForm: closeEntryLogForm,
    closeRecordForm: closeRecordLogForm,
    closeTabModal: closeCompetitionTabModal,
  } = useCompetitionStore();

  // competitionIdを計算（createdCompetitionIdまたはcompetitionEditingDataから取得）
  const computedCompetitionId = React.useMemo(() => {
    return getCompetitionId(createdCompetitionId, competitionEditingData) || "";
  }, [createdCompetitionId, competitionEditingData]);

  // competitionIdから大会情報を取得（competitionEditingDataに情報がない場合）
  const isFormOpen = isEntryLogFormOpen || isRecordLogFormOpen;
  const { data: competitionInfo } = useCompetitionInfoQuery(
    supabase,
    isFormOpen ? computedCompetitionId || undefined : undefined,
  );

  // 大会のtitleを取得（competitionEditingDataまたはcompetitionInfoから）
  const computedCompetitionTitle = React.useMemo(() => {
    if (competitionEditingData && typeof competitionEditingData === "object") {
      const data = competitionEditingData as {
        title?: string;
        metadata?: { competition?: { title?: string } };
        editData?: { competition?: { title?: string } };
      };

      // DayDetailModalから渡される場合: editData.competition.title
      if (data.editData) {
        const editData = data.editData as { competition?: { title?: string } };
        if (editData.competition?.title) {
          return editData.competition.title;
        }
      }

      // その他の場合: metadata.competition.title または title
      if (data.metadata?.competition?.title || data.title) {
        return data.metadata?.competition?.title || data.title;
      }
    }

    // competitionEditingDataに情報がない場合は、データベースから取得した情報を使用
    return competitionInfo?.title;
  }, [competitionEditingData, competitionInfo]);

  // 大会の日付を取得（competitionEditingDataまたはcompetitionInfoから）
  const computedCompetitionDate = React.useMemo(() => {
    if (competitionEditingData && typeof competitionEditingData === "object") {
      const data = competitionEditingData as {
        date?: string;
        metadata?: { competition?: { date?: string } };
        editData?: { date?: string; competition?: { date?: string } };
      };

      // DayDetailModalから渡される場合: editData.competition.date または editData.date
      if (data.editData) {
        const editData = data.editData as { date?: string; competition?: { date?: string } };
        if (editData.competition?.date || editData.date) {
          return editData.competition?.date || editData.date;
        }
      }

      // その他の場合: metadata.competition.date または date
      if (data.metadata?.competition?.date || data.date) {
        return data.metadata?.competition?.date || data.date;
      }
    }

    // competitionEditingDataに情報がない場合は、データベースから取得した情報を使用
    return competitionInfo?.date;
  }, [competitionEditingData, competitionInfo]);

  // 大会のプールタイプを取得（competitionEditingDataまたはcompetitionInfoから）
  const computedPoolType = React.useMemo(() => {
    if (competitionEditingData && typeof competitionEditingData === "object") {
      const data = competitionEditingData as {
        poolType?: number;
        pool_type?: number;
        metadata?: { competition?: { pool_type?: number } };
        editData?: { competition?: { pool_type?: number } };
      };

      // DayDetailModalから渡される場合: editData.competition.pool_type
      if (data.editData) {
        const editData = data.editData as { competition?: { pool_type?: number } };
        if (editData.competition?.pool_type !== undefined) {
          return editData.competition.pool_type;
        }
      }

      // その他の場合: metadata.competition.pool_type または poolType/pool_type
      if (data.metadata?.competition?.pool_type !== undefined) {
        return data.metadata.competition.pool_type;
      }
      if (data.poolType !== undefined) {
        return data.poolType;
      }
      if (data.pool_type !== undefined) {
        return data.pool_type;
      }
    }

    // competitionEditingDataに情報がない場合は、データベースから取得した情報を使用
    return competitionInfo?.poolType;
  }, [competitionEditingData, competitionInfo]);

  // Entryフォーム初期値を取得するヘルパー関数
  const getEntryInitialEntries = (
    editingData: unknown,
  ): Array<{
    id: string;
    styleId: string;
    entryTime: number;
    note: string;
  }> => {
    if (!editingData || typeof editingData !== "object") {
      return [];
    }

    // CalendarItem経由で渡される editData.entries を優先
    if (
      "editData" in editingData &&
      editingData.editData &&
      typeof editingData.editData === "object"
    ) {
      const editPayload = editingData.editData as { entries?: Array<Record<string, unknown>> };
      if (Array.isArray(editPayload.entries)) {
        return editPayload.entries.map((entry, index) => ({
          id: String(entry.id ?? `entry-${index + 1}`),
          styleId: String(entry.styleId ?? entry.style_id ?? ""),
          entryTime:
            typeof entry.entryTime === "number"
              ? entry.entryTime
              : typeof entry.entry_time === "number"
                ? entry.entry_time
                : 0,
          note: String(entry.note ?? ""),
        }));
      }
    }

    // editingDataが直接entriesプロパティを持っている場合（DayDetailModalから渡される場合）
    if (
      "entries" in editingData &&
      Array.isArray((editingData as { entries?: Array<Record<string, unknown>> }).entries)
    ) {
      const entries = (editingData as { entries: Array<Record<string, unknown>> }).entries;
      return entries.map((entry, index) => ({
        id: String(entry.id ?? `entry-${index + 1}`),
        styleId: String(entry.styleId ?? entry.style_id ?? ""),
        entryTime:
          typeof entry.entryTime === "number"
            ? entry.entryTime
            : typeof entry.entry_time === "number"
              ? entry.entry_time
              : 0,
        note: String(entry.note ?? ""),
      }));
    }

    // 旧フォーマット（単一エントリー）
    if ("type" in editingData && (editingData as { type?: string }).type === "entry") {
      const legacy = editingData as {
        id?: string;
        styleId?: number;
        style_id?: number;
        entryTime?: number;
        entry_time?: number | null;
        note?: string | null;
      };

      return [
        {
          id: legacy.id || "entry-1",
          styleId: String(legacy.styleId ?? legacy.style_id ?? ""),
          entryTime: legacy.entryTime ?? legacy.entry_time ?? 0,
          note: legacy.note ?? "",
        },
      ];
    }

    return [];
  };

  const entryInitialEntries = React.useMemo(
    () => getEntryInitialEntries(competitionEditingData),
    [competitionEditingData],
  );

  return (
    <>
      {/* 練習メニューフォーム (個別ログ追加・編集) */}
      <>
        <PracticeLogForm
          isOpen={isPracticeLogFormOpen}
          onClose={closePracticeLogForm}
          onSubmit={onPracticeLogSubmit}
          practiceId={
            createdPracticeId ||
            (editingData && typeof editingData === "object" && "practiceId" in editingData
              ? editingData.practiceId || ""
              : "")
          }
          editData={(() => {
            if (!editingData || typeof editingData !== "object" || !("style" in editingData)) {
              return undefined;
            }

            const data = editingData as {
              id?: string;
              style: string;
              swim_category?: "Swim" | "Pull" | "Kick";
              distance?: number;
              rep_count?: number;
              set_count?: number;
              circle?: number | null;
              note?: string | null;
              tags?: PracticeTag[];
              times?: Array<{ memberId: string; times: TimeEntry[] }>;
            };

            return {
              id: data.id,
              style: String(data.style || "Fr"),
              swim_category: data.swim_category || "Swim",
              distance: data.distance,
              rep_count: data.rep_count,
              set_count: data.set_count,
              circle: data.circle,
              note: data.note,
              tags: data.tags,
              times: data.times,
            };
          })()}
          isLoading={isLoading}
          availableTags={availableTags}
          setAvailableTags={setAvailableTags}
          styles={[]}
        />
      </>

      {/* エントリー登録フォーム（個別エントリー編集・チーム大会） */}
      <>
        <EntryLogForm
          isOpen={isEntryLogFormOpen}
          onClose={closeEntryLogForm}
          onSubmit={onEntrySubmit}
          onSkip={onEntrySkip}
          competitionId={computedCompetitionId}
          competitionTitle={computedCompetitionTitle}
          competitionDate={computedCompetitionDate}
          poolType={computedPoolType}
          isLoading={competitionIsLoading}
          styles={styles.map((s) => ({
            id: s.id.toString(),
            nameJp: s.name_jp,
            distance: s.distance,
          }))}
          editData={(() => {
            if (
              !competitionEditingData ||
              competitionEditingData === null ||
              typeof competitionEditingData !== "object"
            ) {
              return undefined;
            }

            if ("type" in competitionEditingData && competitionEditingData.type === "entry") {
              const data = competitionEditingData as {
                id?: string;
                type: string;
                styleId?: number;
                entryTime?: number;
                note?: string;
              };

              return {
                id: data.id,
                styleId: data.styleId,
                entryTime: data.entryTime,
                note: data.note,
              };
            }

            return undefined;
          })()}
          initialEntries={entryInitialEntries}
        />
      </>

      {/* 第3段階: 記録登録フォーム */}
      <>
        <RecordLogForm
          isOpen={isRecordLogFormOpen}
          onClose={closeRecordLogForm}
          onSubmit={async (formDataList) => {
            const converted = formDataList.map(convertRecordFormData);
            await onRecordLogSubmit(converted);
          }}
          competitionId={computedCompetitionId}
          competitionTitle={computedCompetitionTitle}
          competitionDate={computedCompetitionDate}
          poolType={computedPoolType}
          editData={(() => {
            if (
              !competitionEditingData ||
              competitionEditingData === null ||
              typeof competitionEditingData !== "object" ||
              !("id" in competitionEditingData)
            ) {
              return null;
            }

            const data = competitionEditingData as {
              id?: string;
              styleId?: number;
              time?: number;
              isRelaying?: boolean;
              splitTimes?: Array<{
                id?: string;
                recordId?: string;
                distance: number;
                splitTime: number;
                createdAt?: string;
              }>;
              note?: string;
              videoPath?: string | null;
              reactionTime?: number | null;
            };

            const splitTimes = data.splitTimes?.map((st) => ({
              id: st.id || "",
              recordId: st.recordId || "",
              distance: st.distance,
              splitTime: st.splitTime,
              createdAt: st.createdAt || "",
            }));

            return {
              id: data.id,
              styleId: data.styleId,
              time: data.time,
              isRelaying: data.isRelaying,
              splitTimes: splitTimes,
              note: data.note,
              videoPath: data.videoPath === null ? undefined : data.videoPath,
              reactionTime: data.reactionTime,
            };
          })()}
          isLoading={competitionIsLoading}
          styles={styles.map((style) => ({
            id: style.id.toString(),
            nameJp: style.name_jp,
            distance: style.distance,
          }))}
          entryDataList={getEntryDataListForRecord(competitionEditingData, createdEntries)}
        />
      </>

      {/* タブモーダル: 練習 (2タブ統合) */}
      <PracticeTabModal
        isOpen={isPracticeTabModalOpen}
        onClose={closePracticeTabModal}
        onSave={onPracticeTabSave}
        selectedDate={selectedDate || new Date()}
        editingData={editingData}
        editingPracticeId={editingPracticeId}
        isLoading={isLoading}
        availableTags={availableTags}
        setAvailableTags={setAvailableTags}
        initialTab={practiceActiveTab}
      />

      {/* タブモーダル: 大会 (3タブ統合) */}
      <CompetitionTabModal
        isOpen={isCompetitionTabModalOpen}
        onClose={closeCompetitionTabModal}
        onSave={onCompetitionTabSave}
        selectedDate={competitionSelectedDate || new Date()}
        editingData={competitionEditingData}
        editingCompetitionId={editingCompetitionId}
        styles={competitionStyles.map((s) => ({
          id: s.id.toString(),
          nameJp: s.name_jp,
          distance: s.distance,
        }))}
        existingEntries={getEntryDataListForRecord(competitionEditingData, createdEntries)}
        isLoading={competitionIsLoading}
        initialTab={competitionActiveTab}
        entryLocked={competitionEntryLocked}
      />
    </>
  );
}
