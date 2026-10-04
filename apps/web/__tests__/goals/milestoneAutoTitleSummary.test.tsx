/**
 * apps/web/__tests__/goals/milestoneAutoTitleSummary.test.tsx
 *
 * Contract v3 C3: マイルストーンの自動タイトルは shared formatMilestoneSummary 経由の
 * `formatTimeBest` 形式 (ja: `100m × 1本: 1:23.45`)。旧: 生の秒数 `83.45秒` (廃止)。
 * タイトルが入力済みならそれが優先される。期待文字列はリテラル (formatTimeBest で組み立てない)。
 * 実 ja メッセージ + 実 next-intl (NextIntlClientProvider) で描画する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import type { GoalWithMilestones, Milestone, Style } from "@apps/shared/types";

vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {}, subscription: null }) }));
const mocks = vi.hoisted(() => ({
  createMilestone: vi.fn().mockResolvedValue({}),
  updateMilestone: vi.fn().mockResolvedValue({}),
}));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    createMilestone: mocks.createMilestone,
    updateMilestone: mocks.updateMilestone,
  })),
}));
vi.mock("@swim-hub/shared/api", () => ({
  PracticeLogTemplateAPI: vi.fn().mockImplementation(() => ({ createTemplate: vi.fn().mockResolvedValue({}) })),
}));

import MilestoneCreateModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal";
import MilestoneEditModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneEditModal";

const style: Style = { id: 1, name_jp: "自由形", name: "Freestyle", style: "Fr", distance: 100 };
const goal: GoalWithMilestones = {
  id: "goal-1", user_id: "u", competition_id: null, style_id: 1, target_time: 60, start_time: 70,
  status: "active", achieved_at: null, reflection_note: null, created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z", competition: null, style, milestones: [],
};
const milestone: Milestone = {
  id: "ms-1", goal_id: "goal-1", title: "", type: "time",
  params: { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" },
  deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
  created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

function wrap(ui: React.ReactElement, locale = "ja", messages: unknown = jaMessages) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale={locale} messages={messages as AbstractIntlMessages}>{ui}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
const createModal = () => (
  <MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="goal-1" goal={goal} styles={[style]} goalCompetitionDate="" />
);

describe("MilestoneCreateModal — 自動タイトル (C3)", () => {
  beforeEach(() => mocks.createMilestone.mockClear());

  it("タイトル空・既定 time 型 (50m / 30秒) で作成 -> title は '50m × 1本: 30.00' (秒+'秒' ではない)", async () => {
    const user = userEvent.setup();
    wrap(createModal());
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
    expect(mocks.createMilestone.mock.calls[0]![0].title).toBe("50m × 1本: 30.00");
  });

  it("目標タイムを 1:23.45 に変えて作成 -> '50m × 1本: 1:23.45'", async () => {
    const user = userEvent.setup();
    wrap(createModal());
    const input = screen.getByPlaceholderText("2.00.00");
    await user.clear(input);
    await user.type(input, "1:23.45");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(mocks.createMilestone.mock.calls[0]![0].title).toBe("50m × 1本: 1:23.45");
  });

  it("タイトルを入力済みならそれが優先される", async () => {
    const user = userEvent.setup();
    wrap(createModal());
    // タイトル欄はラベル関連付け/placeholder が無い。タイトル欄は最初の textbox (その後に時間入力)
    const titleInput = screen.getAllByRole("textbox")[0]!;
    expect((titleInput as HTMLInputElement).placeholder).toBe("");
    await user.type(titleInput, "自分のタイトル");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(mocks.createMilestone.mock.calls[0]![0].title).toBe("自分のタイトル");
  });

  it("en ロケールでは日本語を含まないタイトルが保存される", async () => {
    const user = userEvent.setup();
    wrap(createModal(), "en", enMessages);
    await user.click(screen.getByRole("button", { name: enMessages.goals.milestoneCreate.submitButton }));
    const title = mocks.createMilestone.mock.calls[0]![0].title as string;
    expect(title).toBe("50m × 1 rep: 30.00");
    expect(title).not.toMatch(/[぀-ヿ一-鿿]/);
  });
});

describe("MilestoneEditModal — 自動タイトル (C3)", () => {
  beforeEach(() => mocks.updateMilestone.mockClear());
  it("タイトルを空にして更新 -> '100m × 1本: 1:23.45'", async () => {
    const user = userEvent.setup();
    wrap(
      <MilestoneEditModal isOpen onClose={() => {}} onSuccess={async () => {}} milestone={milestone} styles={[style]} goalCompetitionDate="" />,
    );
    await user.click(screen.getByRole("button", { name: jaMessages.goals.milestoneEdit.submitButton }));
    expect(mocks.updateMilestone).toHaveBeenCalledTimes(1);
    const arg = mocks.updateMilestone.mock.calls[0]!;
    expect(JSON.stringify(arg)).toContain("100m × 1本: 1:23.45");
    expect(JSON.stringify(arg)).not.toContain("83.45秒");
  });
});
