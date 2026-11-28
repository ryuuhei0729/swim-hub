/**
 * TeamAnnouncementList (チーム画面のお知らせ一覧)
 *
 * 一覧では本文を3行までにし、項目を押すとポップアップ (CenterModal) で全文を出す
 * (ダッシュボードのお知らせ詳細と同じ形。swimhub-tasks#74)。
 * RN モックの Text は testID を `testid` 属性で出すので、testID は querySelector で引く。
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamAnnouncement } from "@swim-hub/shared/types";

// @shopify/flash-list は vitest 環境で変換できないため、テスト内だけ最小限のスタブにする
// (TeamsScreen.refreshDrift.test.tsx と同じ理由)
vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
  }) => (
    <div>
      {(data ?? []).map((item, index) => (
        <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem?.({ item, index })}
        </React.Fragment>
      ))}
    </div>
  ),
}));
vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));

import { TeamAnnouncementList } from "../TeamAnnouncementList";

const queryByRnTestId = (container: HTMLElement, testId: string) =>
  container.querySelector(`[testid="${testId}"]`);

function announcement(id: string, overrides: Partial<TeamAnnouncement> = {}): TeamAnnouncement {
  return {
    id,
    team_id: "team-1",
    title: `お知らせ ${id}`,
    content: `本文 ${id}`,
    created_by: "user-1",
    is_published: true,
    start_at: null,
    end_at: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("TeamAnnouncementList", () => {
  it("項目を押すとポップアップで全文を出す", () => {
    const longContent = "長い本文\n".repeat(10);
    const { container, getByText } = render(
      <TeamAnnouncementList
        announcements={[announcement("a1", { content: longContent })]}
        isLoading={false}
        isError={false}
        error={null}
        isAdmin={false}
      />,
    );
    expect(queryByRnTestId(container, "team-announcement-detail-a1")).toBeNull();

    fireEvent.click(getByText("お知らせ a1"));

    const detail = queryByRnTestId(container, "team-announcement-detail-a1");
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain(longContent.trim());
  });

  it("管理者の編集ボタンを押しても詳細は開かず onEdit だけが呼ばれる", () => {
    const onEdit = vi.fn();
    const { container, getByText } = render(
      <TeamAnnouncementList
        announcements={[announcement("a1")]}
        isLoading={false}
        isError={false}
        error={null}
        isAdmin
        onEdit={onEdit}
      />,
    );

    fireEvent.click(getByText("編集"));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(queryByRnTestId(container, "team-announcement-detail-a1")).toBeNull();
  });
});
