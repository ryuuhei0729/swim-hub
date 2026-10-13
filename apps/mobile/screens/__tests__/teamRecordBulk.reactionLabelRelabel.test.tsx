// =============================================================================
// teamRecordBulk.reactionLabelRelabel.test.tsx
// [QA Sprint Contract Phase B / 変更B] リアクションタイムのラベルを
// 「リアクションタイム」から「リアクション」に短縮する (個人種目カード / リレーレグの2箇所)
// =============================================================================
//
// TeamRecordStyleDetailScreen.tsx L993 / L1149 (両方とも) の
// t("teams.record.reactionTime") ("リアクションタイム") を
// t("recordMobile.form.reactionTimeLabel") ("リアクション") に切り替えた変更の検証。
// 旧ラベルの死にキー (teams.record.reactionTime) は5ロケールから削除済みのため、
// 「旧ラベルが一切現れない」ことも合わせて確認する。
// =============================================================================

import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createResponseMapSupabase,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const mocks = createResponseMapSupabase();

harness.supabase = mocks.supabase;
harness.members = [{ user_id: "user-1", role: "admin", users: { id: "user-1", name: "管理者" } }];

describe("[変更B] 個人種目カードのリアクションラベルは「リアクション」(旧「リアクションタイム」は出ない)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
    harness.getStyles.mockResolvedValue([
      { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
    ]);
    harness.getBestTimesDetailedForUsers.mockResolvedValue(new Map());
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = {
      data: [
        {
          id: "r1",
          user_id: "user-1",
          style_id: 2,
          time: 27.0,
          is_relaying: false,
          reaction_time: 0.55,
          note: null,
          split_times: [],
          users: { id: "user-1", name: "管理者" },
        },
      ],
      error: null,
    };
  });

  it("個人種目カードで「リアクション」ラベルが表示され、「リアクションタイム」は出ない", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText("リアクション")).toBeDefined();
    });
    expect(screen.queryByText("リアクションタイム")).toBeNull();
  });
});

describe("[変更B] リレーレグのリアクションラベルは「リアクション」(旧「リアクションタイム」は出ない)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.routeParams = { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_free" };
    harness.getStyles.mockResolvedValue([
      { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
    ]);
    harness.getBestTimesDetailedForUsers.mockResolvedValue(new Map());
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    // relay_4x50_free (4x50m自由形) を検出させるため、is_relaying=[false,true,true,true] の
    // 4件連続 + style_id=2 (50m自由形) の既存 records を用意する
    // (teamRecordBulk.styleListGrid.test.tsx の relay 検出パターンと同一)。
    mocks.responses["select:records"] = {
      data: [0, 1, 2, 3].map((idx) => ({
        id: `relay-record-${idx}`,
        user_id: `user-${idx}`,
        style_id: 2,
        time: 27 + idx,
        is_relaying: idx !== 0,
        reaction_time: idx === 1 ? 0.6 : null,
        note: null,
        split_times: [],
        users: { id: `user-${idx}`, name: `選手${idx}` },
      })),
      error: null,
    };
  });

  it("リレーレグカードで「リアクション」ラベルが表示され、「リアクションタイム」は出ない", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getAllByText("リアクション").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("リアクションタイム")).toBeNull();
  });
});
