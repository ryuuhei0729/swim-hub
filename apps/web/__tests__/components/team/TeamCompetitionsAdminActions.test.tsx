/**
 * TeamCompetitions 管理者向け編集・削除ボタンテスト (Sprint Contract D3)
 *
 * D3: components/team/TeamCompetitions.tsx に admin 向け編集(既存 CompetitionBasicForm の
 * editData prop 再利用)・削除(components/ui/DeleteConfirmModal 再利用) を追加する。
 * 共有API TeamRecordsAPI.update/remove (competitions テーブル操作) は実装済み。
 * 非adminには非表示。既存のカードクリック(記録一覧モーダルを開く canViewRecords 分岐)を
 * 壊さない (e.stopPropagation() 必須)。
 *
 * Sprint Contract 検証観点:
 *   [V-D3C-01] admin: カードに編集ボタンが表示される
 *   [V-D3C-02] admin: 編集ボタン押下で CompetitionBasicForm が editData 付きで開き、
 *              記録一覧モーダル (canViewRecords 時の onClick) は発火しない
 *   [V-D3C-03] admin: 削除ボタン押下で DeleteConfirmModal が開く (即削除しない)
 *   [V-D3C-04] admin: 削除確認で TeamRecordsAPI.remove(id) が呼ばれ、一覧が再取得される
 *   [V-D3C-05] admin: 削除キャンセルでは remove が呼ばれない
 *   [V-D3C-06] 非admin: 編集/削除ボタンが表示されない
 *   [V-D3C-07] admin: 更新(TeamRecordsAPI.update)が reject した場合、エラーメッセージが表示される
 *   [V-D3C-08] admin: 作成(TeamRecordsAPI.create)が reject した場合、エラーメッセージが表示される
 *   [V-D3C-09] admin: 削除(TeamRecordsAPI.remove)が reject した場合、エラーメッセージが表示される
 *
 * 【セレクタ提案】TeamPracticesAdminActions.test.tsx と同様、既存カードが
 * role="button" + 「〜の記録を閲覧」等の aria-label を持ち得るため、新規ボタンは
 * data-testid="team-competition-edit-button" / "team-competition-delete-button" を
 * 実装要件として提案する。
 *
 * 【jsdom 描画リスクに関するメモ】
 * TeamCompetitions も react-query を使わない単純な useState+useEffect+直接supabase実装。
 * TeamCompetitionEntryModal / TeamCompetitionRecordsModal / CompetitionBasicForm は
 * 本テストの関心事ではないためモックする。ただし V-D3C-07/08 の検証には
 * CompetitionBasicForm スタブから onSubmit を発火させる手段が必要なため、
 * スタブに送信トリガー用ボタン(data-testid="competition-basic-form-submit")を追加する。
 *
 * 【V-D3C-07〜09 のエラー表示契約】(Reviewer Critical #1 の是正: 見せかけのエラーハンドリング)
 * 手本は既存の TeamPractices.tsx (practiceForm.updateFailed 等) と同じ設計:
 * 例外は catch 内で `setError(...)` に積まれ、既存の一覧エラー表示
 * (`<p className="text-red-600 ...">{error}</p>` + 再試行ボタン) で描画される
 * (=一覧読み込み失敗時と同じ error state を再利用する)。
 * 翻訳キーは既存の `teams.competitionForm.createFailed`(既存キー、全ロケール定義済み)
 * を作成失敗に流用し、更新/削除失敗用に以下の新規キーを同じ命名規則で追加することを
 * 実装要件として提案する(ja のみ記載、他ロケールも同様の対応が必要):
 *   - `teams.competitionForm.updateFailed` = "チーム大会の更新に失敗しました"
 *   - `teams.competitionForm.deleteFailed` = "チーム大会の削除に失敗しました"
 *
 * NOTE: D3 未実装のため [V-D3C-01]〜[V-D3C-05] は赤になる想定。
 * V-D3C-07〜09 は Developer 未対応(setError 呼び出し無し)のため現時点では赤になる想定
 * (=契約テスト。実装後に緑化する)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: mocks.update,
    remove: mocks.remove,
    create: mocks.create,
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const RAW_COMPETITION_ROW = {
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
  records: [],
  entries: [],
};

function buildSupabaseMock(rows: typeof RAW_COMPETITION_ROW[]) {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

// V-D3C-07/08 の検証用に、実際に onSubmit を発火できる送信ボタンを持つスタブ。
// basicData の中身はテストの関心事ではないため固定のダミー値を渡す。
const STUB_BASIC_DATA = {
  date: "2026-08-01",
  endDate: "",
  title: "県大会",
  place: "県営プール",
  poolType: 0,
  note: "",
};

vi.mock("@/components/forms/CompetitionBasicForm", () => ({
  default: (props: {
    isOpen: boolean;
    editData?: { title?: string | null };
    onSubmit: (basicData: typeof STUB_BASIC_DATA) => void | Promise<void>;
  }) =>
    props.isOpen ? (
      <div data-testid="competition-basic-form-stub">
        {props.editData ? `edit:${props.editData.title ?? ""}` : "create"}
        <button
          type="button"
          data-testid="competition-basic-form-submit"
          onClick={() => props.onSubmit(STUB_BASIC_DATA)}
        >
          送信
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions — 管理者向け編集・削除 (D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remove.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue({});
    currentAuthMock = {
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([RAW_COMPETITION_ROW]),
    };
  });

  it("[V-D3C-01] admin: 大会カードに編集ボタンが表示される", async () => {
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("県大会");
    expect(screen.getByTestId("team-competition-edit-button")).toBeInTheDocument();
  });

  it("[V-D3C-02] admin: 編集ボタン押下で CompetitionBasicForm が editData 付きで開く", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
    await screen.findByText("県大会");

    await user.click(screen.getByTestId("team-competition-edit-button"));

    expect(await screen.findByTestId("competition-basic-form-stub")).toHaveTextContent(
      "edit:県大会",
    );
    // 記録一覧モーダルは呼ばれていない(canViewRecords onClick と混線していない)ことの傍証
    expect(screen.queryByText(/記録一覧/)).not.toBeInTheDocument();
  });

  it("[V-D3C-03] admin: 削除ボタン押下で確認モーダルが開く (即削除しない)", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
    await screen.findByText("県大会");

    await user.click(screen.getByTestId("team-competition-delete-button"));

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("[V-D3C-04] admin: 削除確認で TeamRecordsAPI.remove(id) が呼ばれ、一覧が再取得される", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
    await screen.findByText("県大会");

    await user.click(screen.getByTestId("team-competition-delete-button"));
    await user.click(screen.getByTestId("confirm-delete-button"));

    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith("competition-1");
    });
  });

  it("[V-D3C-05] admin: 削除キャンセルでは remove が呼ばれない", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
    await screen.findByText("県大会");

    await user.click(screen.getByTestId("team-competition-delete-button"));
    await user.click(screen.getByTestId("cancel-delete-button"));

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("[V-D3C-06] 非admin: 編集/削除ボタンが表示されない", async () => {
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseMock([RAW_COMPETITION_ROW]),
    };
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await screen.findByText("県大会");

    expect(screen.queryByTestId("team-competition-edit-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-competition-delete-button")).not.toBeInTheDocument();
  });

  it(
    "[V-D3C-07] admin: TeamRecordsAPI.update が reject した場合、" +
      "翻訳済みエラーメッセージ(teams.competitionForm.updateFailed)が表示される",
    async () => {
      mocks.update.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
      await screen.findByText("県大会");

      await user.click(screen.getByTestId("team-competition-edit-button"));
      await screen.findByTestId("competition-basic-form-stub");
      await user.click(screen.getByTestId("competition-basic-form-submit"));

      await waitFor(() => {
        expect(mocks.update).toHaveBeenCalled();
      });
      expect(await screen.findByText("チーム大会の更新に失敗しました")).toBeInTheDocument();
    },
  );

  it(
    "[V-D3C-08] admin: TeamRecordsAPI.create が reject した場合、" +
      "翻訳済みエラーメッセージ(teams.competitionForm.createFailed、既存キー)が表示される",
    async () => {
      mocks.create.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
      await screen.findByText("県大会");

      await user.click(screen.getByRole("button", { name: "大会追加" }));
      await screen.findByTestId("competition-basic-form-stub");
      await user.click(screen.getByTestId("competition-basic-form-submit"));

      await waitFor(() => {
        expect(mocks.create).toHaveBeenCalled();
      });
      expect(await screen.findByText("チーム大会の作成に失敗しました")).toBeInTheDocument();
    },
  );

  it(
    "[V-D3C-09] admin: TeamRecordsAPI.remove が reject した場合、" +
      "翻訳済みエラーメッセージ(teams.competitionForm.deleteFailed)が表示される",
    async () => {
      mocks.remove.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
      await screen.findByText("県大会");

      await user.click(screen.getByTestId("team-competition-delete-button"));
      await user.click(screen.getByTestId("confirm-delete-button"));

      await waitFor(() => {
        expect(mocks.remove).toHaveBeenCalled();
      });
      expect(await screen.findByText("チーム大会の削除に失敗しました")).toBeInTheDocument();
    },
  );
});
