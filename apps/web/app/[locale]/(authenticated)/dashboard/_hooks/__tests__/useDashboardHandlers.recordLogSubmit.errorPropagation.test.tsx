/**
 * useDashboardHandlers.handleRecordLogSubmit — 実際の呼び出し元 (RecordLogForm) を
 * 通した失敗系の回帰テスト。
 *
 * 背景 (Reviewer Critical, PM裁定によりQAが追加):
 * 「テストが1件でも『実際の呼び出し元を通した失敗系』を書いていれば、デッドコードは
 * 一撃で発覚したはず」という指摘への対応。onSubmit を無条件にモックして直接
 * resolve/reject させるだけのテストでは、useDashboardHandlers 内部の
 * catch { throw error } / closeRecordLogForm() の呼び出し位置(成功パスのみか、
 * finally で無条件かどうか)を一切通らないため、そこにデッドコード(あるいは退行)が
 * あっても検知できない。
 *
 * このテストは:
 *  - 本物の useDashboardHandlers フックを実際に呼び出す (テスト側で挙動を再実装しない)
 *  - 本物の RecordLogForm を render し、ユーザー操作(入力→保存クリック)を経由する
 *  - DB書き込み層に相当する createRecord だけをモックし、reject させる
 * という構成で、rethrow が正しく行われ、モーダルが無言で閉じないことを検証する。
 *
 * 【追記 (PM裁定: Warning 1 修正に伴う更新)】
 * `RecordLogForm` は catch した error を `toUserFacingMessage(error, tCommon("error"))`
 * で表示用文字列に変換するようになった。生の `Error` (生の DB エラーのシミュレーション)
 * は `common.error` (「エラーが発生しました」) にフォールバックする。期待値を汎用
 * メッセージに更新し、生のエラー文字列が画面に出ないことを assert する。
 */
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n } from "../../../../../../__tests__/utils/render";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useDashboardHandlers } from "../useDashboardHandlers";
import RecordLogForm from "@/components/forms/record-log/RecordLogForm";
import type { StyleOption } from "@/components/forms/record-log/types";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "user-1" },
    subscription: null,
  }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

// 50m自由形 (distance=50) — findDefaultStyleId が自動選択する既定種目と一致させ、
// テスト内でユーザーが種目選択UIを操作しなくても済むようにする
const STYLE_FR50: StyleOption = { id: 1, nameJp: "50m自由形", distance: 50 };

/**
 * handleRecordLogSubmit の新規作成パスが唯一直接叩く supabase テーブル
 * (competitions.pool_type 取得) のみを実装したフェイク。createRecord 呼び出しの
 * 手前で必ず成功させ、reject/resolve の分岐が createRecord 自身に起因することを
 * はっきりさせる。
 */
function createFakeSupabase() {
  return {
    from: (table: string) => {
      if (table === "competitions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { pool_type: 0 }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`このテストでは想定していないテーブルへのアクセス: ${table}`);
    },
  };
}

function Harness({
  createRecord,
  closeRecordLogFormSpy,
}: {
  createRecord: (record: unknown) => Promise<unknown>;
  closeRecordLogFormSpy: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const { handleRecordLogSubmit } = useDashboardHandlers({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: createFakeSupabase() as any,
    user: { id: "user-1" },
    styles: [],
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    createPracticeLog: vi.fn(),
    updatePracticeLog: vi.fn(),
    deletePracticeLog: vi.fn(),
    createPracticeTime: vi.fn(),
    deletePracticeTime: vi.fn(),
    deletePractice: vi.fn(),
    deleteRecord: vi.fn(),
    deleteEntry: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createRecord: createRecord as any,
    updateRecord: vi.fn(),
    createCompetition: vi.fn(),
    updateCompetition: vi.fn(),
    deleteCompetition: vi.fn(),
    createSplitTimes: vi.fn(),
    replaceSplitTimes: vi.fn(),
    editingData: null,
    createdPracticeId: null,
    competitionEditingData: null,
    createdCompetitionId: "comp-1",
    setPracticeLoading: vi.fn(),
    setCompetitionLoading: vi.fn(),
    closePracticeBasicForm: vi.fn(),
    closePracticeLogForm: vi.fn(),
    closeCompetitionBasicForm: vi.fn(),
    closeEntryLogForm: vi.fn(),
    closeRecordLogForm: () => {
      closeRecordLogFormSpy();
      setIsOpen(false);
    },
    openPracticeLogForm: vi.fn(),
    setCreatedEntries: vi.fn(),
    openEntryLogForm: vi.fn(),
    openRecordLogForm: vi.fn(),
    refreshCalendar: vi.fn(),
    closePracticeTabModal: vi.fn(),
    closeCompetitionTabModal: vi.fn(),
    setEditingPracticeId: vi.fn(),
    setEditingCompetitionId: vi.fn(),
  });

  return (
    <RecordLogForm
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onSubmit={handleRecordLogSubmit}
      competitionId="comp-1"
      styles={[STYLE_FR50]}
    />
  );
}

async function fillValidTimeAndSave(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId("record-entry-section-1");
  await user.type(screen.getByTestId("record-time-1"), "58.00");
  await user.tab();
  await user.click(screen.getByTestId("save-record-button"));
}

describe("useDashboardHandlers.handleRecordLogSubmit — RecordLogForm を通した失敗系", () => {
  beforeEach(() => {
    useCompetitionStore.getState().closeAll();
    usePracticeStore.getState().closeAll();
  });

  it(
    "createRecord が reject すると rethrow され、RecordLogForm に汎用エラーメッセージが" +
      "表示されたまま (生の DB エラー文字列は露出しない) モーダルが閉じない" +
      "(closeRecordLogForm が呼ばれない)",
    async () => {
      const user = userEvent.setup();
      // 生の Error = 生の DB エラーのシミュレーション。UserFacingError ではないため
      // toUserFacingMessage は fallback (common.error) を返すはず。
      const createRecord = vi.fn().mockRejectedValue(new Error("DB書き込みに失敗しました"));
      const closeRecordLogFormSpy = vi.fn();

      renderWithI18n(
        <Harness createRecord={createRecord} closeRecordLogFormSpy={closeRecordLogFormSpy} />,
      );

      await fillValidTimeAndSave(user);

      const errorBox = await screen.findByTestId("record-form-error");
      expect(errorBox).toHaveTextContent("エラーが発生しました");

      // 最重要: 生の DB エラー文字列がそのまま画面に出ていないこと
      // (情報露出が閉じたことの回帰テスト)。
      expect(errorBox).not.toHaveTextContent("DB書き込みに失敗しました");
      expect(screen.queryByText(/DB書き込みに失敗しました/)).not.toBeInTheDocument();

      expect(createRecord).toHaveBeenCalledTimes(1);
      expect(closeRecordLogFormSpy).not.toHaveBeenCalled();
      // モーダルは DOM 上に残ったまま (無言で閉じていない)
      expect(screen.getByTestId("record-form-modal")).toBeInTheDocument();
    },
  );

  it(
    "[対照] createRecord が成功すれば closeRecordLogForm が呼ばれてモーダルが閉じる " +
      "(上のテストが実際に失敗系の差分を検知できることの確認)",
    async () => {
      const user = userEvent.setup();
      const createRecord = vi.fn().mockResolvedValue({ id: "record-1" });
      const closeRecordLogFormSpy = vi.fn();

      renderWithI18n(
        <Harness createRecord={createRecord} closeRecordLogFormSpy={closeRecordLogFormSpy} />,
      );

      await fillValidTimeAndSave(user);

      await waitFor(() => {
        expect(closeRecordLogFormSpy).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId("record-form-modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    },
  );
});
