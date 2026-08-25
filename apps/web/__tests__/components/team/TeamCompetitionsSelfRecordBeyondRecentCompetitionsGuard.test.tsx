/**
 * TeamCompetitions — 自己記録導線: 「直近50大会」に対象大会が入らないと事前入力が
 * 静かに失敗する既知の未解決バグ (PM 裁定2 で指摘・次ラウンドで再実装予定)。
 *
 * 背景 (PM 実測): handleOpenSelfRecord のオンデマンド取得クエリは、C3 対応で
 * `.eq("records.user_id", user.id)` によりサーバー側で自分以外の記録を除外している
 * ものの、対象大会 (`competition_id`) 自体はサーバー側で絞り込まず、
 * `.order("date", desc).range(0, 49)` で「自分の記録がある直近50大会」を丸ごと取得し、
 * クライアント側の `.find(row => row.id === competition.id)` で対象大会を取り出している。
 *
 * SwimHub は「選手ひとりの水泳記録を一生分積み上げる」プロダクトのため、長期利用者が
 * 51件目以降の(古い)大会を開くと `.find` が undefined になり、Issue1 (タイム空欄バグ)
 * が再発する。
 *
 * このテストは現状の実装 (records!inner + order/range + client find) では **red**
 * になることを意図的に許容する (PM裁定2で明示された既知の未解決事項)。
 * 次ラウンドで Dev が `records` テーブル直クエリ + `.eq("competition_id",...)
 * .eq("user_id",...)` の2条件サーバー側絞り込みに再実装した後、green に転じることを
 * 期待する回帰テストとして残す。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSupabaseCompetitionsMock,
  type CompetitionMockRow,
} from "../../utils/supabaseCompetitionsMock";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  replaceSplitTimes: vi.fn(),
  getStyles: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createRecord: mocks.createRecord,
    createSplitTimes: mocks.createSplitTimes,
    updateRecord: mocks.updateRecord,
    replaceSplitTimes: mocks.replaceSplitTimes,
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: mocks.getStyles,
  })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: vi.fn(),
    getEntriesByUser: vi.fn(),
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

const STYLE_FR50 = { id: 2, name_jp: "50m自由形", distance: 50 };

let currentAuthMock: {
  user: { id: string };
  supabase: ReturnType<typeof buildSupabaseCompetitionsMock>["supabase"];
  subscription: null;
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

const openSelfRecordForm = async (user: ReturnType<typeof userEvent.setup>) => {
  // 対象大会 (目的の大会) は日付が最も古く(rank51)、一覧の3ページ目
  // (pageSize=20, 51件中41〜51件目) に表示される。「次のページ」を2回押してページ3まで進む。
  await screen.findAllByRole("button", { name: /自分の記録を追加|自己記録を追加/ });
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await screen.findByRole("button", { name: "ページ 2" });
  await user.click(screen.getByRole("button", { name: "次のページ" }));
  await screen.findByText("目的の大会");

  // 一覧は日付降順で描画されるため、最も古い対象大会 (rank51) は常に配列の最後に来る。
  const buttons = screen.getAllByRole("button", { name: /自分の記録を追加|自己記録を追加/ });
  await user.click(buttons[buttons.length - 1]);
  await screen.findByTestId("record-form-modal");
};

function buildOwnRecordRow(id: string, date: string, title: string): CompetitionMockRow {
  return {
    id,
    user_id: "member-1",
    team_id: "team-1",
    title,
    date,
    place: "県営プール",
    entry_status: "before",
    note: null,
    created_at: "2020-01-01T00:00:00Z",
    created_by: "member-1",
    users: { name: "選手A" },
    created_by_user: null,
    entries: [
      { id: `entry-${id}`, user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
    ],
    records: [
      {
        id: `record-${id}`,
        time: 30.5,
        user_id: "member-1",
        style_id: 2,
        is_relaying: false,
        note: "",
        reaction_time: null,
        video_path: null,
        video_thumbnail_path: null,
        users: { name: "選手A" },
      },
    ],
  };
}

describe("TeamCompetitions — 直近50大会境界の既知バグ (PM裁定2, 次ラウンドで再実装予定)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-target" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);
  });

  it(
    "対象大会が「自分の記録がある直近50大会」に入らない(51番目以降)場合、" +
      "既存記録があるにも関わらずタイムが空欄になる(既知バグ、次ラウンド修正待ち)",
    async () => {
      // 対象大会 (最も古い日付 = 直近順で51番目になるよう、より新しい50件を別途用意する)
      const targetRow = buildOwnRecordRow("competition-target", "2020-01-01", "目的の大会");

      // 対象より新しい日付の大会を50件用意する (2021-01-01 〜 2070-01-01)
      const fillerRows: CompetitionMockRow[] = Array.from({ length: 50 }, (_, i) =>
        buildOwnRecordRow(`competition-filler-${i}`, `${2021 + i}-01-01`, `埋め合わせ大会${i}`),
      );

      const { supabase } = buildSupabaseCompetitionsMock([targetRow, ...fillerRows]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      // 期待される正しい挙動 (次ラウンド修正後): 既存タイム "30.50" が復元される。
      // 現状の実装 (order+range(0,49) 経由の直近50件制限) では、対象大会が51番目
      // (最古) のため範囲外になり、.find が undefined → タイムが空欄のままになる。
      const timeInput = await screen.findByTestId("record-time-1");
      expect(timeInput).toHaveValue("30.50");
    },
  );
});
