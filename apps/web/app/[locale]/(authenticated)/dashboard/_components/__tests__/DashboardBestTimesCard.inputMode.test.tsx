/**
 * DashboardBestTimesCard — 入力モード (一括入力)
 *
 * 2026-11-11 に一括入力ページ (/bulk-besttime) をやめ、「一括入力」を押すとダッシュボードの表が
 * その場で入力モードに変わるようにした (mobile と同じ仕様)。表 (BestTimesTable)・入力の表・
 * 登録処理は本物を動かし、RecordAPI とベストタイムの取得だけを差し替える。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import { dashboardKeys, recordKeys } from "@apps/shared/hooks/queries/keys";

const mocks = vi.hoisted(() => ({
  createBulkRecords: vi.fn(),
  deleteRecord: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    createBulkRecords = mocks.createBulkRecords;
    deleteRecord = mocks.deleteRecord;
  },
}));
// 100m自由形 (styleId=3) 短水路のベスト 54.97
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({
    data: [
      {
        id: "rec-1",
        time: 54.97,
        created_at: "2020-01-01T00:00:00.000Z",
        pool_type: 0,
        is_relaying: false,
        style_id: 3,
        style: { name_jp: "100m自由形", distance: 100 },
        competition: { title: "テスト大会", date: "2020-01-01" },
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({ profile: { gender: 0, birthday: null } }),
}));

import DashboardBestTimesCard from "../DashboardBestTimesCard";

function setup() {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = renderWithI18n(
    <QueryClientProvider client={queryClient}>
      {/* サイドバーなど、カードの外にあるアプリ内リンクの代わり */}
      {/* jsdom は実際のページ移動ができないので、止めずに通ったときの既定動作だけ抑える */}
      <a href="/ja/practice" onClick={(e) => e.preventDefault()}>
        練習へ
      </a>
      <DashboardBestTimesCard />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy };
}

function enterInputMode() {
  const utils = setup();
  fireEvent.click(screen.getByRole("button", { name: "一括入力" }));
  expect(screen.getByTestId("best-time-input-grid")).toBeInTheDocument();
  return utils;
}

function typeIntoCell(cellKey: string, value: string) {
  fireEvent.click(screen.getByTestId(`best-time-input-cell-${cellKey}`));
  const editor = screen.getByTestId("best-time-cell-editor");
  fireEvent.change(within(editor).getAllByRole("textbox")[0]!, { target: { value } });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext());
  mocks.createBulkRecords.mockReset();
  mocks.createBulkRecords.mockResolvedValue({ created: 1, errors: [], savedIds: ["saved-1"] });
  mocks.deleteRecord.mockReset();
  mocks.push.mockReset();
});

describe("入力モードへの切り替え", () => {
  it("ページを移らず、その場の表が入力用になる。点数化は隠し、キャンセル・登録を出す", () => {
    enterInputMode();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("best-times-wa-points-toggle")).toBeNull();
    expect(screen.getByTestId("best-times-edit-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("best-times-edit-save")).toBeDisabled();
  });

  it("入力の表には 25m と 1500m の行もあり、水路は短水路/長水路だけ (ALL は出さない)", () => {
    enterInputMode();
    expect(screen.getByText("25m")).toBeInTheDocument();
    expect(screen.getByText("1500m")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ALL" })).toBeNull();
    expect(screen.getByTestId("best-times-edit-pool-short")).toBeInTheDocument();
  });
});

describe("マスの入力", () => {
  it("マスを選ぶと今のベストを出し、それより遅いタイムには注意を出す", () => {
    enterInputMode();
    typeIntoCell("3_0_0", "55.50");
    expect(screen.getAllByText("今のベスト 54.97").length).toBeGreaterThan(0);
    expect(screen.getByText(/今のベストより遅いタイムです/)).toBeInTheDocument();
  });

  it("長水路では 25m のマスに入力できない", () => {
    enterInputMode();
    expect(screen.getByTestId("best-time-input-cell-1_0_0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("best-times-edit-pool-long"));
    expect(screen.queryByTestId("best-time-input-cell-1_1_0")).toBeNull();
    expect(screen.getByTestId("best-time-input-cell-2_1_0")).toBeInTheDocument();
  });

  it("「引き継ぎ」にチェックを入れると引き継ぎの入力になり、引き継ぎの無い種目は入力できない", () => {
    enterInputMode();
    fireEvent.click(screen.getByTestId("best-times-edit-relay-toggle"));
    expect(screen.getByTestId("best-time-input-cell-2_0_1")).toBeInTheDocument();
    expect(screen.queryByTestId("best-time-input-cell-5_0_1")).toBeNull();
    expect(screen.queryByTestId("best-time-input-cell-14_0_1")).toBeNull();
  });
});

describe("登録", () => {
  it("入力したマスを登録し、キャッシュを無効化して表示に戻り、登録できたことを知らせる", async () => {
    const { invalidateSpy } = enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByTestId("best-times-edit-save"));

    await waitFor(() => expect(mocks.createBulkRecords).toHaveBeenCalledTimes(1));
    expect(mocks.createBulkRecords.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ style_id: 3, pool_type: 0, is_relaying: false, time: 53.8 }),
    ]);
    await waitFor(() => expect(screen.queryByTestId("best-time-input-grid")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("1件の記録を登録しました");

    const invalidated = (key: readonly unknown[]) =>
      invalidateSpy.mock.calls.some(
        ([arg]) => JSON.stringify((arg as { queryKey?: unknown[] })?.queryKey) === JSON.stringify(key),
      );
    expect(invalidated(recordKeys.lists())).toBe(true);
    expect(invalidated(dashboardKeys.all)).toBe(true);
  });

  it("引き継ぎで入れたタイムは引き継ぎとして登録する", async () => {
    enterInputMode();
    fireEvent.click(screen.getByTestId("best-times-edit-relay-toggle"));
    typeIntoCell("2_0_1", "24.10");
    fireEvent.click(screen.getByTestId("best-times-edit-save"));

    await waitFor(() => expect(mocks.createBulkRecords).toHaveBeenCalledTimes(1));
    expect(mocks.createBulkRecords.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ style_id: 2, pool_type: 0, is_relaying: true, time: 24.1 }),
    ]);
  });

  it("一部が失敗したら入力モードのまま、エラーを出す", async () => {
    mocks.createBulkRecords.mockResolvedValue({ created: 0, errors: ["boom"], savedIds: [] });
    enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByTestId("best-times-edit-save"));

    await waitFor(() => expect(screen.getByText(/一部の登録に失敗しました/)).toBeInTheDocument());
    expect(screen.getByTestId("best-time-input-grid")).toBeInTheDocument();
  });
});

describe("キャンセル", () => {
  it("入力が無ければ確かめずに表示へ戻る", () => {
    enterInputMode();
    fireEvent.click(screen.getByTestId("best-times-edit-cancel"));
    expect(screen.queryByText("入力を破棄しますか？")).toBeNull();
    expect(screen.queryByTestId("best-time-input-grid")).toBeNull();
  });

  it("入力があれば破棄してよいか確かめ、「破棄する」で表示へ戻る", () => {
    enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByTestId("best-times-edit-cancel"));

    expect(screen.getByText("入力を破棄しますか？")).toBeInTheDocument();
    // 押し間違いの Enter で破棄しないよう、最初のフォーカスは「入力を続ける」
    expect(screen.getByRole("button", { name: "入力を続ける" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));
    expect(screen.queryByTestId("best-time-input-grid")).toBeNull();
    expect(mocks.createBulkRecords).not.toHaveBeenCalled();
  });
});

describe("別のページへの移動", () => {
  it("入力が残ったままアプリ内のリンクを押すと止めて確かめ、「入力を続ける」ならそのまま", () => {
    enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByRole("link", { name: "練習へ" }));

    expect(screen.getByText("入力を破棄しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "入力を続ける" }));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("best-time-input-grid")).toBeInTheDocument();
  });

  it("「破棄する」なら入力を捨てて、押したリンク先へ移る", () => {
    enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByRole("link", { name: "練習へ" }));
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));

    expect(mocks.push).toHaveBeenCalledWith("/ja/practice");
    expect(screen.queryByTestId("best-time-input-grid")).toBeNull();
  });

  it("入力が無ければリンクは止めない", () => {
    enterInputMode();
    fireEvent.click(screen.getByRole("link", { name: "練習へ" }));
    expect(screen.queryByText("入力を破棄しますか？")).toBeNull();
  });
});

describe("入力モード中の暗い部分", () => {
  it("入力モード中だけ画面を暗くする", () => {
    setup();
    expect(screen.queryByTestId("best-times-edit-backdrop")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "一括入力" }));
    expect(screen.getByTestId("best-times-edit-backdrop")).toBeInTheDocument();
  });

  it("未入力なら、暗い部分を押すと確かめずに入力モードを抜ける", () => {
    enterInputMode();
    fireEvent.click(screen.getByTestId("best-times-edit-backdrop"));
    expect(screen.queryByText("入力を破棄しますか？")).toBeNull();
    expect(screen.queryByTestId("best-time-input-grid")).toBeNull();
    expect(screen.queryByTestId("best-times-edit-backdrop")).toBeNull();
  });

  it("入力中なら、暗い部分を押すと破棄してよいか確かめる", () => {
    enterInputMode();
    typeIntoCell("3_0_0", "53.80");
    fireEvent.click(screen.getByTestId("best-times-edit-backdrop"));
    expect(screen.getByText("入力を破棄しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "入力を続ける" }));
    expect(screen.getByTestId("best-time-input-grid")).toBeInTheDocument();
  });
});
