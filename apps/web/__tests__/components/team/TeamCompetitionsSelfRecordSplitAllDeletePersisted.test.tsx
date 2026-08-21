/**
 * TeamCompetitions — 自己記録導線: 既存記録のスプリットを全削除した保存が
 * 正しく永続化されること (PM 裁定1: C1 修正の正しさをテストで確認する)。
 *
 * 旧ファイル名 `...SplitAllDeleteNotPersisted.test.tsx` は「observed bug をそのまま
 * assertion にした」pin テストだった (`expect(mocks.replaceSplitTimes).not
 * .toHaveBeenCalled()` — 0件でも常に呼ぶという正しい修正を適用すると必然的に赤転する)。
 * PM 裁定により「テストが誤り、実装 (0件でも常に呼ぶ) が正しい」と確定したため、
 * ファイル名・アサーションともに正しい仕様に合わせて書き直す。
 *
 * 仕様 (Dev 実装 / PM 裁定2の existingRecordWasRelaying 判定を含む):
 * - 非リレー記録: 既存スプリットを全削除して0件で保存すると `replaceSplitTimes` が
 *   `(recordId, [])` で呼ばれる (0件でも常に呼ぶ = 全削除が正しく永続化される)
 * - リレー記録 (ロード時点で is_relaying=true だった記録):
 *   この画面はリレーの split を読まないし書かない (V-SR-02)。ロードした時点で
 *   split_times が既に空にされているため「全削除して保存」という操作はUI上
 *   発生し得ないが、真に検証すべきなのは「この画面がリレー split の DB 実データを
 *   一切書き換えない」という不変条件そのもの: `replaceSplitTimes` はおろか
 *   `createSplitTimes` も一切呼ばれてはならない。判定は読み込み時点の
 *   `existingRecordWasRelaying` を使い、フォーム上の isRelaying トグルを
 *   ユーザーが操作しても判定がぶれないことも確認する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock, type CompetitionMockRow } from "../../utils/supabaseCompetitionsMock";

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

// 100mなら 25m の中間スプリットが「ゴールタイム(=100m)」と区別され削除ボタンが表示される
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

function buildRow(record: Record<string, unknown>): CompetitionMockRow {
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

describe("TeamCompetitions — 既存スプリット全削除の永続化 (PM裁定1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
    mocks.getStyles.mockResolvedValue([STYLE_FR100]);
  });

  it(
    "[非リレー] 唯一の中間スプリットを削除して0件にした状態で保存すると、" +
      "replaceSplitTimes が (recordId, []) で呼ばれ、全削除が正しく永続化される",
    async () => {
      const { supabase } = buildSupabaseCompetitionsMock([
        buildRow({
          id: "record-existing-1",
          time: 60.0,
          user_id: "member-1",
          style_id: 3,
          is_relaying: false,
          note: "",
          reaction_time: null,
          video_path: null,
          video_thumbnail_path: null,
          split_times: [{ distance: 25, split_time: 14.0 }],
          users: { name: "選手A" },
        }),
      ]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      const splitTimeInput = await screen.findByTestId("record-split-time-1-1");
      expect(splitTimeInput).toHaveValue("14.00");

      const removeSplitButton = screen.getByTestId("record-split-remove-button-1-1");
      await user.click(removeSplitButton);
      expect(screen.queryByTestId("record-split-time-1-1")).not.toBeInTheDocument();

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalled();
      });

      // 正しい仕様: 0件でも常に replaceSplitTimes が呼ばれ、全削除がDBに反映される
      expect(mocks.replaceSplitTimes).toHaveBeenCalledWith("record-existing-1", []);
    },
  );

  it(
    "[リレー] ロード時点でリレーだった記録を触らずに保存しても、" +
      "replaceSplitTimes/createSplitTimes は一切呼ばれない(この画面はリレーsplitを書かない)",
    async () => {
      const { supabase } = buildSupabaseCompetitionsMock([
        buildRow({
          id: "record-existing-1",
          time: 28.9,
          user_id: "member-1",
          style_id: 3,
          is_relaying: true,
          note: "",
          reaction_time: null,
          video_path: null,
          video_thumbnail_path: null,
          // DB上にリレー記録の split_times が実在する想定(別セッション進行中のWIPが
          // 書き込んだデータ)。この画面が誤って触れないことを検証する。
          split_times: [{ distance: 25, split_time: 13.5 }],
          users: { name: "選手A" },
        }),
      ]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      // V-SR-02: リレー記録の split はそもそも画面上に復元表示されない
      await screen.findByTestId("record-time-1");
      expect(screen.queryByTestId("record-split-time-1-1")).not.toBeInTheDocument();

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalled();
      });

      expect(mocks.replaceSplitTimes).not.toHaveBeenCalled();
      expect(mocks.createSplitTimes).not.toHaveBeenCalled();
    },
  );

  it(
    "[リレー+トグル操作] ロード時点でリレーだった記録のトグルをユーザーがOFFにして保存しても、" +
      "判定は読み込み時点の値のまま保持され replaceSplitTimes/createSplitTimes は呼ばれない" +
      "(existingRecordWasRelaying はフォームの isRelaying トグルとは独立して判定される)",
    async () => {
      const { supabase } = buildSupabaseCompetitionsMock([
        buildRow({
          id: "record-existing-1",
          time: 28.9,
          user_id: "member-1",
          style_id: 3,
          is_relaying: true,
          note: "",
          reaction_time: null,
          video_path: null,
          video_thumbnail_path: null,
          split_times: [{ distance: 25, split_time: 13.5 }],
          users: { name: "選手A" },
        }),
      ]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-time-1");
      // フォーム上のリレートグルを OFF にする (existingRecordWasRelaying は不変のはず)
      const relayToggle = screen.getByTestId("record-relay-1");
      expect(relayToggle).toHaveAttribute("aria-checked", "true");
      await user.click(relayToggle);
      expect(relayToggle).toHaveAttribute("aria-checked", "false");

      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalled();
      });

      // isRelaying トグルは false で送信されるが (payload 上は反映される)、
      // split 書き込み判定はロード時点の existingRecordWasRelaying=true を使うため
      // 依然として split_times への書き込みは発生しない。
      const [, updatePayload] = mocks.updateRecord.mock.calls[0];
      expect(updatePayload.is_relaying).toBe(false);
      expect(mocks.replaceSplitTimes).not.toHaveBeenCalled();
      expect(mocks.createSplitTimes).not.toHaveBeenCalled();
    },
  );
});
