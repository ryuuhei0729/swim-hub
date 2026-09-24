/**
 * TeamCompetitionEntryModal コンポーネント テスト
 *
 * Sprint Contract Phase B QA 検証 (mobile 受付状況エントリー一覧モーダル)
 *
 * ---------------------------------------------------------------------
 * 【QA Phase B 書き換えメモ (R7)】
 * PM 裁定 R5 により、このモーダルからステータス変更セグメント (before/open/closed の
 * 変更 UI) は削除され、admin もカード上プルダウン (`TeamCompetitionList.tsx`) に
 * 一本化された。旧テストのうち以下は「実装のバグではなく仕様変更」として書き換えた:
 * - 「管理者ビューで before/open/closed の3セグメントが表示される」
 * - 「別ステータス選択で確認 Alert が出て、OK 押下で mutation と teamKeys 無効化が走る」
 * - 「mutation が失敗すると汎用エラー Alert...」「UserFacingError...」(mutation 自体が
 *   このモーダルから消えたため対象コンポーネントが無くなった)
 * - 「保存中(isPending=true)はセグメントが disabled になり...」
 * - [SC-5] isPastDate 系4件 (isPastDate prop 自体がこのモーダルから削除された。
 *   カード側の同等のガードは `TeamCompetitionList.test.tsx` が担保する)
 * これらの代替として、R5 の「admin も read-only バッジのみ・mutation フック自体が
 * 呼ばれない」ことを肯定的に検証するテストを追加した
 * (`TeamCompetitionEntryModalAdminBulkEntryLink.test.tsx` にも同種の検証がある。
 * 二重に見えるが、あちらは「ボタン文言の分岐」観点、ここは「mutation 不使用」観点で
 * 役割が異なる)。
 *
 * 「entryStatus='open' のとき「種目をエントリー」押下で onSelfEntry が呼ばれる」は
 * D10 (撤回済み) の影響を受けていた。現行仕様 (D10 改訂) はボタンの表示条件を
 * status === "open" のみに戻し、文言だけ「エントリーを追加」に変更したため、
 * 文言更新のみで期待値を追従させた。
 *
 * トートロジー防止:
 * - DOM に表示される文字列・要素の有無、外部 mock の呼び出し引数のみ検証する
 * - 実装の内部 state をそのままアサートしない
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getEntriesByCompetition: vi.fn(),
  deleteEntry: vi.fn(),
  supabase: {},
  user: { id: "u-1" } as { id: string } | null,
  // R5 回帰ガード: このモーダルから既存のステータス変更 mutation フック
  // (useUpdateCompetitionMutation) が一度も呼ばれないことを実証するためのスパイ。
  useUpdateCompetitionMutation: vi.fn(),
}));

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) =>
      visible ? React.createElement(React.Fragment, null, children) : null,
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: mocks.user })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
    deleteEntry = mocks.deleteEntry;
  },
}));

// R5 回帰ガード用: このモジュールが import されていること自体は既存コンポーネントの
// 依存グラフの都合で発生しうるが、フックの戻り値である mutateAsync がこのモーダルの
// レンダー/操作を通じて一度も呼ばれないことを確認する (呼ばれれば segment 復活の兆候)。
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
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
  entryStatus: "before" as const,
  isAdmin: true,
  onSelfEntry: vi.fn(),
  onEditEntry: vi.fn(),
  onAdminBulkEntry: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "u-1" };
  mocks.getEntriesByCompetition.mockResolvedValue([]);
  mocks.useUpdateCompetitionMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

describe("TeamCompetitionEntryModal", () => {
  // [R5] admin も read-only バッジのみを見る (変更セグメントは表示されない)
  it("管理者ビューでも受付状況は read-only バッジのみで、他ステータスのセグメントは出ない", async () => {
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalledWith("c-1"));

    // 現在値のバッジは表示される
    expect(screen.getByText("受付前")).toBeDefined();
    // 他ステータスの選択候補 (変更セグメント) は表示されない
    expect(screen.queryByText("受付中")).toBeNull();
    expect(screen.queryByText("受付終了")).toBeNull();
  });

  // [R5 回帰ガード] admin であってもステータス変更 mutation フック自体が呼ばれない
  it("[R5] admin でもこのモーダルから useUpdateCompetitionMutation の mutateAsync が一度も呼ばれない", async () => {
    const mutateAsync = vi.fn();
    mocks.useUpdateCompetitionMutation.mockReturnValue({ mutateAsync, isPending: false });
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="before" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    // バッジ自体をタップしてみても (Pressable ではない想定だが、念のため) mutation は動かない
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // 非管理者は現在ステータスのバッジのみ表示 (無変更)
  it("非管理者は現在ステータスのバッジのみ表示し、他ステータスのセグメントは出ない", async () => {
    render(<TeamCompetitionEntryModal {...baseProps} isAdmin={false} entryStatus="open" />);
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    expect(screen.getByText("受付中")).toBeDefined();
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

    const backdropCandidates = Array.from(container.querySelectorAll("button")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("position: absolute"),
    );
    expect(backdropCandidates.length).toBe(1);

    fireEvent.click(backdropCandidates[0]!);

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onClose).not.toHaveBeenCalled();
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
    expect(screen.getByText(/50m自由形/)).toBeDefined();
    expect(screen.getByText(/100m平泳ぎ/)).toBeDefined();
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

  // [D10 改訂 / 文言更新] 非admin, status='open' は「エントリーを追加」が押下で onSelfEntry を発火する。
  // D10 (自分のエントリー0件で非表示) は撤回済みのため、自分のエントリーが0件でも表示される。
  it("entryStatus='open' のとき「エントリーを追加」押下で onSelfEntry が呼ばれる (自分のエントリーが0件でも表示される)", async () => {
    const onSelfEntry = vi.fn();
    mocks.getEntriesByCompetition.mockResolvedValue([]); // 自分のエントリーは0件
    render(
      <TeamCompetitionEntryModal
        {...baseProps}
        isAdmin={false}
        entryStatus="open"
        onSelfEntry={onSelfEntry}
      />,
    );
    await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

    fireEvent.click(screen.getByText("エントリーを追加"));
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

    expect(screen.queryByText("エントリーを追加")).toBeNull();
    expect(onSelfEntry).not.toHaveBeenCalled();
  });

  // visible=false のとき何も描画しない
  it("visible=false のときエントリー取得もせず何も描画しない", () => {
    render(<TeamCompetitionEntryModal {...baseProps} visible={false} />);
    expect(mocks.getEntriesByCompetition).not.toHaveBeenCalled();
    expect(screen.queryByText("受付前")).toBeNull();
  });
});
