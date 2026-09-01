"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts";
import CalendarContainer from "../_components/CalendarContainer";
import TeamAnnouncementsSection from "../_components/TeamAnnouncementsSection";
import ReflectionModal from "@/app/[locale]/(authenticated)/goals/_components/ReflectionModal";
import GoalReflectionModal from "@/app/[locale]/(authenticated)/goals/_components/GoalReflectionModal";
import { GoalAPI } from "@apps/shared/api/goals";
import type { Milestone, GoalWithMilestones } from "@apps/shared/types";
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useDeletePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  useDeletePracticeLogMutation,
  useCreatePracticeTimeMutation,
  useDeletePracticeTimeMutation,
} from "@apps/shared/hooks/queries/practices";
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useDeleteCompetitionMutation,
  useCreateSplitTimesMutation,
  useReplaceSplitTimesMutation,
} from "@apps/shared/hooks/queries/records";
import { EntryAPI } from "@apps/shared/api";
import type { TeamMembership, Team, Style, PracticeTag } from "@apps/shared/types";
import type { CalendarItem, MonthlySummary } from "@apps/shared/types/ui";
import { notificationKeys } from "@apps/shared/hooks/queries/keys";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useUIStore } from "@/stores/ui/uiStore";
import { FormModals } from "./FormModals";
import { useDashboardHandlers } from "../_hooks/useDashboardHandlers";
import { useCalendarHandlers } from "../_hooks/useCalendarHandlers";

interface DashboardClientProps {
  // サーバー側で取得したデータ
  initialCalendarItems: CalendarItem[];
  initialMonthlySummary: MonthlySummary;
  teams: Array<TeamMembership & { team?: Team }>;
  styles: Style[];
  tags: PracticeTag[];
}

/**
 * ダッシュボードのインタラクティブ部分を担当するClient Component
 */
export default function DashboardClient({
  initialCalendarItems,
  initialMonthlySummary,
  teams,
  styles,
  tags,
}: DashboardClientProps) {
  const { user, supabase } = useAuth();
  const queryClient = useQueryClient();
  const [expiredGoal, setExpiredGoal] = useState<GoalWithMilestones | null>(null);
  const [expiredMilestone, setExpiredMilestone] = useState<Milestone | null>(null);
  const hasCheckedExpiredRef = useRef(false);

  // Zustandストア
  const { calendarRefreshKey, refreshCalendar } = useUIStore();

  const {
    editingData,
    createdPracticeId,
    openTabModal: openPracticeTabModal,
    openLogForm: openPracticeLogForm,
    closeBasicForm: closePracticeBasicForm,
    closeLogForm: closePracticeLogForm,
    closeTabModal: closePracticeTabModal,
    closeAll: closePracticeStoreAll,
    setSelectedDate,
    setEditingData,
    setAvailableTags,
    setLoading: setPracticeLoading,
    setEditingPracticeId,
  } = usePracticeStore();

  const {
    createdCompetitionId,
    editingData: competitionEditingData,
    openTabModal: openCompetitionTabModal,
    openEntryForm: openEntryLogForm,
    openRecordForm: openRecordLogForm,
    closeBasicForm: closeCompetitionBasicForm,
    closeEntryForm: closeEntryLogForm,
    closeRecordForm: closeRecordLogForm,
    closeTabModal: closeCompetitionTabModal,
    closeAll: closeCompetitionStoreAll,
    setCreatedEntries,
    setStyles: setCompetitionStyles,
    setLoading: setCompetitionLoading,
    setEditingData: setCompetitionEditingData,
    setEditingCompetitionId,
  } = useCompetitionStore();

  // サーバー側から取得したデータをストアに設定（初回のみ）
  const initializedRef = React.useRef(false);
  if (!initializedRef.current) {
    setAvailableTags(tags);
    setCompetitionStyles(styles);
    initializedRef.current = true;
  }

  // usePracticeStore/useCompetitionStore は Dashboard/practice/competition の3画面で共有される
  // module-level singleton。マウント時・アンマウント時にタブモーダル状態を必ず閉じておかないと、
  // 他画面(/practice, /competition)で開いたまま遷移してきた場合に isOpen=true が残り、
  // Dashboard に来た瞬間に意図せず TabModal が開いてしまう
  // (逆方向: Dashboard で編集中に他画面へ遷移した場合の状態リークも防ぐ)。
  // 描画前(useLayoutEffect)でリセットすることで、古い TabModal が一瞬でも表示されるのを防ぐ。
  useLayoutEffect(() => {
    closePracticeStoreAll();
    closeCompetitionStoreAll();
    return () => {
      closePracticeStoreAll();
      closeCompetitionStoreAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 期限切れ目標・マイルストーンチェック（ログイン時・1回のみ）
  // 目標を優先してチェックし、目標がなければマイルストーンをチェック
  useEffect(() => {
    if (!user || hasCheckedExpiredRef.current) return;
    hasCheckedExpiredRef.current = true;

    const checkExpired = async () => {
      try {
        const goalAPI = new GoalAPI(supabase);

        // まず期限切れ目標をチェック（優先）
        const expiredGoals = await goalAPI.getExpiredGoals();
        if (expiredGoals && expiredGoals.length > 0) {
          setExpiredGoal(expiredGoals[0]!); // expiredGoals.length > 0 を直上の if で確認済み
          return;
        }

        // 期限切れ目標がなければマイルストーンをチェック
        const expiredMilestones = await goalAPI.getExpiredMilestones();
        if (expiredMilestones && expiredMilestones.length > 0) {
          setExpiredMilestone(expiredMilestones[0]!); // expiredMilestones.length > 0 を直上の if で確認済み
        }
      } catch (error) {
        console.error("期限切れチェックエラー:", error);
      }
    };

    checkExpired();
  }, [user, supabase]);

  // カレンダーイベントハンドラーは useCalendarHandlers カスタムフックから取得

  // 練習記録用のミューテーションフック
  const createPracticeMutation = useCreatePracticeMutation(supabase);
  const updatePracticeMutation = useUpdatePracticeMutation(supabase);
  const deletePracticeMutation = useDeletePracticeMutation(supabase);
  const createPracticeLogMutation = useCreatePracticeLogMutation(supabase);
  const updatePracticeLogMutation = useUpdatePracticeLogMutation(supabase);
  const deletePracticeLogMutation = useDeletePracticeLogMutation(supabase);
  const createPracticeTimeMutation = useCreatePracticeTimeMutation(supabase);
  const deletePracticeTimeMutation = useDeletePracticeTimeMutation(supabase);

  // 大会記録用のミューテーションフック
  const createRecordMutation = useCreateRecordMutation(supabase);
  const updateRecordMutation = useUpdateRecordMutation(supabase);
  const deleteRecordMutation = useDeleteRecordMutation(supabase);
  const createCompetitionMutation = useCreateCompetitionMutation(supabase);
  const updateCompetitionMutation = useUpdateCompetitionMutation(supabase);
  const deleteCompetitionMutation = useDeleteCompetitionMutation(supabase);
  const createSplitTimesMutation = useCreateSplitTimesMutation(supabase);
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase);

  // ラッパー関数（既存のハンドラーとの互換性のため）
  const createPractice = async (
    practice: Parameters<typeof createPracticeMutation.mutateAsync>[0],
  ) => {
    return await createPracticeMutation.mutateAsync(practice);
  };
  const updatePractice = async (
    id: string,
    updates: Parameters<typeof updatePracticeMutation.mutateAsync>[0]["updates"],
  ) => {
    return await updatePracticeMutation.mutateAsync({ id, updates });
  };
  const createPracticeLog = async (
    log: Parameters<typeof createPracticeLogMutation.mutateAsync>[0],
  ) => {
    return await createPracticeLogMutation.mutateAsync(log);
  };
  const updatePracticeLog = async (
    id: string,
    updates: Parameters<typeof updatePracticeLogMutation.mutateAsync>[0]["updates"],
  ) => {
    return await updatePracticeLogMutation.mutateAsync({ id, updates });
  };
  const createPracticeTime = async (
    time: Parameters<typeof createPracticeTimeMutation.mutateAsync>[0],
  ) => {
    return await createPracticeTimeMutation.mutateAsync(time);
  };
  const deletePracticeTime = async (id: string) => {
    return await deletePracticeTimeMutation.mutateAsync(id);
  };
  const deletePractice = async (id: string) => {
    return await deletePracticeMutation.mutateAsync(id);
  };
  const deletePracticeLog = async (id: string) => {
    return await deletePracticeLogMutation.mutateAsync(id);
  };

  const deleteRecord = async (id: string) => {
    return await deleteRecordMutation.mutateAsync(id);
  };
  const deleteEntry = async (id: string) => {
    const entryAPI = new EntryAPI(supabase);
    await entryAPI.deleteEntry(id);
  };

  const createRecord = async (record: Parameters<typeof createRecordMutation.mutateAsync>[0]) => {
    return await createRecordMutation.mutateAsync(record);
  };
  const updateRecord = async (
    id: string,
    updates: Parameters<typeof updateRecordMutation.mutateAsync>[0]["updates"],
  ) => {
    return await updateRecordMutation.mutateAsync({ id, updates });
  };
  const createCompetition = async (
    competition: Parameters<typeof createCompetitionMutation.mutateAsync>[0],
  ) => {
    return await createCompetitionMutation.mutateAsync(competition);
  };
  const updateCompetition = async (
    id: string,
    updates: Parameters<typeof updateCompetitionMutation.mutateAsync>[0]["updates"],
  ) => {
    return await updateCompetitionMutation.mutateAsync({ id, updates });
  };
  const deleteCompetition = async (id: string) => {
    return await deleteCompetitionMutation.mutateAsync(id);
  };
  const createSplitTimes = async (
    params: Parameters<typeof createSplitTimesMutation.mutateAsync>[0],
  ) => {
    return await createSplitTimesMutation.mutateAsync(params);
  };
  const replaceSplitTimes = async (
    params: Parameters<typeof replaceSplitTimesMutation.mutateAsync>[0],
  ) => {
    return await replaceSplitTimesMutation.mutateAsync(params);
  };

  // ハンドラー関数は useDashboardHandlers カスタムフックから取得
  const {
    handlePracticeLogSubmit,
    handleDeleteItem: originalHandleDeleteItem,
    handleEntrySubmit: originalHandleEntrySubmit,
    handleEntrySkip,
    handleRecordLogSubmit,
    handlePracticeTabSave,
    handleCompetitionTabSave,
  } = useDashboardHandlers({
    supabase,
    user,
    styles,
    createPractice,
    updatePractice,
    createPracticeLog,
    updatePracticeLog,
    deletePracticeLog,
    createPracticeTime,
    deletePracticeTime,
    deletePractice,
    createRecord,
    updateRecord,
    deleteRecord,
    deleteEntry,
    createCompetition,
    updateCompetition,
    deleteCompetition,
    createSplitTimes,
    replaceSplitTimes,
    editingData,
    createdPracticeId,
    competitionEditingData,
    createdCompetitionId,
    setPracticeLoading,
    setCompetitionLoading,
    closePracticeBasicForm,
    closePracticeLogForm,
    closeCompetitionBasicForm,
    closeEntryLogForm,
    closeRecordLogForm,
    openPracticeLogForm,
    setCreatedEntries,
    openEntryLogForm,
    openRecordLogForm,
    refreshCalendar,
    closePracticeTabModal,
    closeCompetitionTabModal,
    setEditingPracticeId,
    setEditingCompetitionId,
  });

  // エントリー完了時に通知を再読み込み
  const handleEntrySubmit = async (
    entriesData: Parameters<typeof originalHandleEntrySubmit>[0],
  ) => {
    await originalHandleEntrySubmit(entriesData);
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  // エントリー削除時に通知を再読み込み
  const handleDeleteItem = async (
    itemId: string,
    itemType?:
      | "practice"
      | "team_practice"
      | "practice_log"
      | "competition"
      | "team_competition"
      | "entry"
      | "record",
  ) => {
    await originalHandleDeleteItem(itemId, itemType);
    if (itemType === "entry") {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    }
  };

  // カレンダーイベントハンドラー
  const {
    onDateClick,
    onAddItem,
    onEditItem,
    onDeleteItem: onDeleteCalendarItem,
    onAddPracticeLog,
    onAddPracticeLogFromTemplate,
    onEditPracticeLog,
    onDeletePracticeLog,
    onAddRecord,
    onEditRecord,
    onDeleteRecord,
  } = useCalendarHandlers({
    supabase,
    openPracticeTabModal,
    openCompetitionTabModal,
    openEntryLogForm,
    openRecordLogForm,
    setSelectedDate,
    setEditingData,
    setCompetitionEditingData,
    handleDeleteItem,
    refreshCalendar,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full">
        {/* チームのお知らせセクション */}
        <TeamAnnouncementsSection teams={teams} openEntryLogForm={openEntryLogForm} />

        {/* カレンダーコンポーネント */}
        <CalendarContainer
          refreshKey={calendarRefreshKey}
          initialCalendarItems={initialCalendarItems}
          initialMonthlySummary={initialMonthlySummary}
          onDateClick={onDateClick}
          onAddItem={onAddItem}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteCalendarItem}
          onAddPracticeLog={onAddPracticeLog}
          onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
          onEditPracticeLog={onEditPracticeLog}
          onDeletePracticeLog={onDeletePracticeLog}
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          onDeleteRecord={onDeleteRecord}
        />

        {/* フォームモーダル */}
        <FormModals
          onPracticeLogSubmit={handlePracticeLogSubmit}
          onEntrySubmit={handleEntrySubmit}
          onEntrySkip={handleEntrySkip}
          onRecordLogSubmit={handleRecordLogSubmit}
          onPracticeTabSave={handlePracticeTabSave}
          onCompetitionTabSave={handleCompetitionTabSave}
          styles={styles}
        />

        {/* 期限切れ目標モーダル（優先） */}
        {expiredGoal && (
          <GoalReflectionModal
            isOpen={!!expiredGoal}
            onClose={() => setExpiredGoal(null)}
            goal={expiredGoal}
            onSave={async () => {
              // 保存後、次の期限切れ目標をチェック
              const goalAPI = new GoalAPI(supabase);
              const expiredGoals = await goalAPI.getExpiredGoals();
              if (expiredGoals && expiredGoals.length > 0) {
                setExpiredGoal(expiredGoals[0]!); // expiredGoals.length > 0 を直上の if で確認済み
              } else {
                setExpiredGoal(null);
                // 目標がなくなったらマイルストーンをチェック
                const expiredMilestones = await goalAPI.getExpiredMilestones();
                if (expiredMilestones && expiredMilestones.length > 0) {
                  setExpiredMilestone(expiredMilestones[0]!); // expiredMilestones.length > 0 を直上の if で確認済み
                }
              }
            }}
          />
        )}

        {/* 期限切れマイルストーン内省モーダル */}
        {!expiredGoal && expiredMilestone && (
          <ReflectionModal
            isOpen={!!expiredMilestone}
            onClose={() => setExpiredMilestone(null)}
            milestone={expiredMilestone}
            onSave={async () => {
              // 保存後、次の期限切れマイルストーンをチェック
              const goalAPI = new GoalAPI(supabase);
              const expired = await goalAPI.getExpiredMilestones();
              if (expired && expired.length > 0) {
                setExpiredMilestone(expired[0]!); // expired.length > 0 を直上の if で確認済み
              } else {
                setExpiredMilestone(null);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
