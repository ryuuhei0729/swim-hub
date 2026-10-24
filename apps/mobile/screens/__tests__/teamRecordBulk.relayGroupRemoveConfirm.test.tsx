// =============================================================================
// teamRecordBulk.relayGroupRemoveConfirm.test.tsx
// TeamRecordStyleDetailScreen (リレー種目) の「n本目」タブの × の削除確認
// =============================================================================
//
// 背景 (UI レビュー照合で見つかった実害): 個人種目の選手タブの × は入力済みなら確認を
// 出していたが、リレーの組 (n本目) タブの × は確認なしで即削除し、入力済みのレグの
// タイムが消えていた。ItemTabs の shouldConfirmRemove で、入力のある組だけ確認する。
//
// モック構成は teamRecordBulk.removeHeatButton.test.tsx の [V-10] (リレー画面) を流用。
// Alert のボタン onPress は act() で包んでから DOM を読む (同ファイルの act() 警告防止メモ参照)。

import { act, fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import React from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDetailScreenSupabaseMock,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

harness.rawTextInput = true;
configure({ testIdAttribute: "testID" });

const STYLE = { id: 2, name_jp: "50m自由形", name: "Freestyle", style: "Fr", distance: 50 };

function renderRelayScreen() {
  harness.routeParams = { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_free" };
  harness.supabase = buildDetailScreenSupabaseMock({
    selectRows: {
      competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
      records: [
        { time: 27.5, is_relaying: false, user_id: "user-a" },
        { time: 28.7, is_relaying: true, user_id: "user-b" },
        { time: 28.3, is_relaying: true, user_id: "user-c" },
        { time: 27.6, is_relaying: true, user_id: "user-d" },
      ].map((r, idx) => ({
        id: `relay-record-${idx}`,
        user_id: r.user_id,
        style_id: 2,
        time: r.time,
        is_relaying: r.is_relaying,
        reaction_time: null,
        note: null,
        split_times: [],
        users: { id: r.user_id, name: `選手${idx}` },
      })),
      entries: [],
    },
  }).supabase;
  const queryClient = makeQueryClient();
  return render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
}

function alertButtons() {
  const call = vi.mocked(Alert.alert).mock.calls.at(-1)!;
  return call[2] as Array<{ text?: string; style?: string; onPress?: () => void }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.getStyles.mockResolvedValue([STYLE]);
  harness.members = [
    { user_id: "user-1", role: "admin", is_swimmer: true, users: { id: "user-1", name: "太郎" } },
    { user_id: "user-2", role: "user", is_swimmer: true, users: { id: "user-2", name: "次郎" } },
  ];
});

describe("リレーの組タブの ×", () => {
  it("[RG-1] タイム入力済みの組の × は確認を出し、キャンセルすれば組は残る", async () => {
    const utils = renderRelayScreen();
    await waitFor(() => expect(screen.getByText("選手0")).toBeDefined());

    // 2本目 (空) を足して × を表示させる
    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(screen.getByText("2本目")).toBeDefined());

    fireEvent.click(utils.getByTestId("item-tab-remove-1"));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe("1本目を削除しますか？");
    act(() => alertButtons().find((b) => b.style === "cancel")?.onPress?.());

    expect(screen.getByText("1本目")).toBeDefined();
    expect(screen.getByText("2本目")).toBeDefined();
  });

  it("[RG-2] 確認で「削除」を選ぶとその組だけが消える", async () => {
    const utils = renderRelayScreen();
    await waitFor(() => expect(screen.getByText("選手0")).toBeDefined());
    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(screen.getByText("2本目")).toBeDefined());

    fireEvent.click(utils.getByTestId("item-tab-remove-1"));
    act(() => alertButtons().find((b) => b.style === "destructive")?.onPress?.());

    // 残った空の組が「1本目」に繰り上がり、タブは1つになる
    await waitFor(() => expect(screen.queryByText("2本目")).toBeNull());
    expect(screen.queryByText("選手0")).toBeNull();
  });

  it("[RG-3] 何も入力していない組の × は確認なしで消える", async () => {
    const utils = renderRelayScreen();
    await waitFor(() => expect(screen.getByText("選手0")).toBeDefined());
    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(screen.getByText("2本目")).toBeDefined());

    fireEvent.click(utils.getByTestId("item-tab-remove-2"));

    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("2本目")).toBeNull());
    expect(screen.getByText("選手0")).toBeDefined();
  });
});
