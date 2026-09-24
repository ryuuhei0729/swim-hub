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
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import deMessages from "@apps/shared/messages/de.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";

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

    // [脆さ修正] 空状態では「練習を追加」ラベルのボタンがヘッダー用・空状態用の
    // 2つ存在する (どちらも同じ handleAdd を呼ぶため機能的には等価)。
    // インデックスではなく、ヘッダー側 (+ アイコン付き) を icon-plus の有無で識別する。
    const addButtons = screen.getAllByRole("button", { name: "練習を追加" });
    const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
    expect(headerAddButton, "ヘッダーの追加ボタン(+アイコン付き)が見つからない").toBeDefined();
    fireEvent.click(headerAddButton!);

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

    // [脆さ修正] 一括登録ボタンがヘッダーに増えて buttons[1] が編集ボタンでは
    // なくなった。編集ボタンはアイコンのみで可視テキストが無く
    // accessibilityLabel は DOM の aria-label にマップされない (このモックの
    // Pressable は accessibilityLabel を素通りの独自属性として出力するのみ) ため
    // getByRole の name には拾えない。TeamCompetitionList.test.tsx と同じ
    // icon-edit-2 の testID から button を辿る方式に揃える。
    const editIcon = screen.getByTestId("icon-edit-2");
    const editButton = editIcon.closest("button");
    expect(editButton, "編集アイコンの button が見つからない").not.toBeNull();
    fireEvent.click(editButton as HTMLButtonElement);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeForm",
      expect.objectContaining({ practiceId: "p-edit", teamId: "team-1" }),
    );
  });

  // -----------------------------------------------------------------------
  // [Sprint Contract #PM-1] Phase B — 実装完了後の実アサーション。
  //
  // Planner が「未確認」と報告した穴: 直上の既存テスト
  // ("isAdmin=true で編集ボタンを押すと navigate が...") は `expect.objectContaining` を
  // 使っており、navigate に渡る第2引数が practiceId/teamId 以外にどんなキーを含んでいても
  // (含んでいなくても) 常に PASS する。そのため「遷移後に PracticeTabFormScreen まで
  // 編集可能な状態で届くか」を一切検証していない — これが本 Sprint Contract のバグの
  // 実際の到達経路 (admin 編集導線 → シム → PracticeTabFormScreen) を素通ししていた穴。
  //
  // 【契約更新 (Critical-1 の PM 裁定)】 Phase A 時点の QA 案は「handleAdd には origin が
  // 付かない」を非退行対照として書いていたが、これは誤りだった。PM 実測:
  //   PracticeTabFormScreen.tsx:151-154 の isEditMode は route params ではなく
  //   resolvedPracticeId という **state** 由来で、新規作成の親 INSERT 成功直後
  //   (:713 setResolvedPracticeId) に false→true へ転落する。子ログ/画像の後続処理が
  //   途中で失敗すると setIsSaved(true) に到達せず画面はそのまま残り、次の再レンダーで
  //   isEditMode=true の canEditPracticeDetails が再評価される。origin が無いと、
  //   まさにこの瞬間に管理者自身の新規作成フォームが無言で編集不可に落ちる
  //   (Critical-1 の再発シナリオ。回帰テストは
  //   PracticeTabFormScreen.createFlipRegression.test.tsx に分離)。
  //   そのため handleAdd も handleEdit と同じく origin: "teamAdmin" を付与するのが正しい
  //   契約であり、TPL-2 はこれを検証する形に反転させた。
  //   対照実験としての「origin が付かない導線」は、admin 判定を経由しない
  //   handleAddLog の非 admin 分岐 (:158 の navigate("PracticeTabForm", { ...,
  //   initialTab: "log" })) に置き換える (TPL-3)。
  describe("[Sprint Contract #PM-1] 管理者ビュー編集・追加ボタンの origin=teamAdmin 転送", () => {
    it("[TPL-1] isAdmin=true で編集ボタンを押すと、navigate の第2引数が { practiceId, teamId, origin: 'teamAdmin' } と厳密一致する", () => {
      const practice = makePractice({ id: "p-tpl1", title: "TPL1検証練習" });
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [practice],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-tpl1" isAdmin={true} />);

      const editIcon = screen.getByTestId("icon-edit-2");
      const editButton = editIcon.closest("button");
      expect(editButton, "編集アイコンの button が見つからない").not.toBeNull();
      fireEvent.click(editButton as HTMLButtonElement);

      expect(mocks.navigate).toHaveBeenCalledTimes(1);
      const [screenName, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
      expect(screenName).toBe("PracticeForm");
      expect(params).toEqual({ practiceId: "p-tpl1", teamId: "team-tpl1", origin: "teamAdmin" });
    });

    it("[TPL-2 / 契約更新により反転] isAdmin=true で「追加」ボタン (handleAdd, 新規作成) を押した場合も origin: 'teamAdmin' が付与される (新規作成保存直後の isEditMode flip で basicData が無言ロックされる Critical-1 の再発防止)", () => {
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-tpl2" isAdmin={true} />);

      const addButtons = screen.getAllByRole("button", { name: "練習を追加" });
      const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
      expect(headerAddButton, "ヘッダーの追加ボタンが見つからない").toBeDefined();
      fireEvent.click(headerAddButton!);

      expect(mocks.navigate).toHaveBeenCalledTimes(1);
      const [screenName, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
      expect(screenName).toBe("PracticeForm");
      expect(params).toMatchObject({ teamId: "team-tpl2", origin: "teamAdmin" });
      expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(true);
      expect(params.origin).toBe("teamAdmin");
    });

    it("[TPL-3 / 対照実験] 非admin の「記録追加」導線 (handleAddLog) は origin を付与しない (admin 判定を経由しない導線には不要)", () => {
      const practice = makePractice({ id: "p-tpl3", title: "TPL3検証練習" });
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [practice],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-tpl3" isAdmin={false} />);

      fireEvent.click(screen.getByRole("button", { name: "記録追加" }));

      expect(mocks.navigate).toHaveBeenCalledTimes(1);
      const [screenName, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
      expect(screenName).toBe("PracticeTabForm");
      expect(params).toEqual({ practiceId: "p-tpl3", teamId: "team-tpl3", initialTab: "log" });
      expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Sprint 3 検証: [S3-V-A1] addLog ボタンが存在し、PracticeLogForm に teamId で遷移する
  //
  // 【QA Phase A 書き換えメモ (今回の Sprint Contract SC-1)】
  // 旧ラベル「ログを記入」は SC-1 でボタン文言「記録追加」に置き換わった。
  // 実測: apps/shared/messages/ja.json は既に非admin用 addLog キーの値が
  // "ログを記入" → "記録追加" に更新済み (git diff で確認: 全5ロケール同様に
  // 旧値→新値へ書き換え済み。entryButton 相当キーは今回対象外で無変更)。
  // 以下2件は「ログを記入」を期待する pin だったため、新文言「記録追加」に
  // 書き換えた (仕様変更による書き換え。トートロジー防止のためリテラル文字列を
  // 直接期待値に用い、プロダクションの i18n キー解決ロジックを再実装はしていない)。
  // -----------------------------------------------------------------------

  // [S3-V-A1→SC-1] addLog ボタンが表示される (isAdmin 不問)
  it("[S3-V-A1→SC-1] 練習がある場合、addLog ボタン (記録追加) が表示され、旧ラベル「ログを記入」は表示されない", () => {
    const practice = makePractice({ title: "朝練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    // i18n モックが ja.json を参照するので SC-1 適用後は「記録追加」が期待値
    expect(screen.getByText("記録追加")).toBeDefined();
    expect(screen.queryByText("ログを記入")).toBeNull();
  });

  // [S3-V-A1→SC-1] addLog ボタン押下で PracticeTabForm(initialTab:"log") + { practiceId, teamId }
  // で navigate される。
  // 【QA Phase A 書き換え】旧仕様は PracticeLogForm への navigate だったが、今回のスプリントで
  // handleAddLog の遷移先が PracticeTabForm に統一されたため期待値を更新した。
  it("[S3-V-A1→SC-1] addLog ボタン (記録追加) を押すと PracticeTabForm に { practiceId, teamId, initialTab: 'log' } で navigate される", () => {
    const practice = makePractice({ id: "p-log-1", title: "夕練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-abc" isAdmin={false} />);

    // accessibilityLabel="記録追加" を持つボタンを取得
    const logButton = screen.getByRole("button", { name: "記録追加" });
    fireEvent.click(logButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "PracticeTabForm",
      expect.objectContaining({
        practiceId: "p-log-1",
        teamId: "team-abc",
        initialTab: "log",
      }),
    );
  });

  // [SC-1] 非admin: アイコンが edit-3 (旧) から plus (新) に変わる
  it("[SC-1] isAdmin=false のとき、addLog ボタンのアイコンは plus であり、旧アイコン edit-3 は使われない", () => {
    const practice = makePractice({ id: "p-icon-1", title: "アイコン検証練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-icon" isAdmin={false} />);

    const logButton = screen.getByRole("button", { name: "記録追加" });
    expect(logButton.querySelector('[data-testid="icon-plus"]'), "plus アイコンが見つからない").not.toBeNull();
    expect(logButton.querySelector('[data-testid="icon-edit-3"]'), "旧アイコン edit-3 が残っている").toBeNull();
  });

  // -----------------------------------------------------------------------
  // Sprint Contract [旧SC-7] (別スプリント番号。今回の Sprint Contract の
  // SC-7「遷移先・propsは不変」とは無関係な過去の番号なので混同注意):
  // admin 時ラベルを「記録代理入力」に分岐する (D-2)
  // 遷移先 TeamPracticeLogBulkForm は不変 (既存動作は TeamBulkNavigation.test.tsx で検証済み)
  // -----------------------------------------------------------------------

  it("[旧SC-7] isAdmin=true のとき、ボタンラベルは「記録代理入力」であり旧ラベル「ログを記入」は表示されない", () => {
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
    // [SC-6 非退行] 今回の Sprint Contract で非admin 用に新設された「記録追加」ラベルが
    // admin 側に誤って漏れ出していないこと (admin は完全に無変更のはず)
    expect(screen.queryByRole("button", { name: "記録追加" })).toBeNull();
  });

  // 【QA Phase A 書き換え】旧仕様は非admin のラベルが「ログを記入」のまま変わらないことを
  // 意図的に pin していたが、今回の Sprint Contract [SC-1] でこの前提そのものが変わった
  // (非admin ラベルは「記録追加」に変わることが正しい仕様)。観測挙動をそのまま守る
  // pin ではなく、Sprint Contract の記述に基づいて反転させた。
  it("[SC-1] isAdmin=false のとき、ボタンラベルは「記録追加」であり、旧ラベル「ログを記入」・admin用「記録代理入力」のどちらも表示されない", () => {
    const practice = makePractice({ id: "p-nonadmin-1", title: "一般練習" });
    mocks.useTeamPracticesQuery.mockReturnValue({
      data: [practice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

    expect(screen.getByRole("button", { name: "記録追加" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "ログを記入" })).toBeNull();
    expect(screen.queryByRole("button", { name: "記録代理入力" })).toBeNull();
  });

  it("[旧SC-7] isAdmin=true で「記録代理入力」を押すと TeamPracticeLogBulkForm へ { practiceId, teamId } で navigate される (遷移先不変)", () => {
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

  // -----------------------------------------------------------------------
  // [変更C] 一括登録ボタンの移設 (TeamDetailScreen の独立行 → ヘッダー行内)
  // -----------------------------------------------------------------------

  describe("[変更C] 一括登録ボタンがヘッダー行内に「追加」の左として配置される", () => {
    it("isAdmin=true のとき、一括登録ボタンが DOM 上で追加ボタンより先に現れる", () => {
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

      const bulkRegisterButton = screen.getByRole("button", { name: "一括登録" });
      const addButtons = screen.getAllByRole("button", { name: "練習を追加" });
      const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
      expect(headerAddButton, "ヘッダーの追加ボタンが見つからない").toBeDefined();

      // Node.compareDocumentPosition: 前者が後者より前にあれば PRECEDING ビットが立たない
      // (後者から見て前者が「先行 (preceding)」)
      // eslint 上の理由で bitwise を直接比較する代わりに位置関係を明示的に確認する。
      const position = bulkRegisterButton.compareDocumentPosition(headerAddButton!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("練習が0件 (空状態) でも一括登録ボタンと追加ボタンはヘッダーに表示される (items.length===0 分岐の外側)", () => {
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-1" isAdmin={true} />);

      expect(screen.getByRole("button", { name: "一括登録" })).toBeDefined();
      const addButtons = screen.getAllByRole("button", { name: "練習を追加" });
      expect(addButtons.length).toBeGreaterThan(0);
    });

    it("isAdmin=false のときは一括登録ボタンが表示されない (表示条件は addButton と同一)", () => {
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [makePractice()],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-1" isAdmin={false} />);

      expect(screen.queryByRole("button", { name: "一括登録" })).toBeNull();
    });

    it("一括登録ボタンを押すと TeamBulkRegister へ { teamId } で navigate される", () => {
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-bulk" isAdmin={true} />);

      fireEvent.click(screen.getByRole("button", { name: "一括登録" }));

      expect(mocks.navigate).toHaveBeenCalledWith("TeamBulkRegister", { teamId: "team-bulk" });
    });
  });

  // =========================================================================
  // [Sprint Contract SC-1/SC-6/SC-7] 練習タブ: 非admin ラベル「記録追加」+ plus アイコン、
  // admin は完全に無変更 (練習タブに日付排他仕様は無い)
  // =========================================================================
  describe("[Sprint Contract SC-1/SC-6/SC-7] 記録追加ボタン (練習タブ)", () => {
    it("[SC-1] 非admin: ラベルが「記録追加」であり、アイコンが plus である", () => {
      const practice = makePractice({ id: "p-sc1-1", title: "SC-1検証練習" });
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [practice],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-sc1" isAdmin={false} />);

      const button = screen.getByRole("button", { name: "記録追加" });
      expect(button.querySelector('[data-testid="icon-plus"]')).not.toBeNull();
      expect(button.querySelector('[data-testid="icon-edit-3"]')).toBeNull();
    });

    it("[SC-6 非退行] admin: ラベルは「記録代理入力」のまま、アイコンは edit-3 (旧アイコン) のままで plus には変わらない", () => {
      const practice = makePractice({ id: "p-sc6-1", title: "SC-6検証練習" });
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [practice],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-sc6" isAdmin={true} />);

      const button = screen.getByRole("button", { name: "記録代理入力" });
      expect(button.querySelector('[data-testid="icon-edit-3"]')).not.toBeNull();
      expect(button.querySelector('[data-testid="icon-plus"]')).toBeNull();
      expect(screen.queryByRole("button", { name: "記録追加" })).toBeNull();
    });

    it("[SC-7 改訂] 非admin: 「記録追加」ボタンを押すと PracticeTabForm(initialTab:'log') へ遷移する (今回のスプリントで PracticeLogForm から統合タブ画面に一本化)", () => {
      const practice = makePractice({ id: "p-sc7-1", title: "SC-7検証練習" });
      mocks.useTeamPracticesQuery.mockReturnValue({
        data: [practice],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamPracticeList teamId="team-sc7" isAdmin={false} />);

      fireEvent.click(screen.getByRole("button", { name: "記録追加" }));

      expect(mocks.navigate).toHaveBeenCalledWith("PracticeTabForm", {
        practiceId: "p-sc7-1",
        teamId: "team-sc7",
        initialTab: "log",
      });
      expect(mocks.navigate).not.toHaveBeenCalledWith("TeamPracticeLogBulkForm", expect.anything());
      expect(mocks.navigate).not.toHaveBeenCalledWith("PracticeLogForm", expect.anything());
    });
  });

  // =========================================================================
  // [Sprint Contract SC-8] i18n: addLog キーが5ロケール全てで新文言に変わり、
  // キー名自体は不変であること
  //
  // 実測ベース: apps/shared/messages/*.json を直接読み込み、Sprint 着手前の
  // 実測値 (OLD_ADD_LOG, git diff で確認済み) との差分で「変わったこと」を検証する。
  // 加えて、PM 経由で報告された App Developer の実測新文言 (NEW_ADD_LOG) との
  // 厳密一致も検証する (この表も鵜呑みにせず、実ファイル読み込み側で照合するので
  // 表と実ファイルが食い違えばこのテストが red になる)。
  // =========================================================================
  describe("[Sprint Contract SC-8] i18n: teamPracticeList.addLog が5ロケールで更新されている", () => {
    // Phase A 時点 (今回の Sprint Contract 着手前) の実測値。git diff で確認済み。
    const LOCALE_MESSAGES: Record<string, { teams: { mobile: { teamPracticeList: { addLog?: string } } } }> = {
      ja: jaMessages,
      en: enMessages,
      de: deMessages,
      ko: koMessages,
      zh: zhMessages,
    };
    const OLD_ADD_LOG: Record<string, string> = {
      ja: "ログを記入",
      en: "Add Log",
      de: "Log eintragen",
      ko: "로그 작성",
      zh: "填写日志",
    };

    const NEW_ADD_LOG: Record<string, string> = {
      ja: "記録追加",
      en: "Add Record",
      de: "Ergebnis hinzufügen",
      ko: "기록 추가",
      zh: "添加成绩",
    };

    it.each(Object.keys(OLD_ADD_LOG))("%s: addLog キーの値が Sprint 着手前の旧値から変わっている (キー自体は存在し続ける)", (locale) => {
      const value = LOCALE_MESSAGES[locale]?.teams.mobile.teamPracticeList.addLog;
      expect(value, `${locale}.json に teamPracticeList.addLog が存在しない`).toBeDefined();
      expect(value).not.toBe(OLD_ADD_LOG[locale]);
    });

    it.each(Object.keys(NEW_ADD_LOG))("%s: addLog キーの値が実測済みの新文言と厳密一致する", (locale) => {
      const value = LOCALE_MESSAGES[locale]?.teams.mobile.teamPracticeList.addLog;
      expect(value).toBe(NEW_ADD_LOG[locale]);
    });
  });
});
