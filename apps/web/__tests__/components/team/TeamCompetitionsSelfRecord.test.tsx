/**
 * TeamCompetitions 一般メンバー自己記録導線テスト (Sprint Contract D4)
 *
 * D4: TeamCompetitions.tsx に「自分の記録を追加」ボタンを追加し、
 * components/forms/record-log/RecordLogForm.tsx を competitionId 指定で開く。
 * RecordLogForm は (usePracticeStore のような) 共有 Zustand タブモーダルストアを
 * 経由しないローカル状態のモーダルであるため、D4 の TeamPractices で必要な
 * closeAll() 安全策は本コンポーネントには不要 (Sprint Contract の対象外)。
 *
 * Sprint Contract 検証観点:
 *   [V-D4C-01] 非admin(一般メンバー): 「自分の記録を追加」ボタンが表示される
 *   [V-D4C-02] ボタン押下で RecordLogForm が開き、対象の competitionId が渡される
 *   [V-D4C-03] admin でも「自分の記録を追加」ボタンが表示される (既存の管理者向け
 *              「記録入力」ボタンとは別に共存する)
 *   [V-D4C-04] RecordAPI.createRecord が reject した場合、エラーメッセージが表示される
 *
 * 【V-D4C-04 のエラー表示契約】(Reviewer Critical #1 の是正: 見せかけのエラーハンドリング)
 * TeamCompetitions.tsx の handleSelfRecordSubmit は現状 catch 内で console.error のみで
 * setError を呼ばないため、失敗してもユーザーに一切通知されない。手本は
 * TeamPractices.tsx / TeamCompetitionsAdminActions.test.tsx の V-D3C-07〜09 と同じ設計
 * (一覧側の既存 error state を再利用し `<p className="text-red-600 ...">{error}</p>` で
 * 描画)。翻訳キーは新規に `teams.competitions.selfRecordSaveFailed` の追加を実装要件として
 * 提案する(ja: "自分の記録の保存に失敗しました"。他ロケールも同様の対応が必要)。
 *
 * 【useAuth モックの安定性についての注記】(Reviewer Critical #2 の根本原因の是正)
 * 旧実装は `vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ ..., supabase:
 * buildSupabaseMock() }) }))` のように useAuth 呼び出しのたびに新しい supabase 参照を
 * 生成していた。production 側の useEffect 依存に supabase を含めると再レンダーごとに
 * 参照が変わり無限再取得ループになるため、TeamCompetitionsAdminActions.test.tsx と同じ
 * 「module scope の変数を beforeEach で1回だけ構築する」安定パターンに統一する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  getStyles: vi.fn(),
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
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: mocks.getStyles,
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));

// V-D4C-04 の検証用に、実際に onSubmit を発火できる送信ボタンを持つスタブ。
// formData の中身はテストの関心事ではないため、有効なダミー値を渡す。
const STUB_RECORD_FORM_DATA = [
  {
    styleId: "1",
    time: 60,
    isRelaying: false,
    splitTimes: [],
    note: "",
    reactionTime: "",
  },
];

vi.mock("@/components/forms/record-log/RecordLogForm", () => ({
  default: (props: {
    isOpen: boolean;
    competitionId?: string;
    onSubmit: (formDataList: typeof STUB_RECORD_FORM_DATA) => void | Promise<void>;
  }) =>
    props.isOpen ? (
      <div data-testid="record-log-form-stub">
        competitionId:{props.competitionId ?? ""}
        <button
          type="button"
          data-testid="record-log-form-submit"
          onClick={() => props.onSubmit(STUB_RECORD_FORM_DATA)}
        >
          送信
        </button>
      </div>
    ) : null,
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

function buildSupabaseMock() {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) return { eq: () => Promise.resolve({ count: 1, error: null }) };
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: [RAW_COMPETITION_ROW], error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

// useAuth() が呼ばれるたびに新しい supabase 参照を生成すると、production 側の
// useEffect 依存に supabase を含めた場合に無限再取得ループを誘発する
// (TeamCompetitionsAdminActions.test.tsx と同じ安定パターンに統一)。
let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions — 自己記録導線 (D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.getStyles.mockResolvedValue([]);
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseMock(),
    };
  });

  it("[V-D4C-01] 非admin: 「自分の記録を追加」ボタンが表示される", async () => {
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await screen.findByText("県大会");

    expect(
      screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }),
    ).toBeInTheDocument();
  });

  it("[V-D4C-02] ボタン押下で RecordLogForm が対象の competitionId 付きで開く", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await screen.findByText("県大会");

    await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));

    const stub = await screen.findByTestId("record-log-form-stub");
    expect(stub).toHaveTextContent("competitionId:competition-1");
  });

  it("[V-D4C-03] admin でも「自分の記録を追加」ボタンが表示される (管理者用ボタンと共存)", async () => {
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
    await screen.findByText("県大会");

    expect(
      screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }),
    ).toBeInTheDocument();
    // 既存の管理者向け「記録入力」ボタンも引き続き存在する
    expect(screen.getByText("記録入力")).toBeInTheDocument();
  });

  it(
    "[V-D4C-04] RecordAPI.createRecord が reject した場合、" +
      "翻訳済みエラーメッセージ(teams.competitions.selfRecordSaveFailed)が表示される",
    async () => {
      mocks.createRecord.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("県大会");

      await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
      await screen.findByTestId("record-log-form-stub");
      await user.click(screen.getByTestId("record-log-form-submit"));

      await waitFor(() => {
        expect(mocks.createRecord).toHaveBeenCalled();
      });
      expect(
        await screen.findByText("自分の記録の保存に失敗しました"),
      ).toBeInTheDocument();
    },
  );
});
