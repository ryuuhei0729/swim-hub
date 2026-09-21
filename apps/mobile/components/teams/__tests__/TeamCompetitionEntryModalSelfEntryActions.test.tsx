/**
 * TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (mobile, 要件A / D1)
 *
 * Sprint Contract: `sprint-contract.md` D1, R1, R2
 * 検証観点 (Verification Checklist): V-M-01, V-M-02, V-M-03, V-M-04, V-M-08, V-M-09
 *
 * 【インターフェース契約】
 * - RN モックは `accessibilityLabel` を DOM の `aria-label` に変換しない
 *   (`feedback_swimhub_rn_mock_testid_only_textinput` 参照)。小文字化された
 *   `accessibilitylabel` 属性で引く (`apps/mobile/components/teams/rankings/__tests__/
 *   TeamRankings.test.tsx` と同じ流儀)。
 * - `entry.user_id === user.id` の行にのみ描画する。
 * - R1: 表示条件はコンポーネントに渡された `entryStatus` (呼び出し側が
 *   resolveEntryStatus で解決済みの実効ステータス) が "open" のときのみ。
 * - R2: 削除は行単位のみ。リレーの他選手のレグ行は変化しない。
 * - 削除: 確認 Alert → `EntryAPI.deleteEntry(entry.id)` → `loadEntries()` 再取得。
 *   失敗時はエラー表示し一覧を壊さない。
 * - 編集: `onEditEntry(entry)` プロパティコールバックを呼ぶ (画面遷移自体は親
 *   `TeamCompetitionList.tsx` の責務、D9 でこの entry を使って項目タブを解決する)。
 *
 * トートロジー防止:
 * DOM に表示される要素の有無・外部 mock (Alert / EntryAPI) の呼び出し引数、および
 * 親から渡された onEditEntry コールバックの呼び出し引数のみ検証する。
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Alert } from "react-native";
import { UserFacingError } from "@apps/shared/utils/userFacingError";

const mocks = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  getEntriesByCompetition: vi.fn(),
  supabase: {},
  user: { id: "u-1" } as { id: string } | null,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: mocks.user })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
    deleteEntry = mocks.deleteEntry;
  },
}));

import { TeamCompetitionEntryModal } from "../TeamCompetitionEntryModal";

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e-1",
  team_id: "team-1",
  competition_id: "c-1",
  user_id: "u-1",
  style_id: 1,
  entry_time: 65.42,
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
  entryStatus: "open" as const,
  isAdmin: false,
  onSelfEntry: vi.fn(),
  onEditEntry: vi.fn(),
  onAdminBulkEntry: vi.fn(),
};

function getByAccessibilityLabel(container: HTMLElement, label: string): HTMLElement {
  const el = container.querySelector(`[accessibilitylabel="${label}"]`);
  if (!el) throw new Error(`accessibilitylabel="${label}" の要素が見つからない`);
  return el as HTMLElement;
}

function queryByAccessibilityLabel(container: HTMLElement, label: string): HTMLElement | null {
  return container.querySelector(`[accessibilitylabel="${label}"]`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "u-1" };
});

describe("TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (mobile)", () => {
  describe("[V-M-01] SC1: 自分のエントリー行の編集アイコン", () => {
    it("編集アイコン (accessibilityLabel=editEntryAria) を押すと onEditEntry(entry) が呼ばれる", async () => {
      const onEditEntry = vi.fn();
      const entry = makeEntry({ id: "e-edit" });
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      const { container } = render(
        <TeamCompetitionEntryModal {...baseProps} onEditEntry={onEditEntry} />,
      );
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      const editButton = getByAccessibilityLabel(container, "50m自由形のエントリーを編集");
      fireEvent.click(editButton);

      expect(onEditEntry).toHaveBeenCalledTimes(1);
      expect(onEditEntry).toHaveBeenCalledWith(expect.objectContaining({ id: "e-edit" }));
    });
  });

  describe("[V-M-02] SC2: 自分のエントリー行の削除アイコン", () => {
    it("削除アイコン→確認 Alert の OK で EntryAPI.deleteEntry(entry.id) が呼ばれ、loadEntries が再実行される", async () => {
      const entry = makeEntry({ id: "e-del" });
      mocks.getEntriesByCompetition.mockResolvedValueOnce([entry]).mockResolvedValueOnce([]);
      mocks.deleteEntry.mockResolvedValue(undefined);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalledTimes(1));

      const deleteButton = getByAccessibilityLabel(container, "50m自由形のエントリーを削除");
      fireEvent.click(deleteButton);

      expect(Alert.alert).toHaveBeenCalledTimes(1);
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      const okButton = buttons.find((b) => b.onPress);
      expect(okButton).toBeDefined();
      await act(async () => {
        await okButton?.onPress?.();
      });

      expect(mocks.deleteEntry).toHaveBeenCalledWith("e-del");
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalledTimes(2));
    });

    it("確認 Alert のキャンセルでは deleteEntry が呼ばれない", async () => {
      const entry = makeEntry({ id: "e-cancel" });
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());

      fireEvent.click(getByAccessibilityLabel(container, "50m自由形のエントリーを削除"));

      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void; style?: string }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
      const cancelButton = buttons.find((b) => b.style === "cancel");
      expect(cancelButton?.onPress).toBeUndefined();
      expect(mocks.deleteEntry).not.toHaveBeenCalled();
    });

    it("リレーの他選手のレグ行は削除後も残る (R2)", async () => {
      const myEntry = makeEntry({ id: "e-mine", user_id: "u-1", style_id: 10, style: { id: 10, name_jp: "400mリレー", distance: 400 }, user: { id: "u-1", name: "自分" } });
      const otherLeg = makeEntry({ id: "e-other", user_id: "u-2", style_id: 10, style: { id: 10, name_jp: "400mリレー", distance: 400 }, user: { id: "u-2", name: "他選手" } });
      mocks.getEntriesByCompetition
        .mockResolvedValueOnce([myEntry, otherLeg])
        .mockResolvedValueOnce([otherLeg]); // 自分の行だけ消えた再取得結果
      mocks.deleteEntry.mockResolvedValue(undefined);

      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(screen.getByText(/自分/)).toBeDefined());

      fireEvent.click(getByAccessibilityLabel(container, "400mリレーのエントリーを削除"));
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
      await act(async () => {
        await buttons.find((b) => b.onPress)?.onPress?.();
      });

      expect(mocks.deleteEntry).toHaveBeenCalledWith("e-mine");
      await waitFor(() => expect(screen.queryByText(/自分/)).toBeNull());
      // 他選手のレグ行は残る
      expect(screen.getByText(/他選手/)).toBeDefined();
    });
  });

  describe("[V-M-03] SC3: 他ユーザーの行には編集/削除アイコンが出ない", () => {
    it("entry.user_id !== 自分の id の行に editEntryAria/deleteEntryAria ラベルの要素が存在しない", async () => {
      const otherEntry = makeEntry({ id: "e-other", user_id: "u-999", user: { id: "u-999", name: "他人" } });
      mocks.getEntriesByCompetition.mockResolvedValue([otherEntry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(screen.getByText(/他人/)).toBeDefined());

      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを編集")).toBeNull();
      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを削除")).toBeNull();
    });
  });

  describe("[V-M-04] SC4 / R1: 実効ステータスによる表示条件", () => {
    it("entryStatus='before' のとき自分の行にも編集/削除アイコンが出ない", async () => {
      const entry = makeEntry();
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} entryStatus="before" />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを編集")).toBeNull();
      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを削除")).toBeNull();
    });

    it("entryStatus='closed' のとき自分の行にも編集/削除アイコンが出ない", async () => {
      const entry = makeEntry();
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} entryStatus="closed" />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを編集")).toBeNull();
      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを削除")).toBeNull();
    });

    it("[非退行] entryStatus='open' のとき、編集/削除アイコンが出る", async () => {
      const entry = makeEntry();
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} entryStatus="open" />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを編集")).not.toBeNull();
      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを削除")).not.toBeNull();
    });
  });

  describe("[V-M-08] SC8: admin 自身のエントリーにも同様にアイコンが出る", () => {
    it("isAdmin=true で admin 自身がエントリーを持つ場合、admin 自身の行にも編集/削除アイコンが出る", async () => {
      mocks.user = { id: "admin-1" };
      const adminOwnEntry = makeEntry({ id: "e-admin", user_id: "admin-1", user: { id: "admin-1", name: "管理者本人" } });
      mocks.getEntriesByCompetition.mockResolvedValue([adminOwnEntry]);
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} isAdmin={true} />);
      await waitFor(() => expect(screen.getByText(/管理者本人/)).toBeDefined());

      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを編集")).not.toBeNull();
      expect(queryByAccessibilityLabel(container, "50m自由形のエントリーを削除")).not.toBeNull();
    });
  });

  describe("[V-M-09] SC9: 削除失敗時のエラーハンドリング", () => {
    it("EntryAPI.deleteEntry がネットワークエラーで reject した場合、エラー表示 (Alert) が出る", async () => {
      const entry = makeEntry({ id: "e-fail" });
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      mocks.deleteEntry.mockRejectedValue(new Error("network error"));
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      fireEvent.click(getByAccessibilityLabel(container, "50m自由形のエントリーを削除"));
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
      await act(async () => {
        await buttons.find((b) => b.onPress)?.onPress?.();
      });

      await waitFor(() => {
        const calls = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls;
        const errorCall = calls.find((c) => c[1] === "エントリーの削除に失敗しました");
        expect(errorCall).toBeDefined();
      });
    });

    it("UserFacingError で失敗した場合はそのメッセージがそのまま Alert に表示される (情報露出防止の対照実験)", async () => {
      const entry = makeEntry({ id: "e-fail2" });
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      mocks.deleteEntry.mockRejectedValue(new UserFacingError("このエントリーを削除する権限がありません"));
      const { container } = render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      fireEvent.click(getByAccessibilityLabel(container, "50m自由形のエントリーを削除"));
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
      await act(async () => {
        await buttons.find((b) => b.onPress)?.onPress?.();
      });

      await waitFor(() => {
        const calls = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls;
        const errorCall = calls.find((c) => c[1] === "このエントリーを削除する権限がありません");
        expect(errorCall).toBeDefined();
      });
    });

    it("削除失敗後も一覧は実態(削除されていない状態)のまま残り、行が消えたまま固まらない", async () => {
      const entry = makeEntry({ id: "e-fail3" });
      mocks.getEntriesByCompetition.mockResolvedValue([entry]);
      mocks.deleteEntry.mockRejectedValue(new Error("network error"));
      render(<TeamCompetitionEntryModal {...baseProps} />);
      await waitFor(() => expect(screen.getByText(/山田太郎/)).toBeDefined());

      const container = document.body;
      fireEvent.click(getByAccessibilityLabel(container, "50m自由形のエントリーを削除"));
      const alertArgs = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
      const buttons = alertArgs![2] as Array<{ text: string; onPress?: () => void }>; // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
      await act(async () => {
        await buttons.find((b) => b.onPress)?.onPress?.();
      });

      await waitFor(() => {
        const calls = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some((c) => c[1] === "エントリーの削除に失敗しました")).toBe(true);
      });
      // getEntriesByCompetition は失敗した削除の後に再取得されていない (loadEntries は
      // finally で呼ばれず、実装は catch でエラー表示するのみ) ため、一覧に元の行が残る
      expect(screen.getByText(/山田太郎/)).toBeDefined();
    });
  });
});
