/**
 * TeamCompetitions — 自己記録導線: 保存失敗時のエラー表示・未保存ガード (Reviewer Critical 回帰テスト)
 *
 * 【経緯 (このテストの前身)】
 * 旧テスト `TeamCompetitionsSelfRecord.test.tsx` の [V-D4C-04] は、過去スプリントの
 * Reviewer Critical (「見せかけのエラーハンドリング」= catch 内で console.error のみで
 * ユーザーに一切通知されない) を是正するために書かれ、その是正策として
 * 「handleSelfRecordSubmit の catch で setError() を呼び、一覧領域にエラー文字列を
 * 表示する」設計が選ばれた。
 *
 * 【今回のPM裁定: その是正策自体が無効だったと判明】
 * 旧テストは `RecordLogForm` を `vi.mock` で完全にスタブ化しており、スタブの送信
 * ボタンは `onClick={() => props.onSubmit(...)}` で await も try/catch もしていない
 * ため、テスト環境には「モーダル」自体が存在しなかった。だから一覧領域の setError
 * 文字列が問題なく検証できていた。
 *
 * しかし本番の `RecordLogForm` は `fixed inset-0 z-70` の全画面モーダルとして開いた
 * ままであり、setError の表示先 (`loading ? ... : error ? (...) : リスト` の分岐で
 * リスト領域を差し替えるブロック) は常にこのモーダルの裏に隠れて見えない
 * (Reviewer 実測)。さらに `handleSelfRecordSubmit` が throw しないため、
 * `RecordLogForm.tsx:216-217` の `await onSubmit(...); resetUnsavedChanges();` が
 * 保存失敗時にも実行されてしまい、未保存ガードが外れてユーザーが入力を黙って失う
 * (データロス)。「スタブがモーダルを消したことで、まさにその欠陥が見えなくなっていた」
 * — モックが本番より緩いパターン。
 *
 * 【今回の修正 (Web Developer)】
 * `handleSelfRecordSubmit` の catch を `setError(...)` から `throw err` に変更し、
 * `RecordLogForm.tsx` 側の `formError` (モーダル内 role="alert", data-testid=
 * "record-form-error") にエラー表示を委ねる。throw することで `resetUnsavedChanges()`
 * は保存失敗時に実行されなくなり、未保存ガードが維持される。
 *
 * このテストは旧 [V-D4C-04] の「意図」(保存失敗はユーザーに通知される) を引き継ぎ、
 * `RecordLogForm` をスタブ化せず実コンポーネントを通す経路で検証する。
 * 次に誰かが「一覧領域への setError」方式に戻そうとした場合、このテストが red になる
 * ことでそれを止める。
 *
 * Sprint Contract 検証観点:
 *   [V-CRIT-01] 保存失敗時 (生の DB エラー): モーダル内 (data-testid="record-form-error")
 *               に汎用エラーメッセージが表示され (生の DB エラー文字列は表示されない)、
 *               モーダル (data-testid="record-form-modal") は閉じない
 *   [V-CRIT-01B] 保存失敗時 (UserFacingError): i18n 済みのユーザー提示用メッセージは
 *               そのまま表示される
 *   [V-CRIT-02] 保存失敗時: 未保存ガードが維持される (閉じようとすると確認ダイアログが出る)
 *   [対照] [V-CRIT-03] 保存成功時: モーダルが閉じ、確認ダイアログは出ない (ガードは
 *               問題にならない)
 *
 * onSubmit (= handleSelfRecordSubmit) は無条件 reject するモックにしない。
 * DB 書き込み境界 (RecordAPI.createRecord) のみを reject させ、実際の
 * handleSelfRecordSubmit → RecordLogForm.handleSubmit の経路を通す。
 *
 * 【追記 (PM裁定: Warning 1 修正に伴う更新)】
 * `RecordLogForm` は `toUserFacingMessage(error, tCommon("error"))` で catch した
 * error を表示用文字列に変換するようになった。`UserFacingError` (i18n 済みメッセージ)
 * ならそのメッセージを、それ以外の生の `Error` (生の DB/RLS エラーのシミュレーション)
 * は `common.error` (「エラーが発生しました」) にフォールバックする。
 * [V-CRIT-01] は生の `Error("network down")` を投げるケースなので、期待値を
 * 汎用メッセージに更新し、「network down という文字列自体が画面に出ない」ことを
 * 明示的に assert する (情報露出が閉じたことの回帰テスト)。[V-CRIT-01B] は
 * `UserFacingError` を投げるケースを新設し、そのメッセージがそのまま表示される
 * ことを確認する (見せてよいメッセージは通ることの対照)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";
import { UserFacingError } from "@apps/shared/utils/userFacingError";

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

// DB 書き込み境界のみをモックする。handleSelfRecordSubmit 自体はモックしない
// (実際のハンドラを通し、throw 伝播と resetUnsavedChanges 未実行を実測する)。
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

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
// RecordLogForm 内部の VideoUploader は dynamic import + ssr:false のため jsdom で不要
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));
// useBestTimes はこのテストの関心事ではないため空実装に固定 (実 RecordLogForm を使う
// ための最小限のバイパスであり、検証対象の formError / モーダル維持ロジックには関与しない)
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

// 実 RecordLogForm を通す (スタブ化しない)。これが旧 [V-D4C-04] との決定的な違い。
import TeamCompetitions from "@/components/team/TeamCompetitions";

const ROW = {
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
  entries: [
    { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
  ],
};

const openSelfRecordFormAndEnterTime = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText("県大会");
  await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
  await screen.findByTestId("record-form-modal");

  const timeInput = await screen.findByTestId("record-time-1");
  await user.type(timeInput, "31.20");
  await user.tab();
  return timeInput;
};

describe("TeamCompetitions — 自己記録導線: 保存失敗時のエラー表示・未保存ガード (Critical 回帰)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseCompetitionsMock([ROW]).supabase,
      subscription: null,
    };
  });

  it(
    "[V-CRIT-01] 保存失敗時 (生の DB エラー)、モーダル内 (record-form-error) に" +
      "汎用エラーメッセージが表示され (生の DB エラー文字列は露出しない)、" +
      "モーダル (record-form-modal) は閉じない",
    async () => {
      // 生の Error = 生の DB/RLS エラーのシミュレーション。UserFacingError ではないため
      // toUserFacingMessage は fallback (common.error) を返すはず。
      mocks.createRecord.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordFormAndEnterTime(user);

      await user.click(screen.getByTestId("save-record-button"));

      await waitFor(() => {
        expect(mocks.createRecord).toHaveBeenCalled();
      });

      // モーダル内 (RecordLogForm の formError) にエラーが表示される。
      // 旧設計 (一覧領域の setError) はモーダルの裏に隠れて見えなかった。
      const errorAlert = await screen.findByTestId("record-form-error");
      expect(errorAlert).toHaveTextContent("エラーが発生しました");

      // 最重要: 生の DB エラー文字列がそのまま画面に出ていないこと
      // (情報露出が閉じたことの回帰テスト)。
      expect(errorAlert).not.toHaveTextContent("network down");
      expect(screen.queryByText(/network down/)).not.toBeInTheDocument();

      // モーダル自体は閉じない (DOM に残る)。
      expect(screen.getByTestId("record-form-modal")).toBeInTheDocument();
    },
  );

  it(
    "[V-CRIT-01B] 保存失敗時 (UserFacingError = i18n 済みメッセージ)、" +
      "そのメッセージがそのまま record-form-error に表示される",
    async () => {
      // UserFacingError は「ユーザーに見せてよい」と型で表明されたメッセージであり、
      // toUserFacingMessage はこれを fallback せずそのまま通す。
      mocks.createRecord.mockRejectedValueOnce(
        new UserFacingError("テスト用の翻訳済みメッセージ"),
      );
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordFormAndEnterTime(user);

      await user.click(screen.getByTestId("save-record-button"));

      await waitFor(() => {
        expect(mocks.createRecord).toHaveBeenCalled();
      });

      const errorAlert = await screen.findByTestId("record-form-error");
      expect(errorAlert).toHaveTextContent("テスト用の翻訳済みメッセージ");

      // モーダル自体は閉じない (DOM に残る)。
      expect(screen.getByTestId("record-form-modal")).toBeInTheDocument();
    },
  );

  it(
    "[V-CRIT-02] 保存失敗時、未保存ガードが維持される " +
      "(閉じようとすると確認ダイアログが出る = resetUnsavedChanges() は実行されていない)",
    async () => {
      mocks.createRecord.mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordFormAndEnterTime(user);

      await user.click(screen.getByTestId("save-record-button"));
      await screen.findByTestId("record-form-error");

      // モーダルを閉じようとする (フッターの「キャンセル」ボタン)。
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      // hasUnsavedChanges が保存失敗後も true のままなら確認ダイアログが表示される。
      // resetUnsavedChanges() が (誤って) 実行されていれば、このダイアログは出ずに
      // 即座にモーダルが閉じてしまう (= データロス)。
      const confirmDialog = await screen.findByRole("dialog");
      expect(confirmDialog).toHaveTextContent("入力内容が保存されていません");

      // 確認ダイアログでキャンセルすればモーダルは維持される (入力内容は失われない)。
      await user.click(screen.getByRole("button", { name: "編集を続ける" }));
      expect(screen.getByTestId("record-form-modal")).toBeInTheDocument();
      expect(screen.getByTestId("record-time-1")).toHaveValue("31.20");
    },
  );

  it(
    "[対照][V-CRIT-03] 保存成功時、モーダルが閉じ、確認ダイアログは出ない",
    async () => {
      mocks.createRecord.mockResolvedValueOnce({ id: "record-new" });
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordFormAndEnterTime(user);

      await user.click(screen.getByTestId("save-record-button"));

      await waitFor(() => {
        expect(mocks.createRecord).toHaveBeenCalled();
      });

      // 保存成功時は親 (TeamCompetitions) が handleCloseSelfRecordForm() を呼ぶため、
      // モーダルはそのまま閉じる (失敗時と対照的)。
      await waitFor(() => {
        expect(screen.queryByTestId("record-form-modal")).not.toBeInTheDocument();
      });
      // 閉じるのを妨げる確認ダイアログは出ない。
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // エラー表示も出ない。
      expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    },
  );
});
