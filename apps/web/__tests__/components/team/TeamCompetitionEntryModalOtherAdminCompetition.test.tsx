/**
 * TeamCompetitionEntryModal — 他管理者作成のチーム大会でも開けること (真因修正の回帰テスト)
 *
 * ユーザー報告: チーム詳細画面「大会」タブで、過去の大会カードの「エントリー」ボタンを
 * 押すと「大会が見つかりません」エラーモーダルが出る。
 *
 * PM 実測で確定した真因 (日付ではない):
 *   TeamCompetitionEntryModal.tsx:72 / :163 の `recordApi.getCompetitions().find(...)` は
 *   `apps/shared/api/records.ts:743 getCompetitions()` の
 *   `.or("user_id.eq.<自分>,user_id.is.null")` により「個人スコープ」でしか大会を取れない。
 *   そのため、自分以外の管理者が作成したチーム大会は `.find()` で必ず見つからず
 *   `competitionEntryModal.competitionNotFound` ("大会が見つかりません") が投げられる。
 *   ユーザーの「過去だけ壊れる」という報告は、たまたま過去大会が他管理者作成だった
 *   というデータ依存の相関にすぎず、未来大会でも他管理者作成なら同じエラーが再現する
 *   (このテストは意図的に "未来日" の大会で検証し、日付が原因ではないことを証明する)。
 *
 * 修正方針 (Deliverables): `recordApi.getCompetitions().find()` を、
 * `entries/_server/EntriesDataLoader.tsx:73-96` と同型の
 * `competitions` テーブルへの `id` + `team_id` 直接クエリに置換する。
 *
 * このテストは実装の内部呼び出し (getCompetitions を呼ぶか呼ばないか) を強制しない。
 * 「getCompetitions() が個人スコープのため対象大会を含まない (=旧バグの前提条件を
 * 再現する)」状態を固定した上で、それでもモーダルが正常に大会情報を表示できることを
 * 振る舞いベースで検証する (実装がどちらの経路を通ってもユーザー価値としては正しい)。
 *
 * 実装前の現時点では [V-09][V-10] は RED になる想定 (「大会が見つかりません」が出る)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  // 個人スコープの getCompetitions は「他管理者作成のチーム大会」を含まない空配列を返す
  // ことで、ユーザー報告の前提条件 (旧バグが起きる状態) を固定する。
  getCompetitions: vi.fn(),
  updateCompetition: vi.fn(),
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getCompetitions: mocks.getCompetitions,
    updateCompetition: mocks.updateCompetition,
  })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: mocks.getEntriesByCompetition,
  })),
}));

// 意図的に未来日 (2099年) にする: 「過去日だから壊れる」のではなく
// 「他管理者作成だから壊れる」ことを日付から切り離して証明するため。
const OTHER_ADMIN_COMPETITION_ROW = {
  team_id: "team-1",
  title: "他管理者大会",
  date: "2099-01-01",
  place: "他会場プール",
  entry_status: "open",
};

type ChainResponse = { data: unknown; error: unknown };

/**
 * テーブル名ごとに終端レスポンスを返す最小限の supabase チェーンモック。
 * `.eq()` の回数・順序を問わず、`.single()` / `.maybeSingle()` どちらの終端でも
 * 同じレスポンスを返す (実装がどちらを選んでも検証できるようにするため)。
 */
function buildSupabaseMock(responses: Record<string, ChainResponse>) {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const from = vi.fn((table: string) => {
    const response = responses[table] ?? defaultResponse;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.single = vi.fn(() => Promise.resolve(response));
    builder.maybeSingle = vi.fn(() => Promise.resolve(response));
    return builder;
  });
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "member-1" } } }),
    },
  };
}

/**
 * [V-14] 実際の Postgres の WHERE 句フィルタリングを模した supabase モック。
 * `buildSupabaseMock` と異なり `.eq(col, value)` の呼び出しを蓄積し、`competitions`
 * テーブルに対しては「その大会が実際に持つ team_id」と `.eq("team_id", ...)` で
 * 指定された値が一致しない限り、行が存在しないもの (data: null) として扱う。
 * これにより「実装が team_id 条件を発行しているか」を、内部呼び出しのモック検証
 * ではなく、クロスチーム漏洩という振る舞いの結果で検証できる。
 * `.eq("team_id", ...)` が一度も呼ばれない場合は、他チームの行でも
 * `id` 一致のみで返してしまう(=脆弱な実装を模擬する)。
 */
function buildRowFilteringSupabaseMock(competitionRow: {
  id: string;
  team_id: string;
  title: string;
  date: string;
  place: string | null;
  entry_status: string;
}) {
  // 任意のテーブル/任意の長さの `.eq()` チェーンを許容する汎用ビルダー。
  // `.eq(col, value)` 呼び出しをすべて蓄積し、渡された `row` の値と厳密一致するかで
  // 「実際に Postgres の WHERE 句を通したら見えるはずの行か」を模擬する。
  function buildRowFilteredBuilder(row: Record<string, unknown> | null) {
    const eqCalls: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, value: unknown) => {
      eqCalls.push([col, value]);
      return builder;
    });
    const resolve = () => {
      if (!row) return Promise.resolve({ data: null, error: null });
      const matches = eqCalls.every(([col, value]) => row[col] === value);
      return Promise.resolve(matches ? { data: row, error: null } : { data: null, error: null });
    };
    builder.single = vi.fn(resolve);
    builder.maybeSingle = vi.fn(resolve);
    return builder;
  }

  // team-1 (自チーム) には member-1 が有効な一般メンバーとして所属している、という
  // 常に成立する行を用意する (このテストの主眼は competitions 側の team_id スコープ
  // なので、membership 側は常に解決できるようにしてノイズを排除する)。
  const membershipRow = { team_id: "team-1", user_id: "member-1", is_active: true, role: "user" };

  const from = vi.fn((table: string) => {
    if (table === "competitions") return buildRowFilteredBuilder(competitionRow);
    if (table === "team_memberships") return buildRowFilteredBuilder(membershipRow);
    return buildRowFilteredBuilder(null);
  });
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "member-1" } } }),
    },
  };
}

let currentAuthMock: { supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitionEntryModal from "@/components/team/TeamCompetitionEntryModal";

describe("TeamCompetitionEntryModal — 他管理者作成のチーム大会", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 旧バグの前提条件を固定: 個人スコープの getCompetitions は対象大会を含まない
    mocks.getCompetitions.mockResolvedValue([]);
    mocks.getEntriesByCompetition.mockResolvedValue([]);
    mocks.updateCompetition.mockResolvedValue({});
  });

  it("[V-09] 非admin: 他管理者が作成したチーム大会でも「大会が見つかりません」エラーにならず、大会情報が表示される", async () => {
    currentAuthMock = {
      supabase: buildSupabaseMock({
        competitions: { data: OTHER_ADMIN_COMPETITION_ROW, error: null },
        team_memberships: { data: { role: "user" }, error: null },
      }),
    };

    render(
      <TeamCompetitionEntryModal
        isOpen={true}
        onClose={vi.fn()}
        competitionId="comp-other-admin"
        competitionTitle="他管理者大会"
        teamId="team-1"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId("team-competition-entry-error")).not.toBeInTheDocument();
    expect(screen.queryByText("大会が見つかりません")).not.toBeInTheDocument();
    // ステータスラベル (entry_status='open' -> 非adminは span 表示) が出ている = データ取得成功
    expect(screen.getByText("受付中")).toBeInTheDocument();
  });

  it("[V-10] admin: 他管理者が作成したチーム大会でもステータス変更 (updateCompetition) が成功する", async () => {
    currentAuthMock = {
      supabase: buildSupabaseMock({
        competitions: { data: OTHER_ADMIN_COMPETITION_ROW, error: null },
        team_memberships: { data: { role: "admin" }, error: null },
      }),
    };
    const user = userEvent.setup();

    render(
      <TeamCompetitionEntryModal
        isOpen={true}
        onClose={vi.fn()}
        competitionId="comp-other-admin"
        competitionTitle="他管理者大会"
        teamId="team-1"
      />,
    );

    await screen.findByTestId("team-competition-entry-status-select");
    expect(screen.queryByTestId("team-competition-entry-error")).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByTestId("team-competition-entry-status-select"),
      "closed",
    );

    await waitFor(() => {
      expect(mocks.updateCompetition).toHaveBeenCalledWith("comp-other-admin", {
        entry_status: "closed",
      });
    });
    expect(screen.queryByTestId("team-competition-entry-error")).not.toBeInTheDocument();
  });

  it("[V-14] 別チームが所有する大会 ID を渡されても、その大会情報を表示しない (team_id スコープの検証)", async () => {
    // 実データ: この大会は "team-2" が所有する。しかしモーダルには自分のチーム
    // "team-1" として開かれる (URL 改竄や別チームの competitionId 混入を想定)。
    currentAuthMock = {
      supabase: buildRowFilteringSupabaseMock({
        id: "comp-belongs-to-team-2",
        team_id: "team-2",
        title: "他チーム限定大会",
        date: "2099-01-01",
        place: "他チーム会場",
        entry_status: "open",
      }),
    };

    render(
      <TeamCompetitionEntryModal
        isOpen={true}
        onClose={vi.fn()}
        competitionId="comp-belongs-to-team-2"
        competitionTitle="他チーム限定大会"
        teamId="team-1"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    });

    // team_id が一致しないため「大会が見つかりません」に倒れ、他チームの大会内容
    // (受付ステータス等) が一切画面に出ないこと。
    expect(screen.getByTestId("team-competition-entry-error")).toBeInTheDocument();
    expect(screen.queryByText("受付中")).not.toBeInTheDocument();
  });
});
