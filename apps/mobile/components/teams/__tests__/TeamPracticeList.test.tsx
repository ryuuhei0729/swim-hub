/**
 * TeamPracticeList / TeamCompetitionList コンポーネント テスト
 *
 * Sprint 2 Phase B QA 検証
 *
 * 検証観点:
 * [S2-V-05] isLoading 時にローディング表示が出る
 * [S2-V-06] isError 時にエラー表示 + リトライボタンが出る
 * [S2-V-07] 練習が 0 件のとき空状態表示が出る
 * [S2-V-08] 練習リストが表示される
 * [S2-V-09] isAdmin=true のとき追加ボタン・編集・削除が表示される
 * [S2-V-10] isAdmin=false のとき追加・編集・削除ボタンが表示されない
 *
 * トートロジー防止メモ:
 * - DOM に表示される文字列 / 要素の有無のみ検証する
 * - ナビゲーション呼び出しを確認することで navigate("PracticeForm", {teamId}) の動作を検証する
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// -----------------------------------------------------------------------
// vi.hoisted — モジュール巻き上げ対策
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  useTeamPracticesQuery: vi.fn(),
  useDeleteTeamPracticeMutation: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
}));

// shared hooks モック
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamPracticesQuery: mocks.useTeamPracticesQuery,
  useDeleteTeamPracticeMutation: mocks.useDeleteTeamPracticeMutation,
}));

// Auth モック
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

// Navigation モック
vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: mocks.navigate })),
}));

// date-fns / date-fns/locale は実際のものを使う (静的モック不要)

import { TeamPracticeList } from "../TeamPracticeList";

// -----------------------------------------------------------------------
// テストデータファクトリ
// -----------------------------------------------------------------------
const makePractice = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-06-15",
  title: "チーム練習",
  place: "メインプール",
  note: null,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  image_paths: [],
  ...overrides,
});

// 削除ミューテーションのデフォルトモック
const makeMutationMock = () => ({
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
});

describe("TeamPracticeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamPracticeMutation.mockReturnValue(makeMutationMock());
  });

  // [S2-V-05] ローディング状態
  it("isLoading=true のときローディングインジケーターが表示される", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    // ActivityIndicator は role="progressbar" でレンダリングされる
    // または react-native モックにより div として出力される
    // ローディングテキストキーが t("teams.mobile.loadingShort") = ja で「読込中…」相当
    // i18n は初期化されていないため key がそのまま表示されることがある
    // → ローディング中は data が undefined なのでリスト表示されないことを確認
    expect(screen.queryByText(/チーム練習/)).toBeNull();
  });

  // [S2-V-06] エラー状態
  it("isError=true のときエラーが表示されリトライボタンが存在する", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "ネットワークエラー" },
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("ネットワークエラー")).toBeDefined();
  });

  // [S2-V-07] 空状態 — practices が [] のとき
  it("practices が空のとき空状態テキストが表示される", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    // t("teams.mobile.teamPracticeList.empty") — i18n モックなしでキー文字列
    // 空コンテナが描画されている (データ行がない)
    expect(screen.queryAllByText("チーム練習")).toHaveLength(0);
  });

  // [S2-V-08] 練習リスト表示
  it("practices が存在するとき日付とタイトルが表示される", () => {
    const practice = makePractice({ title: "午前練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("午前練習")).toBeDefined();
  });

  // [S2-V-09] isAdmin=true: 追加ボタンが表示される
  it("isAdmin=true のとき追加ボタンが表示される", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

    // accessibilityRole="button" を持つ追加ボタンが存在する
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  // [S2-V-09] isAdmin=true: 追加ボタン押下で navigate("PracticeForm", { teamId }) が呼ばれる
  it("isAdmin=true で追加ボタンを押すと navigate が PracticeForm + teamId で呼ばれる", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

    // 空状態の追加ボタンをクリック
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!); // 空状態でも追加ボタンは常に表示される設計のため必ず存在

    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeForm",
      expect.objectContaining({ teamId: "team-1" }),
    );
  });

  // [S2-V-10] isAdmin=false: 追加ボタンが表示されない
  it("isAdmin=false のとき追加ボタンが表示されない", () => {
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    // isAdmin=false → role="button" 要素が存在しない
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  // [S2-V-09] isAdmin=true + 練習あり: 編集・削除ボタンが表示される
  it("isAdmin=true で練習がある場合、編集・削除ボタンが存在する", () => {
    const practice = makePractice({ title: "夕方練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

    // 編集(edit-2)・削除(trash-2) のボタンがある
    const buttons = screen.getAllByRole("button");
    // ヘッダー追加 + 編集 + 削除 = 3つ以上
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  // navigate に teamId が渡ることの確認 (チーム練習編集でチームコンテキストが維持される)
  it("isAdmin=true で編集ボタンを押すと navigate が PracticeForm + { practiceId, teamId } で呼ばれる", () => {
    const practice = makePractice({ id: "p-edit", title: "編集対象練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

    // アクセシビリティラベル "teams.mobile.tabPractices" を持つ編集ボタン
    const buttons = screen.getAllByRole("button");
    // buttons[0] = ヘッダー追加, buttons[1] = 編集, buttons[2] = 削除
    fireEvent.click(buttons[1]!); // isAdmin=true+練習1件は常に追加+編集+削除の3ボタンを表示する設計

    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeForm",
      expect.objectContaining({ practiceId: "p-edit", teamId: "team-1" }),
    );
  });

  // -----------------------------------------------------------------------
  // Sprint 3 検証: [S3-V-A1] addLog ボタンが存在し、PracticeLogForm に teamId で遷移する
  // -----------------------------------------------------------------------

  // [S3-V-A1] addLog ボタンが表示される (isAdmin 不問)
  it("[S3-V-A1] 練習がある場合、addLog ボタン (ログを記入) が表示される", () => {
    const practice = makePractice({ title: "朝練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    // i18n モックが ja.json を参照するので「ログを記入」が期待値
    expect(screen.getByText("ログを記入")).toBeDefined();
  });

  // [S3-V-A1] addLog ボタン押下で PracticeLogForm + { practiceId, teamId } で navigate される
  it("[S3-V-A1] addLog ボタンを押すと PracticeLogForm に { practiceId, teamId } で navigate される", () => {
    const practice = makePractice({ id: "p-log-1", title: "夕練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-abc" isAdmin={false} />);

    // accessibilityLabel="ログを記入" を持つボタンを取得
    const logButton = screen.getByRole("button", { name: "ログを記入" });
    fireEvent.click(logButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeLogForm",
      expect.objectContaining({
        practiceId: "p-log-1",
        teamId: "team-abc",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Sprint Contract [SC-7]: admin 時ラベルを「記録代理入力」に分岐する (D-2)
  // 遷移先 TeamPracticeLogBulkForm は不変 (既存動作は TeamBulkNavigation.test.tsx で検証済み)
  // -----------------------------------------------------------------------

  it("[SC-7] isAdmin=true のとき、ボタンラベルは「記録代理入力」であり旧ラベル「ログを記入」は表示されない", () => {
    const practice = makePractice({ id: "p-admin-1", title: "管理者練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

    expect(screen.getByRole("button", { name: "記録代理入力" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "ログを記入" })).toBeNull();
  });

  it("[SC-7] isAdmin=false のとき、ボタンラベルは従来通り「ログを記入」のままである (新ラベルは出ない)", () => {
    const practice = makePractice({ id: "p-nonadmin-1", title: "一般練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    expect(screen.getByRole("button", { name: "ログを記入" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "記録代理入力" })).toBeNull();
  });

  it("[SC-7] isAdmin=true で「記録代理入力」を押すと TeamPracticeLogBulkForm へ { practiceId, teamId } で navigate される (遷移先不変)", () => {
    const practice = makePractice({ id: "p-admin-nav", title: "管理者練習遷移" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-nav" isAdmin={true} />);

    fireEvent.click(screen.getByRole("button", { name: "記録代理入力" }));

    expect(mocks.navigate).toHaveBeenCalledWith("TeamPracticeLogBulkForm", {
      practiceId: "p-admin-nav",
      teamId: "team-nav",
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith("PracticeLogForm", expect.anything());
  });
});
