// =============================================================================
// useDayDetailHandlers.test.tsx
// =============================================================================
//
// dashboard / 練習履歴 / 大会記録履歴の3画面で DayDetailModal の編集/削除/追加ハンドラを
// 共有するフック。Sprint Contract 検証観点:
//
//   [V-M-P02 / V-M-C03] 削除確認は Alert.alert に統一され、Platform 分岐 (iOS/Android別
//                        ダイアログ) がない (削除確認そのものは常に Alert.alert 経由)
//   [V-M-C02] 記録編集は team_id の有無に関わらず常に CompetitionTabForm(initialTab:"record")
//             へ遷移する (team_id 分岐なし)
//   [V-M-P05] 練習ログの個別削除はモバイルではカスケード削除しない (削除 + refetch のみ)
//   [V-M-P07 / V-M-C05] 削除/変更後に呼び出し元の refetch が呼ばれる
//   [到達不能ルート] 旧 PracticeDetail/RecordDetail 画面へは一切 navigate しない
//
//   [V-M-C09] 大会削除確認 (handleDeleteCompetition) は必ず (competitionId, isTeamCompetition)
//             の2引数を要求するシグネチャに変更されている (旧1引数呼び出しは型エラーになる)。
//   [V-M-C10] 個人大会 (isTeamCompetition=false) 削除時は countRecordsByCompetition を呼び、
//             件数>0なら確認メッセージに件数警告 (competitionRecordsWarning, {count}) が追記される。
//   [V-M-C11] チーム大会 (isTeamCompetition=true) 削除時は countRecordsByCompetition を
//             一切呼ばない (誤情報警告の防止・無駄なリクエスト防止)。
//   [V-M-C12] 個人大会で件数=0のときは追加警告文を含めない (汎用文言のみ)。
//   [V-M-C13] 件数取得が失敗しても削除自体はブロックされない (非致命・汎用文言にフォールバック)。
//
// トートロジー防止メモ: Alert.alert はスパイのみで実際のダイアログを描画しないため、
// 「確認ボタン (destructive) の onPress を呼んだときの副作用」を検証する。
// t のモックは params を無視せず `key:{"count":n}` 形式の文字列に展開することで、
// 「キーが呼ばれたか」だけでなく「正しい件数が渡ったか」まで検証可能にする。

import { Alert } from "react-native";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  deletePracticeMutateAsync: vi.fn(),
  deleteRecordMutateAsync: vi.fn(),
  deleteCompetitionMutateAsync: vi.fn(),
  deletePracticeLog: vi.fn(),
  countRecordsByCompetition: vi.fn(),
  syncPractice: vi.fn(),
  syncCompetition: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({
    profile: {
      ios_calendar_enabled: false,
      ios_calendar_sync_practices: false,
      ios_calendar_sync_competitions: false,
    },
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [] }),
  useDeletePracticeMutation: () => ({ mutateAsync: mocks.deletePracticeMutateAsync }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useDeleteRecordMutation: () => ({ mutateAsync: mocks.deleteRecordMutateAsync }),
  useDeleteCompetitionMutation: () => ({ mutateAsync: mocks.deleteCompetitionMutateAsync }),
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    deletePracticeLog = mocks.deletePracticeLog;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    countRecordsByCompetition = mocks.countRecordsByCompetition;
  },
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({
    syncPractice: mocks.syncPractice,
    syncCompetition: mocks.syncCompetition,
  }),
}));

import { useDayDetailHandlers } from "../useDayDetailHandlers";
import type { CalendarItem } from "@apps/shared/types/ui";

// buttons[] から destructive (実行) ボタンの onPress を取り出すヘルパー
function getConfirmOnPress(alertMock: typeof Alert.alert) {
  const calls = (alertMock as ReturnType<typeof vi.fn>).mock.calls;
  const lastCall = calls[calls.length - 1];
  const buttons = lastCall?.[2] as Array<{ text: string; style?: string; onPress?: () => void }>;
  const destructive = buttons.find((b) => b.style === "destructive");
  if (!destructive?.onPress) throw new Error("destructive button not found");
  return destructive.onPress;
}

describe("useDayDetailHandlers", () => {
  const refetch = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countRecordsByCompetition.mockResolvedValue(0);
  });

  it("[V-M-P02] 練習削除は Alert.alert で確認され、確認後に deleteMutation と refetch が呼ばれる", async () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeletePractice("practice-1");
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const onConfirm = getConfirmOnPress(Alert.alert);

    await act(async () => {
      await onConfirm();
    });

    expect(mocks.deletePracticeMutateAsync).toHaveBeenCalledWith("practice-1");
    expect(refetch).toHaveBeenCalled();
  });

  it("[V-M-P05] 練習ログ削除はカスケードせず、ログ自体の削除+refetchのみ行う", async () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeletePracticeLog("log-1");
    });
    const onConfirm = getConfirmOnPress(Alert.alert);

    await act(async () => {
      await onConfirm();
    });

    expect(mocks.deletePracticeLog).toHaveBeenCalledWith("log-1");
    // 親 practice の削除 (カスケード) は一切呼ばれない
    expect(mocks.deletePracticeMutateAsync).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  it("[V-M-C03] 記録削除も Alert.alert で確認され、確認後に deleteRecordMutation が呼ばれる", async () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteRecord("record-1");
    });
    const onConfirm = getConfirmOnPress(Alert.alert);

    await act(async () => {
      await onConfirm();
    });

    expect(mocks.deleteRecordMutateAsync).toHaveBeenCalledWith("record-1");
  });

  it("[V-M-C03/V-M-C09] 大会削除も Alert.alert で確認され、確認後に deleteCompetitionMutation が呼ばれる (2引数シグネチャ)", async () => {
    mocks.countRecordsByCompetition.mockResolvedValue(0);
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteCompetition("comp-1", false);
    });
    const onConfirm = getConfirmOnPress(Alert.alert);

    await act(async () => {
      await onConfirm();
    });

    expect(mocks.deleteCompetitionMutateAsync).toHaveBeenCalledWith("comp-1");
  });

  it("[V-M-C10] 個人大会 (isTeamCompetition=false) の削除は countRecordsByCompetition を呼び、件数>0なら確認文言に件数警告が追記される", async () => {
    mocks.countRecordsByCompetition.mockResolvedValue(7);
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteCompetition("comp-personal-1", false);
    });

    expect(mocks.countRecordsByCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.countRecordsByCompetition).toHaveBeenCalledWith("comp-personal-1");

    const alertCall = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = alertCall![1] as string; // handleDeleteCompetition が必ず Alert.alert を呼ぶ設計のため必ず存在
    // t() モックは params を握り潰さず `key:{"count":n}` に展開するため、
    // 「キーが呼ばれた」だけでなく「7件という正しい値が渡った」ことまで検証できる。
    expect(message).toContain('dashboard.deleteConfirm.competitionRecordsWarning:{"count":7}');
  });

  it("[V-M-C11] チーム大会 (isTeamCompetition=true) の削除は countRecordsByCompetition を一切呼ばない", async () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteCompetition("comp-team-1", true);
    });

    expect(mocks.countRecordsByCompetition).not.toHaveBeenCalled();

    const alertCall = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = alertCall![1] as string; // handleDeleteCompetition が必ず Alert.alert を呼ぶ設計のため必ず存在
    expect(message).not.toContain("competitionRecordsWarning");
  });

  it("[V-M-C12] 個人大会で件数=0のときは追加警告文を含めない (汎用文言のみ)", async () => {
    mocks.countRecordsByCompetition.mockResolvedValue(0);
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteCompetition("comp-personal-empty", false);
    });

    expect(mocks.countRecordsByCompetition).toHaveBeenCalledWith("comp-personal-empty");
    const alertCall = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = alertCall![1] as string; // handleDeleteCompetition が必ず Alert.alert を呼ぶ設計のため必ず存在
    expect(message).not.toContain("competitionRecordsWarning");
  });

  it("[V-M-C13] 件数取得が失敗しても削除確認自体はブロックされず、確認後に削除が実行される (非致命フォールバック)", async () => {
    mocks.countRecordsByCompetition.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteCompetition("comp-personal-err", false);
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const onConfirm = getConfirmOnPress(Alert.alert);

    await act(async () => {
      await onConfirm();
    });

    expect(mocks.deleteCompetitionMutateAsync).toHaveBeenCalledWith("comp-personal-err");
  });

  it("[V-M-C02] 記録編集は team_id を含むメタデータでも含まないメタデータでも常に CompetitionTabForm(record) へ遷移する", () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    const teamItem = {
      id: "record-1",
      type: "record",
      date: "2026-07-10",
      metadata: { competition: { id: "comp-team" }, record: { competition_id: "comp-team" } },
    } as unknown as CalendarItem;

    result.current.handleEditRecord(teamItem);

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-team",
      date: "2026-07-10",
      initialTab: "record",
    });

    mocks.navigate.mockClear();

    const personalItem = {
      id: "record-2",
      type: "record",
      date: "2026-07-11",
      metadata: { record: { competition_id: "comp-personal" } },
    } as unknown as CalendarItem;

    result.current.handleEditRecord(personalItem);

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-personal",
      date: "2026-07-11",
      initialTab: "record",
    });
  });

  it("旧 PracticeDetail / RecordDetail への navigate は一切発生しない (到達不能ルートの削除)", () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    const practiceItem = {
      id: "practice-1",
      type: "practice",
      date: "2026-07-10",
      metadata: { practice_id: "practice-1" },
    } as unknown as CalendarItem;
    const recordItem = {
      id: "record-1",
      type: "record",
      date: "2026-07-10",
      metadata: {},
    } as unknown as CalendarItem;

    result.current.handleEntryPress(practiceItem);
    result.current.handleEntryPress(recordItem);

    expect(mocks.navigate).not.toHaveBeenCalledWith("PracticeDetail", expect.anything());
    expect(mocks.navigate).not.toHaveBeenCalledWith("RecordDetail", expect.anything());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("エントリー削除ハンドラは (呼び出し元で削除済みのため) refetch のみ実行する", async () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    await act(async () => {
      await result.current.handleDeleteEntry("entry-1");
    });

    expect(refetch).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("エントリー追加は CompetitionTabForm(entry) へ遷移する", () => {
    const { result } = renderHook(() => useDayDetailHandlers(supabase, refetch));

    result.current.handleAddEntry("comp-1", "2026-07-10");

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-1",
      date: "2026-07-10",
      initialTab: "entry",
    });
  });
});
