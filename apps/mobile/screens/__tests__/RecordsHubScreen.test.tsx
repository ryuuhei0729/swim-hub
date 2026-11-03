// =============================================================================
// RecordsHubScreen.test.tsx
// =============================================================================
// 記録タブ (`screens/RecordsHubScreen.tsx`) の切り替えを検証する。
// 中身の PracticesScreen / CompetitionsScreen は識別できるスタブに差し替え、
// 「どちらが描画されているか」「embedded が渡っているか」だけを見る。
//
// 検証観点:
//   [V-RH-01] 既定は大会記録一覧。練習記録一覧は描画されない
//   [V-RH-02] 「練習」を押すと練習記録一覧に切り替わり、大会記録一覧は外れる
//   [V-RH-03] route.params.segment="competitions" で開くと最初から大会記録一覧
//   [V-RH-04] 中の画面には embedded=true が渡る (上端インセットの二重取りを防ぐ)
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RecordsHubScreen } from "../RecordsHubScreen";

const stubs = vi.hoisted(() => ({
  practicesProps: [] as unknown[],
  competitionsProps: [] as unknown[],
}));

vi.mock("@/screens/PracticesScreen", () => ({
  PracticesScreen: (props: unknown) => {
    stubs.practicesProps.push(props);
    return <span data-testid="screen-practices" />;
  },
}));
vi.mock("@/screens/CompetitionsScreen", () => ({
  CompetitionsScreen: (props: unknown) => {
    stubs.competitionsProps.push(props);
    return <span data-testid="screen-competitions" />;
  },
}));
// RecordsHubScreen は相対パスで import しているので、そちらの解決も同じスタブに向ける
vi.mock("../PracticesScreen", () => ({
  PracticesScreen: (props: unknown) => {
    stubs.practicesProps.push(props);
    return <span data-testid="screen-practices" />;
  },
}));
vi.mock("../CompetitionsScreen", () => ({
  CompetitionsScreen: (props: unknown) => {
    stubs.competitionsProps.push(props);
    return <span data-testid="screen-competitions" />;
  },
}));

type Props = React.ComponentProps<typeof RecordsHubScreen>;

const renderHub = (params?: { segment?: "practices" | "competitions" }) =>
  render(
    <RecordsHubScreen
      {...({
        route: { key: "Records", name: "Records", params },
        navigation: {},
      } as unknown as Props)}
    />,
  );

describe("RecordsHubScreen", () => {
  it("[V-RH-01] 既定は大会記録一覧。練習記録一覧は描画されない", () => {
    renderHub();
    expect(screen.queryByTestId("screen-competitions")).not.toBeNull();
    expect(screen.queryByTestId("screen-practices")).toBeNull();
  });

  it("[V-RH-02] 「練習」を押すと練習記録一覧に切り替わり、大会記録一覧は外れる", () => {
    renderHub();
    fireEvent.click(screen.getByText("練習"));
    expect(screen.queryByTestId("screen-practices")).not.toBeNull();
    expect(screen.queryByTestId("screen-competitions")).toBeNull();
  });

  it("[V-RH-03] route.params.segment='competitions' で開くと最初から大会記録一覧", () => {
    renderHub({ segment: "competitions" });
    expect(screen.queryByTestId("screen-competitions")).not.toBeNull();
    expect(screen.queryByTestId("screen-practices")).toBeNull();
  });

  it("[V-RH-04] 中の画面には embedded=true が渡る", () => {
    stubs.competitionsProps.length = 0;
    renderHub();
    expect(stubs.competitionsProps[0]).toMatchObject({ embedded: true });
  });
});
