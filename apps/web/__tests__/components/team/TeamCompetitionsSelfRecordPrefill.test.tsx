/**
 * TeamCompetitions — 自己記録導線: 代理入力済み記録の復元 + 重複INSERT防止 (Sprint Contract Issue1/dup-insert)
 *
 * バグ報告 (ユーザー実測):
 *   1. チーム管理者がチーム大会を作成し、記録を代理入力
 *   2. チームの利用者本人が「自分の記録を追加」をクリック
 *   3. 期待値: 手順1の記録が入力済みの状態で編集画面に遷移
 *   4. 実際 (Issue 1): 種目は復元されるがタイムが空欄
 *
 * 真因 (PM 実測):
 *   - TeamCompetitions.tsx の records 取得クエリ (`records ( id, time, users(...) )`) が
 *     style_id / user_id / is_relaying / note / reaction_time を選択しておらず、
 *     mapToTeamCompetitions が明示的なフィールドのみで新オブジェクトを組み立てるため、
 *     たとえ Supabase から余分なフィールドが返っても mapper がそれらを捨てる。
 *   - RecordLogForm に既存レコードを渡す prop が存在せず、useRecordLogForm の
 *     `initialRecords` 経路（time を正しく復元できる既存メカニズム）に到達できない。
 *   - handleSelfRecordSubmit は既存 record の有無を判定せず常に createRecord (INSERT) を
 *     呼ぶため、Issue 1 だけ直すと保存時に重複行が生成される（PM のスコープ決定より
 *     Issue1 と重複INSERT修正は同時出荷が必須）。
 *
 * このテストは「今の実装」をそのまま pin しない。時間が空欄になる／INSERT が常に
 * 呼ばれるのは仕様ではなくバグである前提で、期待される正しい振る舞いを検証する。
 * 実装前の現時点では red になることを期待する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  replaceSplitTimes: vi.fn(),
  getStyles: vi.fn(),
  entryApiCtor: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: mocks.update,
    remove: mocks.remove,
    create: mocks.create,
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

// 「自分の記録を追加」フローが entries テーブルに一切副作用を出さないことのガード
// (このモジュールが現状インポートされていなくても、将来 import された場合に
// コンストラクタ呼び出しを検知できるようにしておく)。
vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: mocks.entryApiCtor.mockImplementation(() => ({
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

// RecordLogForm 内部の VideoUploader は dynamic import + ssr:false のため jsdom で不要
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

// useBestTimes はこのスプリントの関心事ではないため空実装に固定
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

// 50m自由形 (id=2, Fr, リレー対象距離) をメインの検証種目に使う
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

// 実装が editData 経路 (update-record-button) / initialRecords 経路 (save-record-button
// のまま update を内部的に行う) のどちらを選んでも実行できるよう、ボタンの testid には
// 依存せず両方を許容する。検証したいのは「呼ばれる API」であって「ボタンの見た目」ではない。
const getSubmitButton = () =>
  screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button");

describe("TeamCompetitions — 代理入力済み記録の復元 (Issue1) と重複INSERT防止", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);
  });

  it("[V-SR-01] 管理者代理入力済みの記録がある種目を開くと、タイム欄に既存タイムが復元表示される(空欄にならない)", async () => {
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
      // 本人のエントリー (種目復元は既存動作として成立している)
      entries: [
        { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
      ],
      // 管理者が代理入力した実際の記録 (タイム 30.50 秒)。
      // user_id / style_id は widen された select を前提にした fixture。
      records: [
        {
          id: "record-existing-1",
          time: 30.5,
          user_id: "member-1",
          style_id: 2,
          is_relaying: false,
          note: "",
          reaction_time: null,
          video_path: null,
          users: { name: "選手A" },
        },
      ],
    };

    currentAuthMock = { user: { id: "member-1" }, supabase: buildSupabaseCompetitionsMock([row]).supabase, subscription: null };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    const timeInput = await screen.findByTestId("record-time-1");
    // 現状の実装 (entryDataList のみ渡す) では "" のまま。
    // 期待値: 既存レコードの time (30.5秒 → "30.50") が入力欄に反映される。
    expect(timeInput).not.toHaveValue("");
    expect(timeInput).toHaveValue("30.50");
  });

  it(
    "[V-SR-02] リレー記録の代理入力済み記録は time/リアクションタイム/メモが復元されるが、" +
      "split(経過タイム)は空のままである(明示的な仕様)",
    async () => {
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
        records: [
          {
            id: "record-existing-1",
            time: 28.9,
            user_id: "member-1",
            style_id: 2,
            is_relaying: true,
            note: "引き継ぎ2番目",
            reaction_time: 0.15,
            video_path: null,
            // DB に既存の split_times 行が実在するケース (ミューテーション実証用: is_relaying
            // ガードを外すとこの行が復元されて record-split-time-1-1 が出現するはずのfixture)。
            split_times: [{ distance: 25, split_time: 14.2 }],
            users: { name: "選手A" },
          },
        ],
      };

      currentAuthMock = { user: { id: "member-1" }, supabase: buildSupabaseCompetitionsMock([row]).supabase, subscription: null };
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      const timeInput = await screen.findByTestId("record-time-1");
      expect(timeInput).toHaveValue("28.90");

      const reactionInput = screen.getByTestId("record-reaction-time-1");
      expect(reactionInput).toHaveValue(0.15);

      const noteInput = screen.getByTestId("record-note-1");
      expect(noteInput).toHaveValue("引き継ぎ2番目");

      // split は明示的に空のまま (リレー split 変換ロジックは別セッションの WIP であり本スプリントの対象外)。
      // DB 上に split_times 行 (25m/14.2秒) が実在していても、is_relaying=true の場合は
      // 意図的に復元しないことを、実データありのfixtureで検証する。
      expect(screen.queryByTestId("record-split-time-1-1")).not.toBeInTheDocument();
    },
  );

  it("[V-SR-03] 既存の代理入力済み記録がある種目を保存すると、createRecord ではなく updateRecord が呼ばれる(重複INSERT防止)", async () => {
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
      records: [
        {
          id: "record-existing-1",
          time: 30.5,
          user_id: "member-1",
          style_id: 2,
          is_relaying: false,
          note: "",
          reaction_time: null,
          video_path: null,
          users: { name: "選手A" },
        },
      ],
    };

    currentAuthMock = { user: { id: "member-1" }, supabase: buildSupabaseCompetitionsMock([row]).supabase, subscription: null };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    await screen.findByTestId("record-time-1");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        "record-existing-1",
        expect.objectContaining({ time: expect.any(Number) }),
      );
    });
    expect(mocks.createRecord).not.toHaveBeenCalled();
  });

  it("[V-SR-04] 代理入力済み記録が存在しない種目を保存する場合は、従来通り createRecord (INSERT) が呼ばれる(非回帰)", async () => {
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
      records: [],
    };

    currentAuthMock = { user: { id: "member-1" }, supabase: buildSupabaseCompetitionsMock([row]).supabase, subscription: null };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    const timeInput = await screen.findByTestId("record-time-1");
    await user.type(timeInput, "31.20");
    await user.tab();
    await user.click(screen.getByTestId("save-record-button"));

    await waitFor(() => {
      expect(mocks.createRecord).toHaveBeenCalled();
    });
    expect(mocks.updateRecord).not.toHaveBeenCalled();
  });

  it("[V-SR-06] 自分の記録を追加フロー全体(表示・編集・保存)で entries テーブルの API が一切呼ばれない", async () => {
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
      records: [
        {
          id: "record-existing-1",
          time: 30.5,
          user_id: "member-1",
          style_id: 2,
          is_relaying: false,
          note: "",
          reaction_time: null,
          video_path: null,
          users: { name: "選手A" },
        },
      ],
    };

    currentAuthMock = { user: { id: "member-1" }, supabase: buildSupabaseCompetitionsMock([row]).supabase, subscription: null };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    await screen.findByTestId("record-time-1");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mocks.updateRecord).toHaveBeenCalled();
    });
    expect(mocks.entryApiCtor).not.toHaveBeenCalled();
  });
});
