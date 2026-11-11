// =============================================================================
// DashboardBestTimesSection — 入力モード (一括入力)
// =============================================================================
// 2026-11-10 に一括入力画面 (BulkBestTimeScreen) をやめ、「一括入力」を押すとホームの表が
// その場で入力モードに変わるようにした。旧画面の BulkBestTimeScreen.invalidate.test.tsx の観点
// (登録後に大会タブの一覧・ベストタイム表のキャッシュを無効化する) もここで引き継ぐ。
// =============================================================================

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import { createTableDispatchSupabase } from "../../../screens/__tests__/utils/tableSupabaseMock";

// 共有モックの TextInput は onChangeText を DOM の onChange に橋渡ししないので、このファイルだけ上書きする
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    TextInput: ({
      onChangeText,
      value,
      accessibilityLabel,
      testID: _testID,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      accessibilityLabel?: string;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        "aria-label": accessibilityLabel,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

const USER_ID = "user-1";

const h = vi.hoisted(() => ({
  supabase: null as unknown,
  getBestTimes: vi.fn(),
  createBulkRecords: vi.fn(),
  deleteRecord: vi.fn(),
  getMyTeams: vi.fn(),
}));

// タブの状態と blur リスナーをテストから操作できるようにする
const nav = vi.hoisted(() => ({
  navigate: vi.fn(),
  blurListeners: new Set<() => void>(),
  currentTab: "Dashboard",
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: nav.navigate,
    addListener: (_event: string, cb: () => void) => {
      nav.blurListeners.add(cb);
      return () => nav.blurListeners.delete(cb);
    },
    getState: () => ({ index: 0, routes: [{ name: nav.currentTab }] }),
  }),
}));

/** 他のタブへ移ったときの blur を起こす */
function leaveToTab(tab: string) {
  nav.currentTab = tab;
  act(() => {
    for (const cb of Array.from(nav.blurListeners)) cb();
  });
}
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: h.supabase, user: { id: USER_ID } }),
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = h.getBestTimes;
    createBulkRecords = h.createBulkRecords;
    deleteRecord = h.deleteRecord;
  },
}));
vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = h.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

import { DashboardBestTimesSection } from "../DashboardBestTimesSection";

// 100m自由形 (styleId=3) 短水路のベスト 54.97
const FR100_RECORD = {
  id: "rec-1",
  time: 54.97,
  created_at: "2020-01-01T00:00:00.000Z",
  pool_type: 0,
  is_relaying: false,
  note: null,
  style_id: 3,
  style: { name_jp: "100m自由形", distance: 100 },
  competition: { title: "テスト大会", date: "2020-01-01" },
};

// ホームの暗い部分から呼ぶ「入力モードを抜ける」操作と、入力モードの状態を受け取る
const home = {
  exitRef: { current: null } as React.MutableRefObject<(() => void) | null>,
  onEditingChange: vi.fn(),
};

function setup() {
  const supabaseMock = createTableDispatchSupabase({
    userId: USER_ID,
    tables: { users: { data: { id: USER_ID, name: "テストユーザー", gender: 0 } } },
  });
  h.supabase = supabaseMock.client;
  h.getMyTeams.mockResolvedValue([]);
  h.getBestTimes.mockResolvedValue([FR100_RECORD]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <DashboardBestTimesSection
        exitRequestRef={home.exitRef}
        onEditingChange={home.onEditingChange}
      />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy };
}

const raw = (container: HTMLElement, id: string) =>
  container.querySelector(`[testid="${id}"]`) as HTMLElement | null;

async function enterInputMode() {
  const utils = setup();
  await screen.findByText("54.97");
  fireEvent.click(screen.getByText("一括入力"));
  await waitFor(() => expect(raw(utils.container, "best-time-input-grid")).toBeTruthy());
  return utils;
}

function typeIntoCell(container: HTMLElement, cellKey: string, value: string) {
  fireEvent.click(raw(container, `best-time-input-cell-${cellKey}`)!);
  const editor = raw(container, "best-time-cell-editor")!;
  const timeInput = editor.querySelector("input") as HTMLInputElement;
  fireEvent.change(timeInput, { target: { value } });
}

beforeEach(() => {
  h.createBulkRecords.mockReset();
  h.createBulkRecords.mockResolvedValue({ created: 1, errors: [], savedIds: ["saved-1"] });
  h.deleteRecord.mockReset();
  vi.mocked(Alert.alert).mockReset();
  nav.navigate.mockReset();
  nav.blurListeners.clear();
  nav.currentTab = "Dashboard";
});

describe("入力モードへの切り替え", () => {
  it("表示切り替え (タイム/点数) と一括入力を隠し、キャンセル・登録を出す", async () => {
    const { container } = await enterInputMode();
    expect(raw(container, "best-times-wa-points-toggle")).toBeNull();
    expect(screen.queryByText("一括入力")).toBeNull();
    expect(raw(container, "best-times-edit-cancel")).toBeTruthy();
    expect(raw(container, "best-times-edit-save")).toBeTruthy();
  });

  it("入力の表には 25m と 1500m の行もある", async () => {
    await enterInputMode();
    expect(screen.getByText("25m")).toBeTruthy();
    expect(screen.getByText("1500m")).toBeTruthy();
  });

  it("水路は短水路/長水路だけで、ALL は出さない", async () => {
    const { container } = await enterInputMode();
    expect(screen.queryByText("ALL")).toBeNull();
    expect(raw(container, "best-times-edit-pool-short")).toBeTruthy();
    expect(raw(container, "best-times-edit-pool-long")).toBeTruthy();
  });
});

describe("マスの入力", () => {
  it("マスを選ぶと今のベストを出し、それより遅いタイムには注意を出す", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "55.50");
    expect(screen.getByText("今のベスト 54.97")).toBeTruthy();
    expect(screen.getByText(/今のベストより遅いタイムです/)).toBeTruthy();
  });

  it("長水路では 25m のマスに入力できない", async () => {
    const { container } = await enterInputMode();
    expect(raw(container, "best-time-input-cell-1_0_0")).toBeTruthy();
    fireEvent.click(raw(container, "best-times-edit-pool-long")!);
    expect(raw(container, "best-time-input-cell-1_1_0")).toBeNull();
    expect(raw(container, "best-time-input-cell-2_1_0")).toBeTruthy();
  });

  it("「引き継ぎ」にチェックを入れると引き継ぎタイムの入力になり、引き継ぎの無い種目は入力できない", async () => {
    const { container } = await enterInputMode();
    fireEvent.click(raw(container, "best-times-edit-relay-toggle")!);
    // 50m自由形 (2) は引き継ぎあり、400m自由形 (5)・100m背泳ぎ (14) は引き継ぎなし
    expect(raw(container, "best-time-input-cell-2_0_1")).toBeTruthy();
    expect(raw(container, "best-time-input-cell-5_0_1")).toBeNull();
    expect(raw(container, "best-time-input-cell-14_0_1")).toBeNull();
  });
});

describe("登録", () => {
  it("入力したマスを登録し、登録後は表示に戻る", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    fireEvent.click(raw(container, "best-times-edit-save")!);

    await waitFor(() => expect(h.createBulkRecords).toHaveBeenCalledTimes(1));
    expect(h.createBulkRecords.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ style_id: 3, pool_type: 0, is_relaying: false, time: 53.8 }),
    ]);
    await waitFor(() => expect(raw(container, "best-time-input-grid")).toBeNull());
  });

  it("引き継ぎで入れたタイムは引き継ぎとして登録する", async () => {
    const { container } = await enterInputMode();
    fireEvent.click(raw(container, "best-times-edit-relay-toggle")!);
    typeIntoCell(container, "2_0_1", "24.10");
    fireEvent.click(raw(container, "best-times-edit-save")!);

    await waitFor(() => expect(h.createBulkRecords).toHaveBeenCalledTimes(1));
    expect(h.createBulkRecords.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ style_id: 2, pool_type: 0, is_relaying: true, time: 24.1 }),
    ]);
  });

  it("登録後、大会タブの一覧 (recordKeys.lists) とベストタイム表のキャッシュを無効化する", async () => {
    const utils = await enterInputMode();
    typeIntoCell(utils.container, "3_0_0", "53.80");
    fireEvent.click(raw(utils.container, "best-times-edit-save")!);

    const invalidated = (key: readonly unknown[]) =>
      utils.invalidateSpy.mock.calls.some(
        ([arg]) => JSON.stringify((arg as { queryKey?: unknown[] })?.queryKey) === JSON.stringify(key),
      );
    await waitFor(() => {
      expect(invalidated(recordKeys.lists())).toBe(true);
      expect(invalidated(recordKeys.bestTimes(USER_ID))).toBe(true);
    });
  });

  it("一部が失敗したら入力モードのまま、エラーを出す", async () => {
    h.createBulkRecords.mockResolvedValue({ created: 0, errors: ["boom"], savedIds: [] });
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    fireEvent.click(raw(container, "best-times-edit-save")!);

    await waitFor(() => expect(screen.getByText(/一部の登録に失敗しました/)).toBeTruthy());
    expect(raw(container, "best-time-input-grid")).toBeTruthy();
  });

  it("形式が正しい入力が無い間は登録を押せない", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "abc");
    fireEvent.click(raw(container, "best-times-edit-save")!);
    expect(h.createBulkRecords).not.toHaveBeenCalled();
  });
});

describe("キャンセル", () => {
  it("入力が無ければ確かめずに表示へ戻る", async () => {
    const { container } = await enterInputMode();
    fireEvent.click(raw(container, "best-times-edit-cancel")!);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(raw(container, "best-time-input-grid")).toBeNull();
  });

  it("入力があれば破棄してよいか確かめ、「破棄する」で表示へ戻る", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    fireEvent.click(raw(container, "best-times-edit-cancel")!);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(raw(container, "best-time-input-grid")).toBeTruthy();
    const buttons = vi.mocked(Alert.alert).mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    const discard = buttons.find((b) => b.text === "破棄する")!;
    discard.onPress!();
    await waitFor(() => expect(raw(container, "best-time-input-grid")).toBeNull());
    expect(h.createBulkRecords).not.toHaveBeenCalled();
  });
});

describe("他のタブへの移動", () => {
  type AlertButton = { text: string; onPress?: () => void };
  const alertButtons = () => vi.mocked(Alert.alert).mock.calls[0]?.[2] as AlertButton[];

  it("入力が残ったまま他のタブへ移ると確かめ、「入力を続ける」でホームへ戻す", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    leaveToTab("Records");

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    alertButtons().find((b) => b.text === "入力を続ける")!.onPress!();
    expect(nav.navigate).toHaveBeenCalledWith("Dashboard");
    expect(raw(container, "best-time-input-grid")).toBeTruthy();
  });

  it("「破棄する」なら入力を捨てて表示に戻し、ホームへは戻さない", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    leaveToTab("Teams");

    act(() => alertButtons().find((b) => b.text === "破棄する")!.onPress!());
    expect(nav.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(raw(container, "best-time-input-grid")).toBeNull());
  });

  it("入力が無ければ確かめない", async () => {
    await enterInputMode();
    leaveToTab("Records");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("ホームの上に別画面を開いた (タブはホームのまま) ときは確かめない", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    leaveToTab("Dashboard");
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe("ホームの暗い部分から入力モードを抜ける", () => {
  beforeEach(() => {
    home.onEditingChange.mockReset();
  });

  it("入力モードに入った・抜けたことをホームに知らせる", async () => {
    const { container } = await enterInputMode();
    expect(home.onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(raw(container, "best-times-edit-cancel")!);
    await waitFor(() => expect(home.onEditingChange).toHaveBeenLastCalledWith(false));
  });

  it("未入力なら、確かめずに入力モードを抜ける", async () => {
    const { container } = await enterInputMode();
    act(() => home.exitRef.current!());
    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(raw(container, "best-time-input-grid")).toBeNull());
  });

  it("入力中なら、破棄してよいか確かめる", async () => {
    const { container } = await enterInputMode();
    typeIntoCell(container, "3_0_0", "53.80");
    act(() => home.exitRef.current!());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(raw(container, "best-time-input-grid")).toBeTruthy();
  });
});
