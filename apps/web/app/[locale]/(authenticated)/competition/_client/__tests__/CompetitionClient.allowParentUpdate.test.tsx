/**
 * CompetitionClient — allowParentUpdate の導出 (Sprint Contract 2 SC1/SC4)
 *
 * /competition 履歴タブは dashboard の getEditingDataTeamId とは別に、
 * 選択中の record.competition.team_id から直接 allowParentUpdate を導出する
 * (`!selection.record.competition?.team_id == null` 相当の三項演算子)。
 * 導出ロジックが dashboard と異なる独立した経路のため、専用のテストで
 * 「チーム大会 (team_id あり) は編集不可 / 個人大会 (team_id なし) は編集可」を
 * 直接検証する。CompetitionClient.test.tsx 本体 (配線ロジック中心) とは
 * 責務を分けて別ファイルに置く。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 (SC1: チーム大会は個人画面から
 * 編集不可 / SC4: 個人大会は従来どおり編集可能) の記述から導出したものであり、
 * 実装の三項演算子をそのままコピーしたものではない。
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCompetitionStore } from "@/stores/competition/competitionStore";

vi.mock("@/components/forms/RecordLogForm", () => ({
  __esModule: true,
  default: () => null,
}));

import { makeRecord, renderClient } from "./competitionClientHarness";

describe("CompetitionClient allowParentUpdate 導出", () => {
  beforeEach(() => {
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  it("[SC1] チーム大会 (team_id あり) の記録行を編集しようとすると allowParentUpdate=false が渡る", async () => {
    const user = userEvent.setup();
    const base = makeRecord();
    renderClient([
      makeRecord({
        competition: {
          ...(base.competition as NonNullable<typeof base.competition>),
          team_id: "team-abc",
        },
      }),
    ]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会編集"));

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("false");
  });

  it("[SC4 / 非退行] 個人大会 (team_id なし) の記録行を編集すると allowParentUpdate=true が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]); // competition.team_id: null (デフォルト)

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会編集"));

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("true");
  });
});
