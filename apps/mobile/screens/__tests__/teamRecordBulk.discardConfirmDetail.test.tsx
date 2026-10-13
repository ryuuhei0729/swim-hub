// =============================================================================
// teamRecordBulk.discardConfirmDetail.test.tsx
// Sprint Contract Phase A スケルトン — 種目詳細画面の未保存離脱ガード
// =============================================================================
//
// 確定仕様: 未保存離脱は usePreventRemove による破棄確認とする。
// 現行 TeamRecordBulkFormScreen.tsx は usePreventRemove を使っていない
// (grep で不使用を確認済み)。新設の詳細画面で新規に実装される。
//
// usePreventRemove をキャプチャするモックに差し替え、コールバック (破棄確認
// ダイアログを開くハンドラ) を直接呼び出して検証する
// (apps/mobile/__tests__/screens/CompetitionTabFormScreen.test.tsx の
// mockUsePreventRemove パターンを踏襲)。

import type { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent, configure } from "@testing-library/react";
import React from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";
import {
  buildDetailScreenSupabaseMock,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

// __mocks__/react-native.ts の TextInput は onChangeText を DOM の onChange に
// 結線しないため fireEvent.change でテキスト入力を再現できない
// (PracticeTabFormScreen.practiceScopeRowWipe.test.tsx と同じ対処)。
harness.rawTextInput = true;
configure({ testIdAttribute: "testID" });
harness.currentUserId = "admin-1";

function lastPreventRemoveCall() {
  const call = harness.preventRemoveCalls[harness.preventRemoveCalls.length - 1];
  if (!call) throw new Error("usePreventRemove がまだ呼ばれていない");
  return call;
}

const FAKE_LEAVE_ACTION = { type: "GO_BACK" };

describe("[V-07] 種目詳細画面の破棄確認", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.preventRemoveCalls.length = 0;
    queryClient = makeQueryClient();

    harness.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
    harness.supabase = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
          {
            id: "record-1",
            user_id: "admin-1",
            style_id: 2,
            time: 30.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "admin-1", name: "管理者" },
          },
        ],
        entries: [],
      },
    }).supabase;
    harness.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    harness.members = [
      { user_id: "admin-1", role: "admin", is_swimmer: true, users: { id: "admin-1", name: "管理者" } },
    ];
  });

  it("タイムを入力後 (未保存) に戻ろうとすると usePreventRemove のダイアログがトリガーされる", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    const timeInput = await screen.findByTestId("record-bulk-member-time");
    fireEvent.change(timeInput, { target: { value: "29.80" } });

    await waitFor(() => {
      expect(lastPreventRemoveCall().shouldPreventRemove).toBe(true);
    });

    lastPreventRemoveCall().listener({ data: { action: FAKE_LEAVE_ACTION } });
    expect(Alert.alert).toHaveBeenCalledWith(
      ja.common.discardTitle,
      ja.common.discardMessage,
      expect.any(Array),
    );
  });

  it("何も編集していない状態で戻る場合はダイアログが出ない (対照)", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByTestId("record-bulk-member-time");

    await waitFor(() => {
      expect(lastPreventRemoveCall().shouldPreventRemove).toBe(false);
    });
  });

  it("保存成功直後に戻る場合はダイアログが出ない (dirty state がリセットされる)", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    const timeInput = await screen.findByTestId("record-bulk-member-time");
    fireEvent.change(timeInput, { target: { value: "29.80" } });

    await waitFor(() => {
      expect(lastPreventRemoveCall().shouldPreventRemove).toBe(true);
    });

    fireEvent.click(screen.getByText(ja.teams.record.saveButton));

    await waitFor(() => {
      expect(harness.goBack).toHaveBeenCalled();
    });

    // isSaved が立った後は shouldPreventRemove が false に戻る
    expect(lastPreventRemoveCall().shouldPreventRemove).toBe(false);
  });

  it("ダイアログで「破棄」を選ぶと画面が閉じ、「キャンセル」を選ぶと画面に留まる", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    const timeInput = await screen.findByTestId("record-bulk-member-time");
    fireEvent.change(timeInput, { target: { value: "29.80" } });

    await waitFor(() => {
      expect(lastPreventRemoveCall().shouldPreventRemove).toBe(true);
    });

    lastPreventRemoveCall().listener({ data: { action: FAKE_LEAVE_ACTION } });

    const [, , buttons] = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, string, Array<{ text: string; style?: string; onPress?: () => void }>];

    const cancelButton = buttons.find((b) => b.style === "cancel");
    const discardButton = buttons.find((b) => b.style === "destructive");
    expect(cancelButton).toBeDefined();
    expect(discardButton).toBeDefined();

    // キャンセル: dispatch は呼ばれない (画面に留まる)
    cancelButton?.onPress?.();
    expect(harness.dispatch).not.toHaveBeenCalled();

    // 破棄: dispatch(navData.action) が呼ばれる (画面が閉じる)
    discardButton?.onPress?.();
    expect(harness.dispatch).toHaveBeenCalledWith(FAKE_LEAVE_ACTION);
  });
});
