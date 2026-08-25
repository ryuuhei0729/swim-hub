/**
 * TeamCompetitions — 自己記録導線: リレー記録へのスプリット追加を保存前にブロックする
 * バリデーション (`formError_relaySplitNotSupported`) の回帰テスト。
 *
 * 背景 (C1 の明示エラー化): この画面はロード時点でリレーだった既存記録
 * (existingRecordWasRelaying) の split_times を一切読まないし書かない
 * (V-SR-02: 別セッション進行中のリレー split WIP と衝突するため)。
 * しかし RecordLogEntry のスプリット追加ボタンはリレー/非リレーに関わらず常に
 * 表示されるため、ユーザーが手動でスプリット行を追加して保存すると、C1 の
 * ガードにより split_times への書き込みが黒く抑制され「保存したのに消えた」
 * (無言の失敗) という体験になる。これを保存前に明示エラーでブロックする。
 *
 * 判定基準: 読み込み時点の is_relaying (existingRecordWasRelaying)。
 * フォーム上の isRelaying トグルをユーザーが操作しても判定はぶれない
 * (SplitAllDeletePersisted.test.tsx の [リレー+トグル操作] と同じ設計)。
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

const STYLE_FR100 = { id: 3, name_jp: "100m自由形", distance: 100 };

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

function buildRow(record: Record<string, unknown>) {
  return {
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
      { id: "entry-1", user_id: "member-1", style_id: 3, entry_time: 65.0, users: { name: "選手A" } },
    ],
    records: [record],
  };
}

const addValidSplit = async (user: ReturnType<typeof userEvent.setup>, sectionIndex: number) => {
  await user.click(screen.getByTestId(`record-split-add-button-${sectionIndex}`));
  const distanceInput = screen.getByTestId(`record-split-distance-${sectionIndex}-1`);
  await user.type(distanceInput, "50");
  const splitTimeInput = screen.getByTestId(`record-split-time-${sectionIndex}-1`);
  await user.type(splitTimeInput, "25.00");
  await user.tab();
};

describe("TeamCompetitions — リレー記録へのスプリット追加を保存前にブロック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
    mocks.getStyles.mockResolvedValue([STYLE_FR100]);
  });

  it(
    "[リレー] ロード時点でリレーだった記録にスプリットを追加して保存すると、" +
      "formError_relaySplitNotSupported が表示され保存が中止される(updateRecord も呼ばれない)",
    async () => {
      const row = buildRow({
        id: "record-relay",
        time: 58.2,
        user_id: "member-1",
        style_id: 3,
        is_relaying: true,
        note: "",
        reaction_time: null,
        video_path: null,
        video_thumbnail_path: null,
        users: { name: "選手A" },
      });

      const { supabase } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-time-1");
      // V-SR-02: ロード直後は split が復元されていないことを前提として確認
      expect(screen.queryByTestId("record-split-time-1-1")).not.toBeInTheDocument();

      await addValidSplit(user, 1);

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      const errorBox = await screen.findByTestId("record-form-error");
      expect(errorBox).toHaveTextContent(
        "リレー記録のスプリット(経過タイム)は保存できません。スプリットを削除してから保存してください",
      );
      expect(mocks.updateRecord).not.toHaveBeenCalled();
      expect(mocks.replaceSplitTimes).not.toHaveBeenCalled();
    },
  );

  it(
    "[非リレー] 非リレー記録にスプリットを追加して保存する場合はブロックされない" +
      "(replaceSplitTimes が追加したスプリットを含めて呼ばれ、formErrorも出ない)",
    async () => {
      const row = buildRow({
        id: "record-individual",
        time: 60.0,
        user_id: "member-1",
        style_id: 3,
        is_relaying: false,
        note: "",
        reaction_time: null,
        video_path: null,
        video_thumbnail_path: null,
        users: { name: "選手A" },
      });

      const { supabase } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-time-1");
      await addValidSplit(user, 1);

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalled();
      });
      expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
      expect(mocks.replaceSplitTimes).toHaveBeenCalledWith("record-existing-1", [
        { distance: 50, split_time: 25 },
      ]);
    },
  );
});
