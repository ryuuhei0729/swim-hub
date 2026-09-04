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
 *
 * 【[V-D4C-04] は本ファイルから移動した (PM裁定, 2026-09-01)】
 * 旧 [V-D4C-04] (「RecordAPI.createRecord が reject した場合、エラーメッセージが
 * 表示される」) は、過去スプリントの Reviewer Critical #1 (見せかけのエラー
 * ハンドリング = catch 内で console.error のみでユーザーに通知されない) を是正する
 * ために書かれ、その是正策として「一覧側の既存 error state を再利用し
 * `<p className="text-red-600 ...">{error}</p>` で表示する」設計が選ばれた
 * (翻訳キー `teams.competitions.selfRecordSaveFailed` も当時この目的で追加提案された)。
 *
 * しかしこのテストは本ファイル冒頭で `RecordLogForm` を丸ごとスタブ化しており
 * (旧: 下記 vi.mock)、スタブの送信ボタンは await/try-catch を持たない
 * `onClick={() => props.onSubmit(...)}` だった。実際には本番の RecordLogForm は
 * `fixed inset-0 z-70` の全画面モーダルとして開いたままであり、一覧側の setError は
 * そのモーダルの裏に隠れて常に見えない (Reviewer 実測)。さらに旧
 * `handleSelfRecordSubmit` が throw しないことで、RecordLogForm.tsx の
 * `resetUnsavedChanges()` が保存失敗時にも実行され、未保存ガードが外れてユーザーが
 * 入力を黙って失うデータロスがあった。「スタブがモーダルの存在を消したことで、
 * まさにその欠陥が見えなくなっていた」— モックが本番より緩いパターン。
 *
 * PM 裁定: このテストの「意図」(保存失敗はユーザーに通知される) は正しいが、
 * 検証する経路が誤っていた。実装は `throw err` に修正され (Web Developer)、
 * RecordLogForm 側の formError (モーダル内 role="alert",
 * data-testid="record-form-error") に表示を委ねる設計に変わった。この意図は
 * `RecordLogForm` をスタブ化せず実コンポーネントを通す
 * `TeamCompetitionsSelfRecordSubmitErrorInModal.test.tsx` (`[V-CRIT-01]`〜
 * `[V-CRIT-03]`) に、より忠実な経路として引き継がれている。次に誰かが
 * 「一覧領域への setError」方式に戻そうとした場合、そのファイルが red になり
 * 検知する。
 *
 * 翻訳キー `teams.competitions.selfRecordSaveFailed` は上記の経緯により
 * production コードから既に参照されなくなっている (throw への変更時点で唯一の
 * 呼び出し箇所が削除された)。未使用キーが JSON に残る影響は無害と判断し、
 * 5言語パリティのリスクを負ってまで削除はしない (i18n JSON は編集しない)。
 *
 * 【useAuth モックの安定性についての注記】(Reviewer Critical #2 の根本原因の是正)
 * 旧実装は `vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ ..., supabase:
 * buildSupabaseMock() }) }))` のように useAuth 呼び出しのたびに新しい supabase 参照を
 * 生成していた。production 側の useEffect 依存に supabase を含めると再レンダーごとに
 * 参照が変わり無限再取得ループになるため、TeamCompetitionsAdminActions.test.tsx と同じ
 * 「module scope の変数を beforeEach で1回だけ構築する」安定パターンに統一する。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
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

  // [V-D4C-04] はこのファイルから移動した。ファイル冒頭のコメント (PM裁定,
  // 2026-09-01) を参照。移動先: TeamCompetitionsSelfRecordSubmitErrorInModal.test.tsx
  // ([V-CRIT-01]〜[V-CRIT-03], 実 RecordLogForm を通す経路で検証)。
});
