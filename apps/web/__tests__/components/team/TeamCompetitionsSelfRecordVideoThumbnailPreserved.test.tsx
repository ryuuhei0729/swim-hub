/**
 * TeamCompetitions — 自己記録導線: UPDATE 時に video_thumbnail_path が保持されること
 * (PM 指摘 R4 の修正確認)。
 *
 * 旧ファイル名 `...VideoThumbnailLoss.test.tsx` はバグ実証時の名称。C2 修正
 * (`handleOpenSelfRecord` の select に video_thumbnail_path を追加し、
 * updatePayload で `formData.videoThumbnailPath` を送る) が適用された後は、
 * 修正が正しく機能していることを検証する fix-verification テストに位置づけを変える。
 *
 * 修正前の fixture (旧テスト) はサムネイル値自体を fixture に含めていなかったため、
 * 「サムネイルが無いから null になる」のと「バグでサムネイルが消される」のを
 * テストの上では区別できなかった (どちらでも payload.video_thumbnail_path は null に
 * なり green になってしまう)。今回は実際のサムネイル値を fixture に入れ、
 * それが保存時に維持されることを検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

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
  await screen.findByText("県大会");
  await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
  await screen.findByTestId("record-form-modal");
};

describe("TeamCompetitions — UPDATE 時の video_thumbnail_path 保持 (R4修正確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);

    const row = {
      id: "competition-1",
      user_id: "member-1",
      team_id: "team-1",
      title: "県大会",
      date: "2026-08-01",
      place: "県営プール",
      entry_status: "before",
      note: null,
      created_at: "2026-07-20T00:00:00Z",
      created_by: "member-1",
      users: { name: "選手A" },
      created_by_user: null,
      entries: [
        { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
      ],
      // 既存記録には動画本体+サムネイルが両方実在する
      records: [
        {
          id: "record-existing-1",
          time: 30.5,
          user_id: "member-1",
          style_id: 2,
          is_relaying: false,
          note: "",
          reaction_time: null,
          video_path: "videos/record-existing-1.mp4",
          video_thumbnail_path: "thumbnails/record-existing-1.jpg",
          users: { name: "選手A" },
        },
      ],
    };

    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseCompetitionsMock([row]).supabase,
      subscription: null,
    };
  });

  it(
    "[R4修正確認] 動画+サムネイル付きの既存記録をタイムだけ変更して保存すると、" +
      "updateRecord の payload に既存のサムネイルパスがそのまま送られる(消失しない)",
    async () => {
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      const timeInput = await screen.findByTestId("record-time-1");
      expect(timeInput).toHaveValue("30.50");

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalled();
      });

      // 直前の toHaveBeenCalled() で呼び出し済みを確認済み
      const [, payload] = mocks.updateRecord.mock.calls[0]!;
      expect(payload.video_path).toBe("videos/record-existing-1.mp4");
      // 修正確認: サムネイルパスは実際の既存値のまま送信され、null で潰されない。
      expect(payload.video_thumbnail_path).toBe("thumbnails/record-existing-1.jpg");
    },
  );
});
