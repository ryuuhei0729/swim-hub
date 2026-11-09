import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
} from "@apps/shared/utils/dashboardActionItems";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import ActionItemsSection from "../ActionItemsSection";

const mocks = vi.hoisted(() => ({
  unanswered: [] as Array<Record<string, string>>,
  unsubmitted: [] as Array<Record<string, string>>,
  unrecorded: [] as Array<Record<string, string>>,
}));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: mocks.unanswered }),
  useUnsubmittedEntriesQuery: () => ({ data: mocks.unsubmitted }),
}));
vi.mock("@apps/shared/hooks/queries/dashboard", () => ({
  useUnrecordedCompetitionsQuery: () => ({ data: mocks.unrecorded }),
}));

const STORAGE_KEY = actionItemsCollapseStorageKey("me");

function renderSection() {
  const props = { teams: [], openEntryLogForm: vi.fn(), onAddRecord: vi.fn() };
  const utils = renderWithI18n(<ActionItemsSection {...props} />);
  return { ...props, ...utils };
}

const attendance = (teamId: string, eventId: string) => ({
  teamId,
  teamName: teamId === "t1" ? "SHスイミング" : "別チーム",
  eventId,
  eventType: "practice",
  eventName: "練習",
  eventDate: "2026-11-09",
});

const ALL_KEYS = [
  actionItemKey.attendance("practice", "p1"),
  actionItemKey.attendance("practice", "p2"),
  actionItemKey.attendance("practice", "p3"),
  actionItemKey.entry("c-entry"),
  actionItemKey.record("c-record"),
];

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "me" } }));
  window.localStorage.clear();
  mocks.unanswered = [attendance("t1", "p1"), attendance("t1", "p2"), attendance("t2", "p3")];
  mocks.unsubmitted = [
    { teamId: "t1", teamName: "SHスイミング", competitionId: "c-entry", competitionName: "冬季短水路記録会", competitionDate: "2026-12-06" },
  ];
  mocks.unrecorded = [
    { competitionId: "c-record", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
  ];
});

describe("ActionItemsSection", () => {
  it("対応事項が0件なら何も出さない", () => {
    mocks.unanswered = [];
    mocks.unsubmitted = [];
    mocks.unrecorded = [];
    renderSection();
    expect(screen.queryByTestId("dashboard-action-items")).toBeNull();
  });

  it("出欠の未回答はチームごとに1行にまとめ、件数は行の数を出す", () => {
    renderSection();
    expect(screen.getByText("出欠が未回答 2件 ・ SHスイミング")).toBeInTheDocument();
    expect(screen.getByText("出欠が未回答 1件 ・ 別チーム")).toBeInTheDocument();
    // チーム2つ + エントリー1 + 記録未入力1
    expect(screen.getByText("4件")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SHスイミング/ })).toHaveAttribute(
      "href",
      "/teams/t1?tab=attendance",
    );
  });

  it("エントリー受付中はその大会のエントリーを、記録が未入力はその大会の記録入力を開く", () => {
    const { openEntryLogForm, onAddRecord } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /冬季短水路記録会/ }));
    expect(openEntryLogForm).toHaveBeenCalledWith("c-entry");
    fireEvent.click(screen.getByRole("button", { name: /秋季公認記録会/ }));
    expect(onAddRecord).toHaveBeenCalledWith("c-record");
  });

  it("見出しを押すと閉じて件数だけ残り、閉じた状態を保存する", () => {
    renderSection();
    const header = screen.getByRole("button", { name: /対応が必要なこと/ });
    expect(header).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/冬季短水路記録会/)).toBeNull();
    expect(screen.getByText("4件")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      collapsed: true,
      keys: ALL_KEYS,
    });
  });

  it("閉じて保存した後に開き直しても、項目が同じなら閉じたまま", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: true, keys: ALL_KEYS }));
    renderSection();
    expect(screen.getByRole("button", { name: /対応が必要なこと/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("閉じた時点に無かった項目があれば、件数が同じでも開く", () => {
    // 閉じたときは別の記録未入力 (c-old) があり、今は c-record に入れ替わっている
    const keysAtClose = [...ALL_KEYS.slice(0, 4), actionItemKey.record("c-old")];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: true, keys: keysAtClose }));
    renderSection();
    expect(screen.getByRole("button", { name: /対応が必要なこと/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
