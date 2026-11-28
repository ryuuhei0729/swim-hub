/**
 * PracticeTabModal — 「テンプレートとして保存」は新規作成のときだけ出す
 *
 * swimhub-tasks#118: 練習一覧から既存の練習を編集するときは logEditData が null のため、
 * 以前は練習ログタブにチェックボックスが出ていた。mobile PracticeTabFormScreen の
 * 「新規作成のときだけ」に揃える。
 */

import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import { describe, expect, it, vi } from "vitest";

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";

function buildSupabaseMock() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve({ data: [], error: null });
  return { from: () => builder };
}

const supabaseMock = buildSupabaseMock();

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: supabaseMock }),
}));

vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

vi.mock("@apps/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apps/shared/api")>();
  return {
    ...actual,
    PracticeAPI: vi.fn().mockImplementation(function () {
      return { getUniquePlaces: () => Promise.resolve([]) };
    }),
  };
});

import PracticeTabModal from "@/components/forms/PracticeTabModal";

function renderModal(editing: boolean) {
  return render(
    <PracticeTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={vi.fn()}
      selectedDate={new Date("2026-11-20")}
      editingData={
        editing ? ({ id: PRACTICE_ID, type: "practice", date: "2026-11-20" } as never) : null
      }
      editingPracticeId={editing ? PRACTICE_ID : null}
      availableTags={[]}
      setAvailableTags={vi.fn()}
      isLoading={false}
      initialTab="practiceLog"
    />,
  );
}

describe("PracticeTabModal 「テンプレートとして保存」", () => {
  it("新規作成では練習ログタブに出す", async () => {
    renderModal(false);
    await waitFor(() => expect(screen.getByTestId("practice-tab-modal")).toBeInTheDocument());
    expect(screen.getByLabelText("テンプレートとして保存する")).toBeInTheDocument();
  });

  it("既存の練習の編集では出さない", async () => {
    renderModal(true);
    await waitFor(() => expect(screen.getByTestId("practice-tab-modal")).toBeInTheDocument());
    expect(screen.queryByLabelText("テンプレートとして保存する")).not.toBeInTheDocument();
  });
});
