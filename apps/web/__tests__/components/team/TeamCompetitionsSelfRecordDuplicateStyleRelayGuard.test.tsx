/**
 * TeamCompetitions — 自己記録導線: 重複styleId事前バリデーション(W2)の
 * false-positive修正 (Reviewer再レビューCritical) の回帰テスト。
 *
 * 水泳ドメインの確定仕様:
 *   「個人種目として泳いだ100m Fr」と「リレーの1泳者として泳いだ100m Fr」は
 *   別レースであり、同じ大会・同じ種目で両方の記録が存在するのは正当なデータ。
 *   records/entries とも (user_id, competition_id, style_id) の UNIQUE 制約は無い
 *   (W1で実測済み)。
 *
 * 旧実装 (Critical): RecordLogForm.tsx の重複判定が styleId のみを見て isRelaying
 * を無視していたため、上記の正当な組み合わせを誤ってブロックし保存不能にしていた。
 * TeamCompetitions.tsx の seenStyleIds も同じ誤りを持ち、管理者が同一styleIdで
 * 個人/リレーの記録を2件代理入力していると1枚のカードに潰れ、もう1件が編集も
 * 削除もできない状態になっていた。
 *
 * 修正: 両箇所とも (styleId, isRelaying) の複合キーで判定するよう変更される。
 * このテストは修正後の最終挙動を検証する。Web Dev の修正が完了するまでは
 * red になり得る (PM指示: 修正前の red は正常、Devの修正完了後に再判定する)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
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

// Fr50/Ba100 は互いの部分文字列にならない値を選ぶ (fixture名の部分一致トートロジー回避)
const STYLE_FR50 = { id: 2, name_jp: "50m自由形", distance: 50 };
const STYLE_BA100 = { id: 13, name_jp: "100m背泳ぎ", distance: 100 };
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

function buildRow(
  entries: Array<Record<string, unknown>>,
  records: Array<Record<string, unknown>>,
): CompetitionMockRow {
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
    entries,
    records,
  };
}

describe("TeamCompetitions — 重複styleId事前バリデーション(W2)のリレー区分false-positive修正", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-existing" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
  });

  it(
    "[(1)+(3)] 同じ style_id で is_relaying が異なる既存記録2件は、" +
      "カードが2枚に分かれて復元され(潰れない)、変更せず保存すると" +
      "formError_duplicateStyle が出ず両方 updateRecord される",
    async () => {
      mocks.getStyles.mockResolvedValue([STYLE_FR100]);
      const row = buildRow(
        [{ id: "entry-1", user_id: "member-1", style_id: 3, entry_time: 65.0, users: { name: "選手A" } }],
        [
          {
            id: "record-individual",
            time: 60.5,
            user_id: "member-1",
            style_id: 3,
            is_relaying: false,
            note: "個人種目",
            reaction_time: null,
            video_path: null,
            video_thumbnail_path: null,
            users: { name: "選手A" },
          },
          {
            id: "record-relay",
            time: 58.2,
            user_id: "member-1",
            style_id: 3,
            is_relaying: true,
            note: "リレー2走目",
            reaction_time: null,
            video_path: null,
            video_thumbnail_path: null,
            users: { name: "選手A" },
          },
        ],
      );

      const { supabase } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      // (3) 潰れずに2枚のカードへ正しく復元される
      await screen.findByTestId("record-entry-section-1");
      expect(screen.getByTestId("record-entry-section-2")).toBeInTheDocument();
      const time1 = screen.getByTestId("record-time-1");
      const time2 = screen.getByTestId("record-time-2");
      const times = [time1, time2].map((el) => (el as HTMLInputElement).value);
      expect(times).toContain("1:00.50");
      expect(times).toContain("58.20");

      // (1) 変更せず保存 → duplicateStyle エラーが出ず両方保存される
      await user.click(
        screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button"),
      );

      await waitFor(() => {
        expect(mocks.updateRecord).toHaveBeenCalledTimes(2);
      });
      expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    },
  );

  it(
    "[(2)] styleId も isRelaying も同じ2枚のカード(ユーザーがカード2の種目を" +
      "カード1と同じに変更)を保存すると、formError_duplicateStyle が出て" +
      "createRecord は一切呼ばれない(緩めすぎ検出)",
    async () => {
      mocks.getStyles.mockResolvedValue([STYLE_FR50, STYLE_BA100]);
      const row = buildRow(
        [
          { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
          { id: "entry-2", user_id: "member-1", style_id: 13, entry_time: 75.0, users: { name: "選手A" } },
        ],
        [],
      );

      const { supabase } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-entry-section-1");
      await screen.findByTestId("record-entry-section-2");

      // カード2 (Ba100) の種目を50mに変更 → カード1と同じ50m自由形(id=2)になる。
      // どちらも isRelaying はデフォルト false のまま (完全な真の重複)。
      await user.click(screen.getByTestId("record-style-distance-2-50"));

      const timeInput1 = screen.getByTestId("record-time-1");
      const timeInput2 = screen.getByTestId("record-time-2");
      await user.type(timeInput1, "29.80");
      await user.tab();
      await user.type(timeInput2, "30.10");
      await user.tab();

      await user.click(screen.getByTestId("save-record-button"));

      const errorBox = await screen.findByTestId("record-form-error");
      expect(errorBox).toHaveTextContent("同じ種目のカードが複数あります。重複を解消してください");
      expect(mocks.createRecord).not.toHaveBeenCalled();
      expect(mocks.updateRecord).not.toHaveBeenCalled();
    },
  );

  it(
    "[claim優先順位] entryは同style_idの非リレー記録を優先してクレームする" +
      "(records配列の順序に関わらず、リレー記録を先に拾わない)",
    async () => {
      mocks.getStyles.mockResolvedValue([STYLE_FR100]);
      // records 配列の順序をわざと「リレーが先・個人が後」にする。ナイーブな
      // 配列走査 (先着優先) だとリレー記録が entry に紐づいてしまうが、正しい
      // claim ロジックは非リレーを優先するため、順序に関わらず個人記録が
      // entry のカードに入るはず。
      const row = buildRow(
        [{ id: "entry-1", user_id: "member-1", style_id: 3, entry_time: 65.0, users: { name: "選手A" } }],
        [
          {
            id: "record-relay-first",
            time: 58.2,
            user_id: "member-1",
            style_id: 3,
            is_relaying: true,
            note: "リレー2走目",
            reaction_time: null,
            video_path: null,
            video_thumbnail_path: null,
            users: { name: "選手A" },
          },
          {
            id: "record-individual-second",
            time: 60.5,
            user_id: "member-1",
            style_id: 3,
            is_relaying: false,
            note: "個人種目",
            reaction_time: null,
            video_path: null,
            video_thumbnail_path: null,
            users: { name: "選手A" },
          },
        ],
      );

      const { supabase } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-entry-section-1");
      expect(screen.getByTestId("record-entry-section-2")).toBeInTheDocument();

      // entry (1枚目のカード) は非リレー優先で個人記録 (60.50 = 1:00.50) をクレームする。
      // 2枚目はクレームされなかったリレー記録 (58.20) が独立カードとして残る。
      const time1 = (screen.getByTestId("record-time-1") as HTMLInputElement).value;
      const time2 = (screen.getByTestId("record-time-2") as HTMLInputElement).value;
      expect(time1).toBe("1:00.50");
      expect(time2).toBe("58.20");
    },
  );
});
