/**
 * PracticeLogForm — 保存失敗時のエラーハンドリング回帰テスト。
 *
 * 背景 (Reviewer Critical, PM裁定によりQAが追加):
 * 「テストが1件でも『実際の呼び出し元を通した失敗系』を書いていれば、デッドコードは
 * 一撃で発覚したはず」という指摘への対応。
 *
 * [A] 本体の保存 (executeSubmit -> onSubmit): onSubmit をただの reject モックにする
 *     だけでは useDashboardHandlers.handlePracticeLogSubmit 内部の
 *     catch { throw error } / closePracticeLogForm() の呼び出し位置(成功パスのみか、
 *     finally で無条件かどうか)を一切通らないため、本物の useDashboardHandlers を
 *     実際に呼び出し、DB書き込み層 (createPracticeLog) だけを reject させて検証する。
 *
 * [B] テンプレート保存 (handleTemplateSave): PracticeLogForm 自身のローカルな
 *     try/catch で完結しており useDashboardHandlers を経由しないため、
 *     createTemplateMutation の境界だけをモックして失敗させ、エラーが
 *     テンプレート保存モーダル内 (template-save-form-error) に表示されること、
 *     モーダルが閉じないこと、本体の保存 (onSubmit) が呼ばれないことを検証する。
 *
 * 【追記 (PM裁定: Warning 1 修正に伴う更新)】
 * `PracticeLogForm` は catch した error を `toUserFacingMessage(error, tCommon("error"))`
 * で表示用文字列に変換するようになった。生の `Error` (生の DB エラーのシミュレーション)
 * は `common.error` (「エラーが発生しました」) にフォールバックし、`UserFacingError`
 * (i18n 済みメッセージ) のみそのまま表示される。[A] [B] とも生の `Error` を投げる
 * ケースは期待値を汎用メッセージに更新し、生のエラー文字列が画面に出ないことを assert する。
 */
import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n } from "../../../../__tests__/utils/render";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useDashboardHandlers } from "@/app/[locale]/(authenticated)/dashboard/_hooks/useDashboardHandlers";
import PracticeLogForm from "@/components/forms/practice-log/PracticeLogForm";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "user-1" },
    subscription: null,
  }),
}));

vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

// テンプレート選択モーダルは本テストの対象外 (react-query/next-intl navigation への
// 依存を避けるための境界モック。本体フォームの挙動には無関係)。
vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

const mocks = vi.hoisted(() => ({
  createTemplateMutateAsync: vi.fn(),
}));

vi.mock("@swim-hub/shared/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@swim-hub/shared/hooks")>();
  return {
    ...actual,
    useCreatePracticeLogTemplateMutation: () => ({
      mutateAsync: mocks.createTemplateMutateAsync,
      isPending: false,
    }),
  };
});

function DashboardHandlerHarness({
  createPracticeLog,
  closePracticeLogFormSpy,
}: {
  createPracticeLog: (log: unknown) => Promise<unknown>;
  closePracticeLogFormSpy: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const { handlePracticeLogSubmit } = useDashboardHandlers({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    user: { id: "user-1" },
    styles: [],
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createPracticeLog: createPracticeLog as any,
    updatePracticeLog: vi.fn(),
    deletePracticeLog: vi.fn(),
    createPracticeTime: vi.fn(),
    deletePracticeTime: vi.fn(),
    deletePractice: vi.fn(),
    deleteRecord: vi.fn(),
    deleteEntry: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    createCompetition: vi.fn(),
    updateCompetition: vi.fn(),
    deleteCompetition: vi.fn(),
    createSplitTimes: vi.fn(),
    replaceSplitTimes: vi.fn(),
    editingData: null,
    createdPracticeId: "practice-1",
    competitionEditingData: null,
    createdCompetitionId: null,
    setPracticeLoading: vi.fn(),
    setCompetitionLoading: vi.fn(),
    closePracticeBasicForm: vi.fn(),
    closePracticeLogForm: () => {
      closePracticeLogFormSpy();
      setIsOpen(false);
    },
    closeCompetitionBasicForm: vi.fn(),
    closeEntryLogForm: vi.fn(),
    closeRecordLogForm: vi.fn(),
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
    <PracticeLogForm
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onSubmit={handlePracticeLogSubmit}
      practiceId="practice-1"
      availableTags={[]}
      setAvailableTags={() => {}}
    />
  );
}

describe("PracticeLogForm — 本体保存の失敗系 (useDashboardHandlers.handlePracticeLogSubmit を実際に通す)", () => {
  beforeEach(() => {
    usePracticeStore.getState().closeAll();
    useCompetitionStore.getState().closeAll();
  });

  it(
    "createPracticeLog が reject すると rethrow され、practice-log-form-error に" +
      "汎用エラーメッセージが表示されたまま (生の DB エラー文字列は露出しない)" +
      "モーダルが閉じない (closePracticeLogForm が呼ばれない)",
    async () => {
      const user = userEvent.setup();
      // 生の Error = 生の DB エラーのシミュレーション。UserFacingError ではないため
      // toUserFacingMessage は fallback (common.error) を返すはず。
      const createPracticeLog = vi.fn().mockRejectedValue(new Error("練習ログの保存に失敗しました"));
      const closePracticeLogFormSpy = vi.fn();

      renderWithI18n(
        <DashboardHandlerHarness
          createPracticeLog={createPracticeLog}
          closePracticeLogFormSpy={closePracticeLogFormSpy}
        />,
      );

      await screen.findByTestId("practice-log-form-modal");
      await user.click(screen.getByTestId("save-practice-log-button"));

      const errorBox = await screen.findByTestId("practice-log-form-error");
      expect(errorBox).toHaveTextContent("エラーが発生しました");

      // 最重要: 生の DB エラー文字列がそのまま画面に出ていないこと
      // (情報露出が閉じたことの回帰テスト)。
      expect(errorBox).not.toHaveTextContent("練習ログの保存に失敗しました");
      expect(screen.queryByText(/練習ログの保存に失敗しました/)).not.toBeInTheDocument();

      expect(createPracticeLog).toHaveBeenCalledTimes(1);
      expect(closePracticeLogFormSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId("practice-log-form-modal")).toBeInTheDocument();
    },
  );

  it(
    "[対照] createPracticeLog が成功すれば closePracticeLogForm が呼ばれてモーダルが閉じる " +
      "(上のテストが実際に失敗系の差分を検知できることの確認)",
    async () => {
      const user = userEvent.setup();
      const createPracticeLog = vi.fn().mockResolvedValue({ id: "log-1" });
      const closePracticeLogFormSpy = vi.fn();

      renderWithI18n(
        <DashboardHandlerHarness
          createPracticeLog={createPracticeLog}
          closePracticeLogFormSpy={closePracticeLogFormSpy}
        />,
      );

      await screen.findByTestId("practice-log-form-modal");
      await user.click(screen.getByTestId("save-practice-log-button"));

      await waitFor(() => {
        expect(closePracticeLogFormSpy).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId("practice-log-form-modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("practice-log-form-error")).not.toBeInTheDocument();
    },
  );
});

describe("PracticeLogForm — テンプレート保存の失敗系 (createTemplateMutation の境界のみモック)", () => {
  beforeEach(() => {
    mocks.createTemplateMutateAsync.mockReset();
  });

  it("テンプレート保存が失敗すると、テンプレート保存モーダル内に汎用エラーメッセージが表示され" +
    "(生の DB エラー文字列は露出しない)、モーダルは閉じたままにならず、本体の保存 (onSubmit) は呼ばれない", async () => {
    const user = userEvent.setup();
    // 生の Error = 生の DB エラーのシミュレーション。UserFacingError ではないため
    // toUserFacingMessage は fallback (common.error) を返すはず。
    mocks.createTemplateMutateAsync.mockRejectedValue(new Error("テンプレートの保存に失敗しました"));
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithI18n(
      <PracticeLogForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        practiceId="practice-1"
        availableTags={[]}
        setAvailableTags={vi.fn()}
      />,
    );

    await screen.findByTestId("practice-log-form-modal");

    // 「テンプレートとして保存する」をON にしてから保存 → テンプレート保存確認モーダルが開く
    await user.click(screen.getByRole("checkbox", { name: "テンプレートとして保存する" }));
    await user.click(screen.getByTestId("save-practice-log-button"));

    const templateNameInput = await screen.findByLabelText("テンプレート名");
    await user.type(templateNameInput, "テストテンプレート");

    const templateDialog = screen.getByRole("dialog");
    await user.click(within(templateDialog).getByRole("button", { name: "保存" }));

    const templateErrorBox = await screen.findByTestId("template-save-form-error");
    expect(templateErrorBox).toHaveTextContent("エラーが発生しました");

    // 最重要: 生の DB エラー文字列がそのまま画面に出ていないこと
    // (情報露出が閉じたことの回帰テスト)。
    expect(templateErrorBox).not.toHaveTextContent("テンプレートの保存に失敗しました");
    expect(screen.queryByText(/テンプレートの保存に失敗しました/)).not.toBeInTheDocument();

    // テンプレート保存モーダル自体は閉じずに残っている (エラーがモーダル内に表示されている)
    expect(templateNameInput).toBeInTheDocument();
    // テンプレート保存が失敗した以上、本体の練習記録保存 (executeSubmit -> onSubmit) は
    // 呼ばれてはいけない
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("[対照] テンプレート保存が成功すればエラーは出ず、本体の保存 (onSubmit) が呼ばれる", async () => {
    const user = userEvent.setup();
    mocks.createTemplateMutateAsync.mockResolvedValue({ id: "template-1" });
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithI18n(
      <PracticeLogForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        practiceId="practice-1"
        availableTags={[]}
        setAvailableTags={vi.fn()}
      />,
    );

    await screen.findByTestId("practice-log-form-modal");

    await user.click(screen.getByRole("checkbox", { name: "テンプレートとして保存する" }));
    await user.click(screen.getByTestId("save-practice-log-button"));

    const templateNameInput = await screen.findByLabelText("テンプレート名");
    await user.type(templateNameInput, "テストテンプレート");
    const templateDialog = screen.getByRole("dialog");
    await user.click(within(templateDialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("template-save-form-error")).not.toBeInTheDocument();
  });
});
