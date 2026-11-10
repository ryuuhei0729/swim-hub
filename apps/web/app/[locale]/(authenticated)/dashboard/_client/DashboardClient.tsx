"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts";
import CalendarContainer, { type OpenDayRequest } from "../_components/CalendarContainer";
import DashboardNoticesSection from "../_components/DashboardNoticesSection";
import NextCompetitionCard from "../_components/NextCompetitionCard";
import DashboardBestTimesCard from "../_components/DashboardBestTimesCard";
import GoalCreateModal from "@/app/[locale]/(authenticated)/goals/_components/GoalCreateModal";
import ReflectionModal from "@/app/[locale]/(authenticated)/goals/_components/ReflectionModal";
import GoalReflectionModal from "@/app/[locale]/(authenticated)/goals/_components/GoalReflectionModal";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import { runMilestoneJudgment } from "@/utils/milestoneJudgment";
import type { Milestone, GoalWithMilestones } from "@apps/shared/types";
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useDeletePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  useDeletePracticeLogMutation,
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
import { dashboardKeys, notificationKeys } from "@apps/shared/hooks/queries/keys";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useUIStore } from "@/stores/ui/uiStore";
import { FormModals } from "./FormModals";
import { useDashboardHandlers } from "../_hooks/useDashboardHandlers";
import { useCalendarHandlers } from "../_hooks/useCalendarHandlers";
import { useDashboardRefreshOnSave } from "../_hooks/useDashboardRefreshOnSave";

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
  // 次の大会の「目標を設定」から開く目標作成。null は閉じている
  const [goalCreateTarget, setGoalCreateTarget] = useState<{
    competitionId?: string;
    styleId: number;
  } | null>(null);
  // 次の大会のカードから、その日の詳細をカレンダーに開かせる (seq を進めると同じ日でも開き直す)
  const [openDayRequest, setOpenDayRequest] = useState<OpenDayRequest | null>(null);

  // Zustandストア
  const { calendarRefreshKey, refreshCalendar } = useUIStore();

  // 保存でカレンダーが取り直されたら、ダッシュボードの各ブロックとベストタイムも取り直す
  useDashboardRefreshOnSave(calendarRefreshKey, user?.id);

  const {
    editingData,
    openTabModal: openPracticeTabModal,
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
    const userId = user.id;

    const checkExpired = async () => {
      try {
        const goalAPI = new GoalAPI(supabase);

        // 代理入力 (チーム管理者による練習・大会記録の代理保存) は保存時点では
        // 判定しない (遅延評価)。本人がこの画面を開いたこのセッションで判定を
        // 1回走らせてから期限切れをチェックすることで、代理保存分も反映され、
        // 既に達成済みのマイルストーンに「未達成」の振り返りが出ないようにする。
        await runMilestoneJudgment(goalAPI, userId);
        // 判定で置かれた達成候補を、確認ダイアログ (MilestoneAchievementPrompter) が取り直す
        void queryClient.invalidateQueries({ queryKey: goalKeys.all });

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
  }, [user, supabase, queryClient]);

  // カレンダーイベントハンドラーは useCalendarHandlers カスタムフックから取得

  // 練習記録用のミューテーションフック
  const createPracticeMutation = useCreatePracticeMutation(supabase);
  const updatePracticeMutation = useUpdatePracticeMutation(supabase);
  const deletePracticeMutation = useDeletePracticeMutation(supabase);
  const createPracticeLogMutation = useCreatePracticeLogMutation(supabase);
  const updatePracticeLogMutation = useUpdatePracticeLogMutation(supabase);
  const deletePracticeLogMutation = useDeletePracticeLogMutation(supabase);

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
  // usePracticeTabSave (タブモーダル一括保存) が skipMilestoneUpdate を呼び出し元から渡せるよう、
  // mutation の variables にそのまま転送する。
  const createPracticeLog = async (
    log: Parameters<typeof createPracticeLogMutation.mutateAsync>[0],
    skipMilestoneUpdate?: boolean,
  ) => {
    return await createPracticeLogMutation.mutateAsync({ ...log, skipMilestoneUpdate });
  };
  const updatePracticeLog = async (
    id: string,
    updates: Parameters<typeof updatePracticeLogMutation.mutateAsync>[0]["updates"],
    skipMilestoneUpdate?: boolean,
  ) => {
    return await updatePracticeLogMutation.mutateAsync({ id, updates, skipMilestoneUpdate });
  };
  // useDashboardHandlers 側の props 名に合わせた別名 (タブモーダル一括保存用)
  const createPracticeLogForTabSave = createPracticeLog;
  const updatePracticeLogForTabSave = updatePracticeLog;
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
    deletePracticeLog,
    createPracticeLogForTabSave,
    updatePracticeLogForTabSave,
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
    competitionEditingData,
    createdCompetitionId,
    setPracticeLoading,
    setCompetitionLoading,
    closeCompetitionBasicForm,
    closeEntryLogForm,
    closeRecordLogForm,
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
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
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
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
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
      {/* スマホ・タブレット幅 (lg 未満) はカード同士を 6px に詰める (2026-11-09 ユーザー指定)。
          スマホ幅 (sm 未満) はヘッダーとの間も詰める: ヘッダーの下端 57px に対し、共通レイアウトの
          pt-16 + py-4 で 80px から始まるので、-mt-5 で 60px (すき間 3px) にする。
          sm 以上はヘッダーが 81px あり、元のすき間も 7px しかないので変えない (詰めると重なる)。
          共通レイアウトは他のページも使うので、ここだけで詰める。PC (lg 以上) は変えない */}
      <div className="w-full -mt-5 space-y-1.5 sm:mt-0 lg:space-y-4">
        {/* お知らせ (チームごとのやること・お知らせと、記録の未入力) */}
        <DashboardNoticesSection
          teams={teams}
          openEntryLogForm={openEntryLogForm}
          onAddRecord={(competitionId) => void onAddRecord({ competitionId })}
        />

        {/* 次の大会とベストタイム表は xl 以上で横並び (2026-11-09 ユーザー指定)。
            ベストタイム表の方が横幅が要るので 2:3 で分ける。表の文字サイズはカードの幅で切り替わる
            (BestTimesTable の @container)。xl 未満は縦に積む */}
        <div className="grid grid-cols-1 gap-1.5 lg:gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
          <NextCompetitionCard
            hasTeams={teams.length > 0}
            openEntryLogForm={openEntryLogForm}
            onAddCompetition={() => onAddItem(new Date(), "record")}
            onSetGoal={setGoalCreateTarget}
            onOpenDay={(date) => setOpenDayRequest((prev) => ({ date, seq: (prev?.seq ?? 0) + 1 }))}
          />
          <DashboardBestTimesCard />
        </div>

        {/* カレンダー (チームのお知らせは上の「お知らせ」にまとめたので全幅) */}
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
          openDayRequest={openDayRequest}
        />

        {/* 次の大会の「目標を設定」から開く */}
        <GoalCreateModal
          isOpen={goalCreateTarget !== null}
          onClose={() => setGoalCreateTarget(null)}
          initialCompetitionId={goalCreateTarget?.competitionId}
          initialStyleId={goalCreateTarget?.styleId}
          onSuccess={async () => {
            setGoalCreateTarget(null);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
              queryClient.invalidateQueries({ queryKey: goalKeys.all }),
            ]);
          }}
          styles={styles}
        />

        {/* フォームモーダル */}
        <FormModals
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
