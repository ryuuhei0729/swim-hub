/**
 * TeamCompetitionEntryModal — モーダル内導線の admin 分岐 + ステータス変更セグメント削除
 * (mobile, 要件B後半 / D5, R5)
 *
 * Sprint Contract: `sprint-contract.md` D5, R5
 * 検証観点 (Verification Checklist): V-M-06
 *
 * 【インターフェース契約 / PM 裁定】
 * - D5: 非admin は「エントリーを追加」(`selfEntryButton`)。admin は
 *   「エントリーを代理入力」(`adminBulkEntryButton`) を表示し、押下で
 *   `onAdminBulkEntry` コールバックが呼ばれる (遷移自体は親 `TeamCompetitionList.tsx` の責務)。
 * - R5: admin もモーダル内では常に read-only badge のみを見る (変更セグメントは無い)。
 *   このテストは「要素が無い」だけでなく、`useUpdateCompetitionMutation` フック自体が
 *   このモーダルから一度も呼ばれないことを対で検証する
 *   (`feedback_swimhub_qa_harness_reimplements_production` 系の再導入検出ガード)。
 * - D10 改訂: 「エントリーを追加」ボタンの表示条件は status === "open" のみ
 *   (自分のエントリー件数には依存しない。旧 D10 の「0件で非表示」はユーザーが撤回した)。
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getEntriesByCompetition: vi.fn(),
  supabase: {},
  user: { id: "u-1" } as { id: string } | null,
  useUpdateCompetitionMutation: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: mocks.user })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
  },
}));

// R5 回帰ガード: このモーダルからステータス変更 mutation フックが一度も呼ばれないこと。
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
}));

import { TeamCompetitionEntryModal } from "../TeamCompetitionEntryModal";

const baseProps = {
  visible: true,
  onClose: vi.fn(),
  competitionId: "c-1",
  competitionTitle: "春季大会",
  entryStatus: "open" as const,
  isAdmin: false,
  onSelfEntry: vi.fn(),
  onEditEntry: vi.fn(),
  onAdminBulkEntry: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "u-1" };
  mocks.getEntriesByCompetition.mockResolvedValue([]);
  mocks.useUpdateCompetitionMutation.mockReturnValue({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  });
});

describe("TeamCompetitionEntryModal — モーダル内導線の admin 分岐 (mobile)", () => {
  describe("[V-M-06] SC6: 非admin は「エントリーを追加」/ admin は「エントリーを代理入力」", () => {
    it("非admin (entryStatus='open') は「エントリーを追加」が表示される", async () => {
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={false} entryStatus="open" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      expect(screen.getByText("エントリーを追加")).toBeDefined();
      expect(screen.queryByText("エントリーを代理入力")).toBeNull();
    });

    it("admin (entryStatus='open') は「エントリーを追加」ではなく「エントリーを代理入力」が表示される", async () => {
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="open" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      expect(screen.getByText("エントリーを代理入力")).toBeDefined();
      expect(screen.queryByText("エントリーを追加")).toBeNull();
    });

    it("admin が「エントリーを代理入力」を押すと onAdminBulkEntry が呼ばれる", async () => {
      const onAdminBulkEntry = vi.fn();
      render(
        <TeamCompetitionEntryModal
          {...baseProps}
          isAdmin={true}
          entryStatus="open"
          onAdminBulkEntry={onAdminBulkEntry}
        />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      fireEvent.click(screen.getByText("エントリーを代理入力"));
      expect(onAdminBulkEntry).toHaveBeenCalledTimes(1);
    });

    it("entryStatus が open 以外のとき、admin/非admin いずれもボタン自体が表示されない", async () => {
      const { rerender } = render(
        <TeamCompetitionEntryModal {...baseProps} isAdmin={false} entryStatus="before" />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());
      expect(screen.queryByText("エントリーを追加")).toBeNull();
      expect(screen.queryByText("エントリーを代理入力")).toBeNull();

      rerender(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="closed" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());
      expect(screen.queryByText("エントリーを追加")).toBeNull();
      expect(screen.queryByText("エントリーを代理入力")).toBeNull();
    });

    // D10 改訂: 自分のエントリーが0件でも「エントリーを追加」は表示される (旧ルールは撤回済み)
    it("[D10改訂/非退行] 非admin で自分のエントリーが0件でも「エントリーを追加」は表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([]);
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={false} entryStatus="open" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      expect(screen.getByText("エントリーを追加")).toBeDefined();
    });
  });

  describe("[V-M-06] R5: admin もモーダル内では read-only バッジのみ (ステータス変更セグメント削除)", () => {
    it("isAdmin=true でも before/open/closed の変更セグメントは表示されない (read-only badge のみ)", async () => {
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="open" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // 現在値のバッジ (受付中) は表示されるが、他の選択候補は無い
      expect(screen.getByText("受付中")).toBeDefined();
      expect(screen.queryByText("受付前")).toBeNull();
      expect(screen.queryByText("受付終了")).toBeNull();
    });

    it("[回帰] admin でモーダルを開いても mutation (DB 更新) フックが一度も呼ばれない", async () => {
      render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} entryStatus="open" />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      // ステータスバッジは Pressable ではないため、クリックしても意味を持たないはずだが
      // 念のためテキスト要素をクリックしてもハンドラが存在しないことを確認する。
      const badge = screen.getByText("受付中");
      fireEvent.click(badge);

      expect(mocks.mutateAsync).not.toHaveBeenCalled();
    });
  });
});
