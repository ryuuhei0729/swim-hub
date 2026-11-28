/**
 * PracticeTabModal — logOwnerUserId で既存ログの読み込みを自分の分に絞る
 *
 * swimhub-tasks#57: チーム練習のカードの「記録追加」は、既存のチーム練習を編集モードで開いて
 * 自分のログを付ける。練習に付いている他メンバーのログまでメニューとして読み込むと、
 * 保存時の diff で他メンバーのログを更新・削除しようとしてしまうため、logOwnerUserId を
 * 渡したときは practice_logs の取得を user_id で絞る。
 */

import { renderWithI18n as render, waitFor } from "../../utils/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  eqCalls: [] as Array<[string, unknown]>,
}));

function buildSupabaseMock() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => {
    mocks.eqCalls.push([column, value]);
    return builder;
  };
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

// 場所の候補取得は関心外
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

function renderModal(logOwnerUserId?: string) {
  return render(
    <PracticeTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={vi.fn()}
      selectedDate={new Date("2026-11-20")}
      editingData={{ id: PRACTICE_ID, type: "practice", date: "2026-11-20" } as never}
      editingPracticeId={PRACTICE_ID}
      availableTags={[]}
      setAvailableTags={vi.fn()}
      isLoading={false}
      initialTab="practiceLog"
      allowParentUpdate={false}
      {...(logOwnerUserId ? { logOwnerUserId } : {})}
    />,
  );
}

describe("PracticeTabModal logOwnerUserId", () => {
  beforeEach(() => {
    mocks.eqCalls.length = 0;
  });

  it("logOwnerUserId を渡すと、その練習のログのうち自分のものだけを読み込む", async () => {
    renderModal("member-1");

    await waitFor(() => expect(mocks.eqCalls).toContainEqual(["practice_id", PRACTICE_ID]));
    expect(mocks.eqCalls).toContainEqual(["user_id", "member-1"]);
  });

  it("logOwnerUserId を渡さないときは、これまでどおり練習のログをすべて読み込む", async () => {
    renderModal();

    await waitFor(() => expect(mocks.eqCalls).toContainEqual(["practice_id", PRACTICE_ID]));
    expect(mocks.eqCalls.some(([column]) => column === "user_id")).toBe(false);
  });
});
