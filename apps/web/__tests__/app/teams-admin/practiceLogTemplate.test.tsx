/**
 * PracticeLogClient — 練習ログテンプレートの読み込み (web, swimhub-tasks#66)
 *
 * mobile TeamPracticeLogBulkFormScreen の handleTemplateSelect と同じく、選んだメニュー1件の
 * 種目・距離・本数・サークル・メモ・タグだけを上書きし、他のメニューには触れない。
 * テンプレート管理はこの画面を離れず別タブで開く (離れると全員分の代理入力が消えるため)。
 *
 * テンプレート選択モーダル自体 (一覧の取得) はモックし、選んだテンプレートを渡すだけにする。
 */

import React from "react";
import { renderWithQueryClient as render, screen, fireEvent } from "@/__tests__/helpers/teamQueryTestUtils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";
import type { PracticeLogTemplate } from "@apps/shared/types/practiceLogTemplate";
import PracticeLogClient from "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/practices/[practiceId]/logs/_client/PracticeLogClient";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { rpc: vi.fn() }, subscription: null }),
}));

const TAG_KICK: PracticeTag = {
  id: "tag-kick",
  user_id: "admin-1",
  name: "キック強化",
  color: "#22C55E",
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
} as PracticeTag;

const TEMPLATE = {
  id: "tpl-1",
  user_id: "admin-1",
  name: "メインセット",
  style: "Ba",
  swim_category: "Kick",
  distance: 50,
  rep_count: 8,
  set_count: 2,
  circle: 75,
  note: "テンプレートのメモ",
  tag_ids: ["tag-kick"],
  is_favorite: false,
  use_count: 0,
  last_used_at: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
} as unknown as PracticeLogTemplate;

vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: ({
    onSelect,
    onClose,
    onManage,
  }: {
    onSelect: (template: PracticeLogTemplate) => void;
    onClose: () => void;
    onManage?: () => void;
  }) => (
    <div data-testid="template-select-modal">
      <button
        type="button"
        onClick={() => {
          onSelect(TEMPLATE);
          onClose();
        }}
      >
        select-template
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          onManage?.();
        }}
      >
        manage-templates
      </button>
    </div>
  ),
}));

const basePractice = {
  id: "practice-1",
  user_id: "admin-1",
  team_id: "team-1",
  date: "2026-01-01",
  title: null,
  place: null,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const members = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
];

function renderPracticeLogClient() {
  return render(
    <PracticeLogClient
      teamId="team-1"
      practiceId="practice-1"
      practice={basePractice}
      members={members}
      existingLogs={[]}
      availableTags={[TAG_KICK]}
      presentUserIds={["user-1"]}
    />,
  );
}

const valueOf = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value;

beforeEach(() => {
  mocks.push.mockClear();
});

describe("PracticeLogClient テンプレートの読み込み (web)", () => {
  it("選んだメニューだけにテンプレートの内容が入り、他のメニューは変わらない", () => {
    renderPracticeLogClient();
    fireEvent.click(screen.getByTestId("team-practice-log-add-menu-button"));
    fireEvent.change(screen.getByTestId("team-practice-log-note-1"), { target: { value: "1本目のメモ" } });

    expect(screen.queryByTestId("template-select-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("team-practice-log-template-2"));
    fireEvent.click(screen.getByRole("button", { name: "select-template" }));

    expect(screen.queryByTestId("template-select-modal")).toBeNull();
    expect(valueOf("team-practice-log-style-2")).toBe("Ba");
    expect(valueOf("team-practice-log-swim-category-2")).toBe("Kick");
    expect(valueOf("team-practice-log-distance-2")).toBe("50");
    expect(valueOf("team-practice-log-reps-2")).toBe("8");
    expect(valueOf("team-practice-log-sets-2")).toBe("2");
    expect(valueOf("team-practice-log-circle-min-2")).toBe("1");
    expect(valueOf("team-practice-log-circle-sec-2")).toBe("15");
    expect(valueOf("team-practice-log-note-2")).toBe("テンプレートのメモ");
    expect(screen.getByTestId("team-practice-log-menu-2")).toHaveTextContent("キック強化");

    // 1つ目のメニューはそのまま
    expect(valueOf("team-practice-log-note-1")).toBe("1本目のメモ");
    expect(screen.getByTestId("team-practice-log-menu-1")).not.toHaveTextContent("キック強化");
  });

  it("テンプレート管理は画面を離れず別タブで開く", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPracticeLogClient();

    fireEvent.click(screen.getByTestId("team-practice-log-template-1"));
    fireEvent.click(screen.getByRole("button", { name: "manage-templates" }));

    expect(openSpy).toHaveBeenCalledWith("/ja/account?tab=templates", "_blank", "noopener,noreferrer");
    expect(mocks.push).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
