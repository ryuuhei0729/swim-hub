/**
 * DashboardBestTimesCard: 2026-11-07 にマイページから移したベストタイム欄の見出し・一括入力・エラー表示。
 * 表そのもの (BestTimesTable) は既存のテストが見ているので、ここでは差し替える。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import jaMessages from "@apps/shared/messages/ja.json";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";

const mocks = vi.hoisted(() => ({
  bestTimes: { data: [] as unknown[], isLoading: false, isError: false },
  tableProps: null as null | Record<string, unknown>,
}));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => mocks.bestTimes,
}));
vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({ profile: { gender: 1, birthday: null } }),
}));
vi.mock("@/components/profile/BestTimesTable", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mocks.tableProps = props;
    return (
      <div data-testid="best-times-table">
        {props.title as React.ReactNode}
        {props.footerAction as React.ReactNode}
      </div>
    );
  },
}));

import DashboardBestTimesCard from "../DashboardBestTimesCard";

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext());
  mocks.bestTimes = { data: [], isLoading: false, isError: false };
  mocks.tableProps = null;
});

describe("DashboardBestTimesCard", () => {
  it("マイページと同じ見出し「Best Time」と、一括入力ページへのリンクを出す。「マイページで見る」は出さない", () => {
    renderWithI18n(<DashboardBestTimesCard />);
    expect(screen.getByRole("heading", { name: jaMessages.mypage.bestTime.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: jaMessages.mypage.bulkInput })).toHaveAttribute(
      "href",
      "/bulk-besttime",
    );
    expect(screen.queryByText(/マイページで見る/)).toBeNull();
  });

  it("表にはプロフィールの性別をそのまま渡す (`?? 0` で男性に倒さない)", () => {
    renderWithI18n(<DashboardBestTimesCard />);
    expect(screen.getByTestId("best-times-table")).toBeInTheDocument();
    expect(mocks.tableProps?.gender).toBe(1);
  });

  it("取得に失敗したら表の代わりにエラー文言を出す", () => {
    mocks.bestTimes = { data: [], isLoading: false, isError: true };
    renderWithI18n(<DashboardBestTimesCard />);
    expect(screen.getByText(jaMessages.dashboard.bestTimes.loadError)).toBeInTheDocument();
    expect(screen.queryByTestId("best-times-table")).toBeNull();
    // 表が無くても見出しと一括入力は出す
    expect(screen.getByRole("heading", { name: jaMessages.mypage.bestTime.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: jaMessages.mypage.bulkInput })).toBeInTheDocument();
  });
});
