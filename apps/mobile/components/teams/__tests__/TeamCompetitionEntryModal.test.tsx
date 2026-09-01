/**
 * TeamCompetitionEntryModal コンポーネント テスト
 *
 * Sprint Contract Phase B QA 検証 (mobile 受付状況管理モーダル / Web パリティ)
 *
 * 検証観点 (Verification Checklist):
 * [V-02] 管理者は before/open/closed を変更でき、useUpdateCompetitionMutation + teamKeys.competitions 無効化が走る
 * [V-03] 現在値と同値選択は no-op (mutation が呼ばれない)。任意遷移可
 * [V-04] 楽観更新 + 失敗時ロールバック + エラー Alert + 保存中 disabled
 * [V-05] 非管理者は読み取りバッジのみ、変更 UI(セグメント)が出ない
 * [V-06] セルフエントリー導線 onSelfEntry が押下で発火する
 * [V-07] getEntriesByCompetition の結果が種目別にグルーピング表示される
 * [V-08] entry_status が null/未定義でも before 相当で安全表示
 *
 * --- QA Phase B 追加 (Sprint Contract SC-5 本体。Phase A で申し送りしたギャップを解消) ---
 * [SC-5-1] isPastDate=true でステータス変更セグメントが disabled になる (accessibilityState + 実際にクリック不能)
 * [SC-5-2] isPastDate=true で pastDateNotice の説明文が表示される
 * [SC-5-3] isPastDate=true でセグメントを押しても mutation (DB 更新) が呼ばれない (見た目だけでなく実際に書き込みが起きないこと)
 * [SC-5-4] isPastDate 未指定 (省略) はデフォルト false として振る舞い、既存の変更操作 (mutation) が壊れていない
 *
 * トートロジー防止:
 * - DOM に表示される文字列・要素の有無、外部 mock の呼び出し引数のみ検証する
 * - 実装の内部 state をそのままアサートしない。Sprint Contract の仕様に基づく
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Alert } from "react-native";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  useUpdateCompetitionMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  getEntriesByCompetition: vi.fn(),
  supabase: {},
}));

// react-native: 実モックを広げつつ Modal を children をそのまま描画するスタブとして追加
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? React.createElement(React.Fragment, null, children) : null,
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/keys", () => ({
  teamKeys: {
    competitions: (teamId: string) => ["teams", "detail", teamId, "competitions"],
  },
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
  },
}));

import { TeamCompetitionEntryModal } from "../TeamCompetitionEntryModal";

// -----------------------------------------------------------------------
// テストデータ
// -----------------------------------------------------------------------
const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e-1",
  team_id: "team-1",
  competition_id: "c-1",
  user_id: "u-1",
  style_id: 1,
  entry_time: 65.42, // 1:05.42
  note: null,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  style: { id: 1, name_jp: "50m自由形", distance: 50 },
  user: { id: "u-1", name: "山田太郎" },
  competition: {},
  ...overrides,
});

const baseProps = {
  visible: true,
  onClose: vi.fn(),
  competitionId: "c-1",
  competitionTitle: "春季大会",
  teamId: "team-1",
  entryStatus: "before" as const,
  isAdmin: true,
  onSelfEntry: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutateAsync.mockResolvedValue({ id: "c-1", entry_status: "open" });
  mocks.getEntriesByCompetition.mockResolvedValue([]);
  mocks.useUpdateCompetitionMutation.mockReturnValue({
    mutateAsync: mocks.mutateAsync,
    isPending: mocks.isPending,
  });
});

describe("TeamCompetitionEntryModal", () => {
  // [V-08] entry_status=before のセグメントが3つ表示され、管理者には変更 UI が出る
  it("管理者ビューで before/open/closed の3セグメントが表示される", async () => {
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalledWith("c-1"));

    // ja.json: statusBefore/Open/Closed
    expect(screen.getByText("受付前")).toBeDefined();
    expect(screen.getByText("受付中")).toBeDefined();
    expect(screen.getByText("受付終了")).toBeDefined();
  });

  // [V-05] 非管理者は読み取りバッジのみ。セグメント(変更 UI)は出ない
  it("非管理者は現在ステータスのバッジのみ表示し、他ステータスのセグメントは出ない", async () => {
    render(
      <TeamCompetitionEntryModal {...baseProps} isAdmin={false} entryStatus="open" />,
    );
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    // 現在値 "受付中" は表示される
    expect(screen.getByText("受付中")).toBeDefined();
    // 管理者専用の他ステータス候補は描画されない
    expect(screen.queryByText("受付前")).toBeNull();
    expect(screen.queryByText("受付終了")).toBeNull();
  });

  // mobile UI フィードバック #3: SlideUpModal 移行後も背面タップで閉じないこと (元実装どおり)
  it("[V-SLIDE-01] 背面タップで閉じない (SlideUpModal 移行後も NOOP_BACKDROP_PRESS のまま)", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <TeamCompetitionEntryModal {...baseProps} onClose={onClose} isAdmin={true} />,
    );
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalledWith("c-1"));

    // SlideUpModal の背面タップ用 Pressable は絶対配置 (StyleSheet.absoluteFill) の button
    // として一意に識別できる (この画面には他に absoluteFill を使う button が無い)。
    const backdropCandidates = Array.from(container.querySelectorAll("button")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("position: absolute"),
    );
    expect(backdropCandidates.length).toBe(1);

    fireEvent.click(backdropCandidates[0]!); // 直前の toBe(1) で存在は保証済み

    // SlideUpModal は閉じるとき即座に unmount せず setTimeout 後に unmount するため、
    // タップ直後の DOM 残存だけでは「閉じない」ことの証明にならない。onClose 呼び出し
    // 有無を直接判定する (アニメーション時間の待機を挟んでも呼ばれないこと)。
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onClose).not.toHaveBeenCalled();
  });

  // [V-03] 現在値と同値選択は no-op (Alert 確認も mutation も呼ばれない)
  it("現在値と同じステータスを押しても mutation も確認 Alert も呼ばれない", async () => {
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("受付前")); // 現在値と同値
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // [V-02] 別ステータス選択 → 確認 Alert → OK で mutation + invalidate が走る
  it("別ステータス選択で確認 Alert が出て、OK 押下で mutation と teamKeys 無効化が走る", async () => {
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("受付中")); // before -> open

    // 確認 Alert が呼ばれる
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
    // OK ボタンの onPress を発火
    const okButton = buttons.find((b) => b.onPress);
    expect(okButton).toBeDefined();
    okButton?.onPress?.();

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        id: "c-1",
        updates: { entry_status: "open" },
      }),
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["teams", "detail", "team-1", "competitions"],
    });
  });

  // [V-04] mutation 失敗時はエラー Alert が表示される (ロールバック導線)
  it("mutation が失敗するとエラー Alert が表示される", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("ネットワークエラー"));
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("受付終了")); // before -> closed
    const confirmCall = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const buttons = confirmCall![2] as Array<{ text: string; onPress?: () => void }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
    buttons.find((b) => b.onPress)?.onPress?.();

    // 失敗後にエラー Alert (2 回目) が出る
    await waitFor(() => {
      const calls = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls;
      const errorCall = calls.find((c) => String(c[1]).includes("ネットワークエラー"));
      expect(errorCall).toBeDefined();
    });
  });

  // [V-04] isPending=true のときセグメントが disabled になる
  it("保存中(isPending=true)はセグメントが disabled になり押下で変更が走らない", async () => {
    mocks.useUpdateCompetitionMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: true,
    });
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("受付中"));
    // disabled なので確認 Alert すら出ない
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  // [V-07] エントリーが種目別にグルーピングされ、選手名・タイムが表示される
  it("getEntriesByCompetition の結果を種目別グループで表示し、選手名とタイムを出す", async () => {
    mocks.getEntriesByCompetition.mockResolvedValue([
      makeEntry({ id: "e-1", user: { id: "u-1", name: "山田太郎" }, entry_time: 65.42 }),
      makeEntry({
        id: "e-2",
        style_id: 2,
        user: { id: "u-2", name: "佐藤花子" },
        style: { id: 2, name_jp: "100m平泳ぎ", distance: 100 },
        entry_time: null,
      }),
    ]);

    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} />);

    await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());
    expect(screen.getByText(/佐藤花子/)).toBeDefined();
    // 種目ヘッダー (件数付き)
    expect(screen.getByText(/50m自由形/)).toBeDefined();
    expect(screen.getByText(/100m平泳ぎ/)).toBeDefined();
    // formatTimeBest(65.42) => 1:05.42
    expect(screen.getByText("1:05.42")).toBeDefined();
  });

  // [V-07] エントリー0件で空状態メッセージが出る
  it("エントリーが 0 件のとき空状態メッセージが表示される", async () => {
    mocks.getEntriesByCompetition.mockResolvedValue([]);
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} />);
    await waitFor(() =>
      expect(screen.getByText("まだエントリーがありません")).toBeDefined(),
    );
  });

  // [V-04] getEntriesByCompetition 失敗時にエラーメッセージとリトライ導線が出る
  it("エントリー取得に失敗するとエラーメッセージが表示される", async () => {
    mocks.getEntriesByCompetition.mockRejectedValue(new Error("fetch error"));
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} />);
    await waitFor(() =>
      expect(screen.getByText("エントリー情報の取得に失敗しました")).toBeDefined(),
    );
  });

  // [V-06 / #7] セルフエントリー導線は entry_status === "open" のときのみ表示され、押下で onSelfEntry を発火する
  it("entryStatus='open' のとき「種目をエントリー」押下で onSelfEntry が呼ばれる", async () => {
    const onSelfEntry = vi.fn();
    render(
      <TeamCompetitionEntryModal
        {...baseProps}
        isAdmin={false}
        entryStatus="open"
        onSelfEntry={onSelfEntry}
      />,
    );
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("種目をエントリー"));
    expect(onSelfEntry).toHaveBeenCalledTimes(1);
  });

  // [#7] entry_status が open 以外（before）のときはセルフエントリー導線を表示しない
  it("entryStatus='before' のときセルフエントリー導線は表示されない", async () => {
    const onSelfEntry = vi.fn();
    render(
      <TeamCompetitionEntryModal
        {...baseProps}
        isAdmin={false}
        entryStatus="before"
        onSelfEntry={onSelfEntry}
      />,
    );
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    expect(screen.queryByText("種目をエントリー")).toBeNull();
    expect(onSelfEntry).not.toHaveBeenCalled();
  });

  // visible=false のとき何も描画しない
  it("visible=false のときエントリー取得もせず何も描画しない", () => {
    render(<TeamCompetitionEntryModal {...baseProps} visible={false} />);
    expect(mocks.getEntriesByCompetition).not.toHaveBeenCalled();
    expect(screen.queryByText("受付前")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Sprint Contract [SC-5] 過去日 (isPastDate) のセグメント disabled 化 + 説明文 + 書き込み阻止
  // -----------------------------------------------------------------------

  describe("[SC-5] isPastDate によるステータス変更セグメントの無効化", () => {
    // [SC-5-1] disabled 属性 (accessibilityState) が立つ
    it("isPastDate=true のとき各ステータスセグメントの accessibilityState.disabled が true になる", async () => {
      render(
        <TeamCompetitionEntryModal
          {...baseProps}
          isAdmin={true}
          entryStatus="before"
          isPastDate={true}
        />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // セグメントは accessibilityRole="button" + accessibilityState を持つ。
      // モックは accessibilityState をそのまま DOM 属性として素通しするため、
      // 各セグメント (受付前/受付中/受付終了) の button 要素で disabled 相当を確認する。
      ["受付前", "受付中", "受付終了"].forEach((label) => {
        const el = screen.getByText(label).closest("button");
        expect(el, `${label} セグメントが button として見つからない`).not.toBeNull();
        // React Native の disabled prop はテストハーネスで実際の HTML disabled 属性になる
        expect((el as HTMLButtonElement).disabled).toBe(true);
      });
    });

    // [SC-5-2] 過去日の説明文が表示される
    it("isPastDate=true のとき pastDateNotice の説明文が表示される", async () => {
      render(
        <TeamCompetitionEntryModal
          {...baseProps}
          isAdmin={true}
          entryStatus="closed"
          isPastDate={true}
        />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // ja.json: teams.mobile.teamCompetitionEntryModal.pastDateNotice
      expect(
        screen.getByText("大会日を過ぎたため、自動的に受付終了になっています"),
      ).toBeDefined();
    });

    // isPastDate=false (明示指定) では説明文は出ない (回帰防止: 常時表示になっていないか)
    it("isPastDate=false のとき pastDateNotice の説明文は表示されない", async () => {
      render(
        <TeamCompetitionEntryModal
          {...baseProps}
          isAdmin={true}
          entryStatus="before"
          isPastDate={false}
        />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      expect(
        screen.queryByText("大会日を過ぎたため、自動的に受付終了になっています"),
      ).toBeNull();
    });

    // [SC-5-3] 本質: 見た目の disabled だけでなく、実際にステータス変更の書き込み (mutation) が起きないこと
    it("isPastDate=true のときセグメントを押しても確認 Alert も mutation も呼ばれない (DB 書き込みなし)", async () => {
      render(
        <TeamCompetitionEntryModal
          {...baseProps}
          isAdmin={true}
          entryStatus="before"
          isPastDate={true}
        />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // 現在値(before)ではない別ステータスを押しても disabled のため何も起きないはず
      fireEvent.click(screen.getByText("受付中"));
      fireEvent.click(screen.getByText("受付終了"));

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mocks.mutateAsync).not.toHaveBeenCalled();
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    });

    // [SC-5-4] isPastDate 未指定はデフォルト false として振る舞い、既存の変更操作は壊れていない
    // (baseProps は isPastDate を含まない。他の V-02/V-03 系テストが green であること自体が
    //  デフォルト値の後方互換性を示すが、ここでは「未指定でも通常通り mutation が走る」ことを
    //  明示的に1本ピンする)
    it("isPastDate を省略した場合、デフォルト false として通常通りステータス変更 (mutation) ができる", async () => {
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // pastDateNotice も出ない
      expect(
        screen.queryByText("大会日を過ぎたため、自動的に受付終了になっています"),
      ).toBeNull();

      fireEvent.click(screen.getByText("受付中")); // before -> open
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      buttons.find((b) => b.onPress)?.onPress?.();

      await waitFor(() =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          id: "c-1",
          updates: { entry_status: "open" },
        }),
      );
    });
  });
});
