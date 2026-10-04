/**
 * apps/web/__tests__/goals/reflectionModalSaveGuard.test.tsx
 *
 * Contract v3 C1: マイルストーンの振り返り (ReflectionModal) は、何も選ばず自由記述も空のまま保存すると
 * reflectionNote=null になり GoalAPI.updateMilestone が reflection_done を立てない -> Dashboard が
 * 同じマイルストーンを出し続ける。よって「何か1つ選ぶか入力するまで保存・次アクションを無効」にする。
 * スキップ / 閉じる / 背景クリックは常に可能。
 *
 * ミューテーション確認: ReflectionModal.tsx の `canSave = currentNote !== null` を `true` にすると
 * 「保存ボタンが disabled」ケースと「updateMilestone が呼ばれない」ケースが赤になる (QA が __mut__ コピーで実証)。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Milestone } from "@apps/shared/types";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      const t = (key: string, values?: Record<string, unknown>) =>
        (namespace ? `${namespace}.${key}` : key) + (values ? `|${JSON.stringify(values)}` : "");
      return t as unknown as ReturnType<typeof original.useTranslations>;
    },
  };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...p }: { children: React.ReactNode } & Record<string, unknown>) => <a {...p}>{children}</a>,
}));
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {} }) }));

const mocks = vi.hoisted(() => ({ updateMilestone: vi.fn().mockResolvedValue({}) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({ updateMilestone: mocks.updateMilestone })),
}));

import ReflectionModal from "../../app/[locale]/(authenticated)/goals/_components/ReflectionModal";

const milestone: Milestone = {
  id: "ms-1", goal_id: "g-1", title: "T", type: "time",
  params: { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" },
  deadline: "2026-01-01", status: "in_progress", achieved_at: null, reflection_done: false,
  reflection_note: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
};

function setup() {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ReflectionModal isOpen onClose={onClose} milestone={milestone} onSave={onSave} />);
  return { onClose, onSave, user: userEvent.setup() };
}
const saveBtn = () => screen.getByRole("button", { name: "goals.reflection.saveButton" }) as HTMLButtonElement;
const actionBtn = () => screen.getByRole("button", { name: "goals.reflection.createMilestoneButton" }) as HTMLButtonElement;
const skipBtn = () => screen.getByRole("button", { name: "goals.reflection.skipButton" }) as HTMLButtonElement;

describe("ReflectionModal (web) — C1 保存ガード", () => {
  beforeEach(() => mocks.updateMilestone.mockClear());

  it("何も選ばず otherNote 空: 保存と『新しいマイルストーン』が disabled、submit しても updateMilestone は呼ばれない", async () => {
    const { user, onSave } = setup();
    expect(saveBtn().disabled).toBe(true);
    expect(actionBtn().disabled).toBe(true);
    await user.click(saveBtn());
    await user.click(actionBtn());
    expect(mocks.updateMilestone).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("選択肢を1つ選ぶと有効になり、保存で updateMilestone(id, {reflectionNote: 選択ラベル}) が1回", async () => {
    const { user, onSave, onClose } = setup();
    await user.click(screen.getByLabelText("goals.reflection.options.goalTooHigh"));
    expect(saveBtn().disabled).toBe(false);
    expect(actionBtn().disabled).toBe(false);
    await user.click(saveBtn());
    expect(mocks.updateMilestone).toHaveBeenCalledTimes(1);
    expect(mocks.updateMilestone).toHaveBeenCalledWith("ms-1", { reflectionNote: "goals.reflection.options.goalTooHigh" });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("『その他』を選んで自由記述を入力すると有効。note は選択ラベル + otherPrefix(note)", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("goals.reflection.options.other"));
    await user.type(screen.getByPlaceholderText("goals.reflection.otherPlaceholder"), "怪我");
    expect(saveBtn().disabled).toBe(false);
    await user.click(saveBtn());
    expect(mocks.updateMilestone).toHaveBeenCalledWith("ms-1", {
      reflectionNote: 'goals.reflection.options.other\ngoals.reflection.otherPrefix|{"note":"怪我"}',
    });
  });

  it("選んだ後に選択を外すと再び disabled に戻る", async () => {
    const { user } = setup();
    const cb = screen.getByLabelText("goals.reflection.options.conditionPoor");
    await user.click(cb);
    expect(saveBtn().disabled).toBe(false);
    await user.click(cb);
    expect(saveBtn().disabled).toBe(true);
  });

  it("スキップは常に可能: updateMilestone を呼ばず onClose だけ呼ぶ", async () => {
    const { user, onClose } = setup();
    expect(skipBtn().disabled).toBe(false);
    await user.click(skipBtn());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.updateMilestone).not.toHaveBeenCalled();
  });

  it("背景クリックでも閉じられる (保存なし)", async () => {
    const { user, onClose } = setup();
    const backdrop = document.querySelector(".bg-black\\/40") as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.updateMilestone).not.toHaveBeenCalled();
  });
});
