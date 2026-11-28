/**
 * PracticeTabModal — 無料プランの練習タイム上限 (18件) の数え方
 *
 * 上限は「1メニュー(= 1練習ログ)あたり」で数える。練習全体の合計では数えない
 * (モバイルの PracticeTimeFormScreen・料金表の「1ログあたり」と同じ)。
 * swimhub-tasks#55: web だけ練習全体の合計で数えていたため、10本ずつのメニューが
 * 2つある練習が web では保存できず mobile では保存できた。
 *
 * メニューのタイムはタイム入力モーダル経由でしか入らないため、usePracticeLogForm の
 * 戻り値の menus だけをテストデータに差し替える (他の振る舞いは実物のまま)。
 */

import { renderWithI18n as render, screen } from "../../utils/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeMenu } from "@/components/forms/practice-log/types";

const mocks = vi.hoisted(() => ({
  menus: null as PracticeMenu[] | null,
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: {} }),
}));

vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

vi.mock("@/components/forms/practice-log/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/forms/practice-log/hooks")>();
  return {
    ...actual,
    usePracticeLogForm: (...args: Parameters<typeof actual.usePracticeLogForm>) => {
      const result = actual.usePracticeLogForm(...args);
      return mocks.menus ? { ...result, menus: mocks.menus } : result;
    },
  };
});

import PracticeTabModal from "@/components/forms/PracticeTabModal";

function makeMenu(id: string, timeCount: number): PracticeMenu {
  return {
    id,
    style: "Fr",
    swimCategory: "Swim",
    distance: 50,
    reps: timeCount,
    sets: 1,
    circleMin: 1,
    circleSec: 0,
    note: "",
    tags: [],
    times: Array.from({ length: timeCount }, (_, i) => ({
      setNumber: 1,
      repNumber: i + 1,
      time: 30 + i,
    })),
  };
}

function renderModal() {
  return render(
    <PracticeTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={vi.fn()}
      selectedDate={new Date("2099-01-01")}
      editingData={null}
      editingPracticeId={null}
      availableTags={[]}
      setAvailableTags={vi.fn()}
      isLoading={false}
      initialTab="practice"
    />,
  );
}

describe("PracticeTabModal 練習タイム上限 (Free プラン)", () => {
  beforeEach(() => {
    mocks.menus = null;
  });

  it("10件ずつのメニューが2つ (合計20件) でも、各メニューが18件以内なら保存できる", () => {
    mocks.menus = [makeMenu("m1", 10), makeMenu("m2", 10)];
    renderModal();

    expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
    expect(screen.queryByTestId("practice-time-limit-message")).toBeNull();
  });

  it("ちょうど18件のメニューは保存できる", () => {
    mocks.menus = [makeMenu("m1", 18)];
    renderModal();

    expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
  });

  it(
    "19件のメニューがあると保存できず、どのメニューが超えているかの理由が" +
      "練習タブを開いたままでも見える",
    () => {
      mocks.menus = [makeMenu("m1", 3), makeMenu("m2", 19)];
      renderModal();

      expect(screen.getByTestId("practice-tab-modal-save")).toBeDisabled();
      const message = screen.getByTestId("practice-time-limit-message");
      expect(message).toBeVisible();
      expect(message.textContent).toContain("メニュー 2");
      expect(message.textContent).not.toContain("メニュー 1");
      expect(message.textContent).toContain("18");
    },
  );
});
