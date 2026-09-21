/**
 * CompetitionBasicFormScreen — 保存後の戻り先 (Sprint Contract: チーム大会/練習の
 * popToTop 誤爆修正) QA Phase A テスト。
 *
 * 背景: チーム大会を保存すると navigation.popToTop() で MainTabs (チーム一覧) まで
 * 吹き飛ばされ、直前にいた TeamDetail の大会タブへ戻れないバグがあった。
 * 修正: resolveSaveReturnTarget(teamId) の結果に応じて
 *   - teamId あり → navigation.popTo("TeamDetail", { teamId, initialTab: "competitions" })
 *   - teamId なし (個人フロー) → navigation.popToTop() (従来通り)
 * を呼び分ける。
 *
 * 検証観点 (Sprint Contract):
 *   [SC-1] admin 「大会を追加」→保存 → popTo("TeamDetail", { teamId, initialTab: "competitions" })
 *   [SC-2] admin 「編集」(competitionId 付き) →保存 → 同上。新規作成モードとは
 *          saveCompetitionData() 内部の分岐 (updateMutation 経由) が異なるため、
 *          新規作成シナリオを流用せず編集シナリオを独立に検証する
 *   [SC-9 境界値] teamId が undefined/空文字 → popToTop() (popTo は呼ばれない)
 *   [SC-4] 「続けてエントリーを作成」→ CompetitionTabForm (initialTab: "entry") へ teamId 込みで遷移
 *   [SC-5] 「続けて記録を入力」→ CompetitionTabForm (initialTab: "record") へ teamId 込みで遷移
 *          (旧 RecordLogFormScreen は削除済み。既存レコードを検索しないブランクフォーム
 *          だったため CompetitionTabForm に統一された)
 *   [SC-10] 保存で popTo/popToTop のどちらか一方のみが1回だけ呼ばれる (多重 pop 防止)
 *
 * 実装アプローチ: CompetitionBasicFormScreen を実際に render し、実装の
 * resolveSaveReturnTarget (テスト内で再実装しない) を経由した navigation 呼び出しを
 * モックで捕捉する。他画面向けテスト (CompetitionTabFormScreen.test.tsx) と同じ
 * 「実 render + 重い依存をモック」方針を踏襲する。
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";
import { CompetitionBasicFormScreen } from "@/screens/CompetitionBasicFormScreen";

const h = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
  mockNavigate: vi.fn(),
  mockGoBack: vi.fn(),
  mockPopTo: vi.fn(),
  mockPopToTop: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseUserQuery: vi.fn(),
  mockUseCreateCompetitionMutation: vi.fn(),
  mockUseUpdateCompetitionMutation: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: h.mockUseRoute,
  useNavigation: () => ({
    navigate: h.mockNavigate,
    goBack: h.mockGoBack,
    popTo: h.mockPopTo,
    popToTop: h.mockPopToTop,
    setOptions: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: h.mockUseAuth,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCreateCompetitionMutation: h.mockUseCreateCompetitionMutation,
  useUpdateCompetitionMutation: h.mockUseUpdateCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: h.mockUseUserQuery,
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncCompetition: vi.fn() }),
}));

vi.mock("@/components/layout/LoadingSpinner", () => ({
  LoadingSpinner: () => React.createElement("div", { "data-testid": "loading-spinner" }),
}));

vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));

vi.mock("@/utils/imageUpload", () => ({
  uploadImagesViaApi: vi.fn(async () => []),
  deleteImages: vi.fn(async () => {}),
  resolveGalleryImages: vi.fn(async () => []),
  mergeImagePaths: vi.fn((saved: string[]) => saved),
}));

function makeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    },
  } as unknown as SupabaseClient;
}

interface CompetitionRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string | null;
  place: string | null;
  pool_type: number;
  note: string | null;
  image_paths: string[];
}

function makeCompetitionRow(overrides: Partial<CompetitionRow> = {}): CompetitionRow {
  return {
    id: "comp-edit-1",
    date: "2026-06-16",
    end_date: null,
    title: "既存大会",
    place: "既存プール",
    pool_type: 0,
    note: null,
    image_paths: [],
    ...overrides,
  };
}

// 編集モード (competitionId 付き) 用: fetchCompetition の
// supabase.from("competitions").select("*").eq("id", ...).single() を満たす
function makeSupabaseForEdit(row: CompetitionRow): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: row, error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

async function renderScreen(routeParams: {
  date?: string;
  teamId?: string;
  competitionId?: string;
}) {
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(),
    subscription: null,
    getAccessToken: vi.fn(async () => "test-token"),
  });
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseRoute.mockReturnValue({ params: routeParams });

  const Wrapper = createQueryWrapper();
  return render(<CompetitionBasicFormScreen />, { wrapper: Wrapper });
}

// [SC-2] 編集モード専用の render ヘルパー。fetchCompetition (supabase.from("competitions")...)
// を満たした上で、ローディングが解除され保存ボタンが出るまで待つ。
async function renderEditScreen(routeParams: { competitionId: string; teamId?: string }) {
  const row = makeCompetitionRow({ id: routeParams.competitionId });
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabaseForEdit(row),
    subscription: null,
    getAccessToken: vi.fn(async () => "test-token"),
  });
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseRoute.mockReturnValue({ params: routeParams });

  const Wrapper = createQueryWrapper();
  const result = render(<CompetitionBasicFormScreen />, { wrapper: Wrapper });
  // fetchCompetition 完了 (loadingCompetition=false) を待つ。それまでは
  // LoadingSpinner のみが描画され「保存」ボタンは存在しない
  await waitFor(() => expect(result.getByRole("button", { name: "保存" })).toBeTruthy());
  return { ...result, row };
}

describe("CompetitionBasicFormScreen — 保存後の戻り先", () => {
  let createMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync = vi.fn(async (formData: Record<string, unknown>) => ({
      id: "new-comp-1",
      ...formData,
    }));
    h.mockUseCreateCompetitionMutation.mockReturnValue({ mutateAsync: createMutateAsync });
    h.mockUseUpdateCompetitionMutation.mockReturnValue({ mutateAsync: vi.fn() });
  });

  it("[SC-1] teamId あり: 保存後 popTo('TeamDetail', { teamId, initialTab: 'competitions' }) が呼ばれ、popToTop は呼ばれない", async () => {
    const { getByRole } = await renderScreen({ date: "2026-06-16", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).toHaveBeenCalledWith("TeamDetail", {
      teamId: "team-1",
      initialTab: "competitions",
    });
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });

  it("[SC-9 境界値] teamId が undefined (個人フロー): 保存後 popToTop が呼ばれ、popTo は呼ばれない", async () => {
    const { getByRole } = await renderScreen({ date: "2026-06-16" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopToTop).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
  });

  it("[SC-9 境界値] teamId が空文字 '': 保存後 popToTop が呼ばれる (クラッシュしない)", async () => {
    const { getByRole } = await renderScreen({ date: "2026-06-16", teamId: "" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopToTop).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
  });

  it("[SC-10] 保存を1回押したとき popTo/popToTop 合計でちょうど1回しか呼ばれない (多重 pop 防止)", async () => {
    const { getByRole } = await renderScreen({ date: "2026-06-16", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopToTop).toHaveBeenCalledTimes(0);
  });

  it("[SC-4] teamId あり・未来日: 「続けてエントリーを作成」→ CompetitionTabForm へ { competitionId, date, teamId, initialTab: 'entry' } で遷移", async () => {
    const { getByRole } = await renderScreen({ date: "2099-01-01", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "続けてエントリーを作成" }));

    await waitFor(() =>
      expect(h.mockNavigate).toHaveBeenCalledWith("CompetitionTabForm", {
        competitionId: "new-comp-1",
        date: "2099-01-01",
        teamId: "team-1",
        initialTab: "entry",
      }),
    );
    // この経路は統合タブ画面 (CompetitionTabFormScreen) 側の保存で popTo/popToTop を判定するため、
    // CompetitionBasicFormScreen 自身は popTo/popToTop を呼ばない
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });

  it("[SC-5] teamId あり・過去日: 「続けて記録を入力」→ CompetitionTabForm へ { competitionId, date, teamId, initialTab: 'record' } で遷移", async () => {
    const { getByRole } = await renderScreen({ date: "2020-01-01", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "続けて記録を入力" }));

    await waitFor(() =>
      expect(h.mockNavigate).toHaveBeenCalledWith("CompetitionTabForm", {
        competitionId: "new-comp-1",
        date: "2020-01-01",
        teamId: "team-1",
        initialTab: "record",
      }),
    );
  });

  it("[SC-8] 「キャンセル」→ goBack のみが呼ばれ、popTo/popToTop は呼ばれない (teamId ありでも保存扱いにならない)", async () => {
    const { getByRole } = await renderScreen({ date: "2026-06-16", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "キャンセル" }));

    expect(h.mockGoBack).toHaveBeenCalledTimes(1);
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("[回帰] teamId なし・未来日: 「続けてエントリーを作成」ではなく個人フロー CompetitionTabForm(initialTab:'entry') へ遷移する (非退行)", async () => {
    const { getByRole } = await renderScreen({ date: "2099-01-01" });

    fireEvent.click(getByRole("button", { name: "続けてエントリーを作成" }));

    await waitFor(() =>
      expect(h.mockNavigate).toHaveBeenCalledWith(
        "CompetitionTabForm",
        expect.objectContaining({ competitionId: "new-comp-1", date: "2099-01-01", initialTab: "entry" }),
      ),
    );
    expect(h.mockNavigate).not.toHaveBeenCalledWith("EntryForm", expect.anything());
  });
});

// ---------------------------------------------------------------------------
// [SC-2] 編集モード (competitionId 付き) — 新規作成とは saveCompetitionData() 内部の
// 分岐 (updateMutation.mutateAsync 経由、createMutation は呼ばれない) が異なるため、
// 新規作成シナリオ (上の describe) を流用せず独立に検証する。
// ---------------------------------------------------------------------------
describe("CompetitionBasicFormScreen — 保存後の戻り先 (編集モード)", () => {
  let updateMutateAsync: ReturnType<typeof vi.fn>;
  let createMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    updateMutateAsync = vi.fn(async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => ({
      id,
      ...updates,
    }));
    createMutateAsync = vi.fn();
    h.mockUseUpdateCompetitionMutation.mockReturnValue({ mutateAsync: updateMutateAsync });
    h.mockUseCreateCompetitionMutation.mockReturnValue({ mutateAsync: createMutateAsync });
  });

  it("[SC-2] teamId あり・編集モード: 保存後 popTo('TeamDetail', { teamId, initialTab: 'competitions' }) が呼ばれ、popToTop は呼ばれない", async () => {
    const { getByRole } = await renderEditScreen({ competitionId: "comp-edit-1", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).toHaveBeenCalledWith("TeamDetail", {
      teamId: "team-1",
      initialTab: "competitions",
    });
    expect(h.mockPopToTop).not.toHaveBeenCalled();
    // 編集モードであること (updateMutation 経由、createMutation は呼ばれない) の確認
    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comp-edit-1" }),
    );
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("[SC-2 境界値] teamId なし・編集モード (個人大会): 保存後 popToTop が呼ばれ、popTo は呼ばれない", async () => {
    const { getByRole } = await renderEditScreen({ competitionId: "comp-edit-2" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopToTop).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comp-edit-2" }),
    );
  });

  it("[SC-2 / SC-10] 編集モードの保存を1回押したとき popTo/popToTop 合計でちょうど1回しか呼ばれない (多重 pop 防止)", async () => {
    const { getByRole } = await renderEditScreen({ competitionId: "comp-edit-3", teamId: "team-1" });

    fireEvent.click(getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopToTop).toHaveBeenCalledTimes(0);
  });
});
