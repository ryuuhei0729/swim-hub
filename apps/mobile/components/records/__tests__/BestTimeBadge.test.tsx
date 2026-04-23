// =============================================================================
// BestTimeBadge.test.tsx - ベストタイムバッジコンポーネントのテスト
// =============================================================================
// Sprint Contract (Phase A) に基づき QA が実装。
// Developer のプロダクションコードを参照せず、仕様から導いたアサーションを使用する。
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { createMockSupabaseClient, createMockQueryBuilder } from "@/__mocks__/supabase";
import type { MockSupabaseClient } from "@/__mocks__/supabase";

// --- AuthProvider モック ---
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// --- formatters モックは使わず実装をそのまま使用 ---

import BestTimeBadge from "../BestTimeBadge";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * BestTimeBadge をデフォルト props でレンダリングする
 */
function renderBadge(
  props: Partial<React.ComponentProps<typeof BestTimeBadge>> & {
    recordId?: string;
    currentTime?: number;
  } = {},
  supabase: MockSupabaseClient = createMockSupabaseClient(),
) {
  mockUseAuth.mockReturnValue({ supabase });

  return render(
    <BestTimeBadge
      recordId={props.recordId ?? "record-1"}
      styleId={props.styleId ?? 1}
      currentTime={props.currentTime ?? 60.0}
      recordDate={props.recordDate !== undefined ? props.recordDate : "2025-03-01"}
      poolType={props.poolType !== undefined ? props.poolType : 1}
      isRelaying={props.isRelaying ?? false}
      showDiff={props.showDiff ?? false}
    />,
  );
}

/**
 * 過去記録が存在しないケース用 Supabase モック（両クエリとも空配列）
 */
function makeNoPreviousRecordClient(): MockSupabaseClient {
  const client = createMockSupabaseClient({ userId: "user-1", queryData: [] });
  return client;
}

/**
 * 過去記録が存在するケース用 Supabase モック
 * competitionBest と bulkBest を任意に設定できる
 */
function makePreviousRecordClient(
  competitionBestTime: number | null,
  bulkBestTime: number | null,
): MockSupabaseClient {
  const userId = "user-1";

  const compData = competitionBestTime !== null ? [{ id: "r-c", time: competitionBestTime }] : [];
  const bulkData = bulkBestTime !== null ? [{ id: "r-b", time: bulkBestTime }] : [];

  // 2 回の from() 呼び出しに対して異なるデータを返すよう実装
  let callCount = 0;
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: "test@example.com" } },
        error: null,
      }),
    },
    from: vi.fn(() => {
      callCount++;
      const data = callCount === 1 ? compData : bulkData;
      return createMockQueryBuilder(data, null);
    }),
  } as unknown as MockSupabaseClient;

  return client;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("BestTimeBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 正常系: ベストタイム判定
  // ------------------------------------------------------------------

  it("ベストタイムのとき「🏆 Best Time!!」バッジを表示する", async () => {
    // 初記録（過去に同条件の記録なし） → isBest = true
    const client = makeNoPreviousRecordClient();

    renderBadge({ currentTime: 58.0 }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("ベストタイムのとき accessibilityLabel 属性が設定されている", async () => {
    const client = makeNoPreviousRecordClient();
    renderBadge({ currentTime: 58.0 }, client);

    await waitFor(() => {
      const badge = screen.getByText("🏆 Best Time!!");
      // React Native モックでは accessibilityLabel が小文字 accessibilitylabel として DOM に反映される
      const container = badge.closest("[accessibilitylabel]");
      expect(container?.getAttribute("accessibilitylabel")).toBe("自己ベスト更新");
    });
  });

  it("ベストでないとき showDiff=true で「Best +...」テキストを表示する", async () => {
    // 過去記録: competitionBest=55.0, bulkBest=なし → previousBest=55.0
    // currentTime=57.5 → diff=2.5 → "Best +2.50"
    const client = makePreviousRecordClient(55.0, null);
    renderBadge({ currentTime: 57.5, showDiff: true }, client);

    await waitFor(() => {
      const el = screen.getByText(/^Best \+/);
      expect(el).toBeTruthy();
    });
  });

  // [T2] diff 値の具体アサーション
  it("[T2] showDiff=true のとき差分値が正確に「Best +2.50」と表示される", async () => {
    // currentTime=57.5, previousBest=55.0 → diff=2.5 → formatTimeBest(2.5)="2.50" → "Best +2.50"
    const client = makePreviousRecordClient(55.0, null);
    renderBadge({ currentTime: 57.5, showDiff: true }, client);

    await waitFor(() => {
      expect(screen.getByText("Best +2.50")).toBeTruthy();
    });
  });

  it("ベストでないとき showDiff=false で何も表示しない", async () => {
    // 過去記録あり（現在タイムより速い）
    const client = makePreviousRecordClient(55.0, null);
    renderBadge({ currentTime: 57.5, showDiff: false }, client);

    await waitFor(
      () => {
        expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
        expect(screen.queryByText(/^Best \+/)).toBeNull();
      },
      { timeout: 2000 },
    );
  });

  // [T5] 過去記録あり・現タイムが速いケース
  it("[T5] 過去記録あり(time=60)で現タイム(55)が速いとき「🏆 Best Time!!」を表示する", async () => {
    // isBest 判定の第2分岐: previousBestTime !== null && currentTime < previousBestTime
    // previousBestTime = 60, currentTime = 55 → 55 < 60 → isBest = true
    const client = makePreviousRecordClient(60.0, null);
    renderBadge({ currentTime: 55.0 }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------
  // ガード条件: styleId / recordDate 未設定
  // ------------------------------------------------------------------

  it("styleId が undefined のとき何も表示しない（Supabase クエリ未実行）", () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={undefined}
        currentTime={60.0}
        recordDate="2025-03-01"
      />,
    );

    // 同期的に確認: styleId がないためクエリ不要
    expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
    expect(screen.queryByText(/^Best \+/)).toBeNull();
    // from() が呼ばれていないことを確認
    expect(client.from).not.toHaveBeenCalled();
  });

  it("recordDate が null のとき何も表示しない（Supabase クエリ未実行）", () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate={null}
      />,
    );

    expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
    expect(screen.queryByText(/^Best \+/)).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 初記録: 同条件の過去記録が存在しない場合
  // ------------------------------------------------------------------

  it("同条件の過去記録がないとき（初記録）「🏆 Best Time!!」を表示する", async () => {
    // competitionQuery・bulkQuery の両方が空配列 → previousBestTime = null → isBest = true
    const client = makePreviousRecordClient(null, null);
    renderBadge({ currentTime: 60.0 }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  // [T6] competitionBest と bulkBest が両方存在するケース
  it("[T6] competitionBest=58, bulkBest=56 の両方が存在するとき Math.min=56 を基準に判定する", async () => {
    // Math.min(58, 56) = 56, currentTime=57 → 57 > 56 → isBest=false, diff=+1.00
    const client = makePreviousRecordClient(58.0, 56.0);
    renderBadge({ currentTime: 57.0, showDiff: true }, client);

    await waitFor(() => {
      // ベストタイムではない
      expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
      // 差分は currentTime - Math.min(58, 56) = 57 - 56 = 1.0 → formatTimeBest(1.0)="1.00" → "Best +1.00"
      expect(screen.getByText("Best +1.00")).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------
  // 条件分離: is_relaying の混同チェック
  // ------------------------------------------------------------------

  it("is_relaying=true のとき eq('is_relaying', true) でクエリが発行される", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    renderBadge({ isRelaying: true }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    // from() が呼ばれ、eq('is_relaying', true) が呼ばれていることを検証
    // Promise.all で並列構築されるため、全ビルダーの eq 呼び出しを集約して確認する
    expect(fromSpy).toHaveBeenCalledWith("records");
    const allEqCalls = (fromSpy as MockInstance).mock.results.flatMap(
      (result) => (result.value.eq as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][],
    );
    expect(allEqCalls).toEqual(
      expect.arrayContaining([["is_relaying", true]]),
    );
  });

  it("is_relaying=false のとき eq('is_relaying', false) でクエリが発行される", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    renderBadge({ isRelaying: false }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    // Promise.all で並列構築されるため、全ビルダーの eq 呼び出しを集約して確認する
    expect(fromSpy).toHaveBeenCalledWith("records");
    const allEqCalls = (fromSpy as MockInstance).mock.results.flatMap(
      (result) => (result.value.eq as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][],
    );
    expect(allEqCalls).toEqual(
      expect.arrayContaining([["is_relaying", false]]),
    );
  });

  // ------------------------------------------------------------------
  // 条件分離: pool_type の混同チェック
  // ------------------------------------------------------------------

  it("pool_type=0 (短水路) のとき eq('pool_type', 0) でクエリが発行される", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    renderBadge({ poolType: 0 }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    expect(fromSpy).toHaveBeenCalledWith("records");
    const queryBuilder = fromSpy.mock.results[0].value;
    expect(queryBuilder.eq).toHaveBeenCalledWith("pool_type", 0);
  });

  it("pool_type=null のとき pool_type フィルタがクエリに付与されない", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    mockUseAuth.mockReturnValue({ supabase: client });
    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate="2025-03-01"
        poolType={null}
        showDiff={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    // pool_type=null のときは eq("pool_type", ...) が呼ばれない
    expect(fromSpy).toHaveBeenCalledWith("records");
    const queryBuilder = fromSpy.mock.results[0].value;
    const eqCalls = (queryBuilder.eq as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][];
    const poolTypeCall = eqCalls.find(([field]) => field === "pool_type");
    expect(poolTypeCall).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // エラー・ローディング
  // ------------------------------------------------------------------

  it("Supabase エラー時はバッジを表示せず console.error を呼ぶ", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // エラーを返す Supabase モック
    const errorClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "test@example.com" } },
          error: null,
        }),
      },
      from: vi.fn(() => createMockQueryBuilder([], new Error("DB error"))),
    } as unknown as MockSupabaseClient;

    mockUseAuth.mockReturnValue({ supabase: errorClient });
    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate="2025-03-01"
      />,
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "ベストタイムチェックエラー:",
        expect.any(Error),
      );
    });

    // isBestTime === null のまま → null render
    expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
    expect(screen.queryByText(/^Best \+/)).toBeNull();

    consoleSpy.mockRestore();
  });

  it("ローディング中（Supabase クエリ pending）は null render", () => {
    // 永遠に resolve しない Promise
    const pendingClient = {
      auth: {
        getUser: vi.fn().mockReturnValue(new Promise(() => {})),
      },
      from: vi.fn(() => createMockQueryBuilder([], null)),
    } as unknown as MockSupabaseClient;

    mockUseAuth.mockReturnValue({ supabase: pendingClient });
    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate="2025-03-01"
      />,
    );

    // loading=true の初期状態 → 同期的に null render
    expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
    expect(screen.queryByText(/^Best \+/)).toBeNull();
  });

  // ------------------------------------------------------------------
  // Fix 3: normalizeRecordDateForBulkComparison の動作検証
  // ------------------------------------------------------------------

  it("[Fix3] recordDate='2025-03-01' のとき bulkQuery の lt() に '2025-03-01T00:00:00.000Z' が渡される", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    renderBadge({ recordDate: "2025-03-01" }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    // from() が 2 回呼ばれることを確認（competitionQuery + bulkQuery）
    expect(fromSpy).toHaveBeenCalledWith("records");
    // 2 回目のクエリビルダー（bulkQuery）の lt() 呼び出しを検証
    const allLtCalls = (fromSpy as ReturnType<typeof vi.spyOn>).mock.results.flatMap(
      (result) => (result.value.lt as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][],
    );
    const createdAtLtCall = allLtCalls.find(([field]) => field === "created_at");
    expect(createdAtLtCall).toBeDefined();
    expect(createdAtLtCall![1]).toBe("2025-03-01T00:00:00.000Z");
  });

  it("[Fix3] recordDate='2025-03-01T10:00:00.000Z' のとき bulkQuery の lt() にそのまま渡される（変換しない）", async () => {
    const client = makeNoPreviousRecordClient();
    const fromSpy = vi.spyOn(client, "from");

    renderBadge({ recordDate: "2025-03-01T10:00:00.000Z" }, client);

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    const allLtCalls = (fromSpy as ReturnType<typeof vi.spyOn>).mock.results.flatMap(
      (result) => (result.value.lt as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][],
    );
    const createdAtLtCall = allLtCalls.find(([field]) => field === "created_at");
    expect(createdAtLtCall).toBeDefined();
    // ISO タイムスタンプ形式はそのまま渡される（変換されない）
    expect(createdAtLtCall![1]).toBe("2025-03-01T10:00:00.000Z");
  });

  // ------------------------------------------------------------------
  // Fix 5: precomputedBestTimes が渡されたときの動作検証
  // ------------------------------------------------------------------

  it("[Fix5] precomputedBestTimes 渡したとき Supabase の from() が呼ばれない", () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 55.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={53.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    // precomputedBestTimes が渡されているので Supabase クエリは走らない
    expect(client.from).not.toHaveBeenCalled();
  });

  it("[Fix5] precomputedBestTimes 渡してベストタイム（currentTime < relevantBestTime）のとき「🏆 Best Time!!」を表示する", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // currentTime=54.0 < bestTime=55.0 → isBest=true (確実にベスト更新)
    // 注意: Critical #2 修正で < に統一。同タイム(55 < 55 = false)はベスト扱いにならない。
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 55.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={54.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("[Fix5] precomputedBestTimes 渡してベストでない + showDiff=true のとき diff を表示する", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // currentTime=57.0, bestTime=55.0 → diff=2.0 → "Best +2.00"
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 55.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={57.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Best +2.00")).toBeTruthy();
    });
  });

  it("[Fix5] precomputedBestTimes 渡して isRelaying=true のとき relayingTime.time が使われる（Critical #1 バグ検出テスト）", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // Critical #1 バグ検出テスト:
    // 旧バグ: is_relaying=false のエントリは bt.is_relaying===true の条件にヒットしないため
    //         match が undefined → relevantBestTime=undefined → 常に isBest=true になっていた
    // 新ロジック: style_id+pool_type でマッチし、isRelaying=true → relayingTime.time=50 を参照
    // currentTime=55 > relayingTime.time=50 → isBest=false, diff=5.00 → "Best +5.00"
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 60.0, // 非リレー記録のタイム（isRelaying=true 時は参照されない）
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false, // 主エントリは非リレー記録
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        relayingTime: {
          id: "bt-r-1",
          time: 50.0, // リレー記録のベストタイム
          created_at: "2025-01-01T00:00:00.000Z",
        },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={true}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      // relayingTime.time=50 と比較: 55 > 50 → ベストでない → diff=5.00 表示
      // 旧バグがあれば isBest=true になり「🏆 Best Time!!」が表示されてテストが FAIL する
      expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
      expect(screen.getByText("Best +5.00")).toBeTruthy();
    });
  });

  it("[Fix5] precomputedBestTimes 渡して isRelaying=true で relayingTime がないとき初記録扱いでベスト表示", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // 新ロジック: style_id+pool_type でマッチ(is_relaying=false エントリ)するが、
    // isRelaying=true → match.is_relaying=false → match.relayingTime?.time=undefined
    // → relevantBestTime=undefined → isBest=true (初リレー記録扱い)
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 55.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        // relayingTime なし
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={true}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("[Fix5] precomputedBestTimes が空配列のとき初記録扱いでベスト表示（Supabase クエリ走らない）", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={60.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={false}
        precomputedBestTimes={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });

    // precomputedBestTimes=[] でも Supabase クエリは走らない
    expect(client.from).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // isRelaying ケース網羅 (Case 1-6) + 同タイム判定 (Case 7)
  // ------------------------------------------------------------------

  it("[Case1] 主エントリあり + isRelaying=false で非リレー記録がベスト更新", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: false, time: 60, relayingTime: { time: 50 }}]
    // isRelaying=false, currentTime=55 → relevantBestTime=60 → 55 < 60 → isBest=true
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 60.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        relayingTime: {
          id: "bt-r-1",
          time: 50.0,
          created_at: "2025-01-01T00:00:00.000Z",
        },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("[Case2] 主エントリあり + isRelaying=false で非リレー記録がベスト更新でない", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: false, time: 60, relayingTime: { time: 50 }}]
    // isRelaying=false, currentTime=65 → relevantBestTime=60 → 65 > 60 → isBest=false
    // showDiff=true → diff=65-60=5.00 → "Best +5.00"
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 60.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        relayingTime: {
          id: "bt-r-1",
          time: 50.0,
          created_at: "2025-01-01T00:00:00.000Z",
        },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={65.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
      expect(screen.getByText("Best +5.00")).toBeTruthy();
    });
  });

  it("[Case3] 主エントリあり + isRelaying=true でリレー記録を relayingTime と比較（Critical #1 メインバグ検出）", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // Critical #1 バグ検出テスト（メインケース）:
    // precomputedBestTimes=[{..., is_relaying: false, time: 60, relayingTime: { time: 50 }}]
    // isRelaying=true, currentTime=55 → relevantBestTime=50(relayingTime) → 55 > 50 → isBest=false
    // 旧バグ(is_relaying条件付きfind)では match=undefined → isBest=true になっていた
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 60.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        relayingTime: {
          id: "bt-r-1",
          time: 50.0,
          created_at: "2025-01-01T00:00:00.000Z",
        },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={true}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      // relayingTime.time=50 と比較: 55 > 50 → ベストでない → diff=55-50=5.00 → "Best +5.00"
      // 旧バグがあれば isBest=true になり「🏆 Best Time!!」が表示されてテストが FAIL する
      expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
      expect(screen.getByText("Best +5.00")).toBeTruthy();
    });
  });

  it("[Case4] 主エントリあり + isRelaying=true で relayingTime がない場合は初リレー記録扱い", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: false, time: 60 }]（relayingTime なし）
    // isRelaying=true → match.is_relaying=false → match.relayingTime?.time=undefined
    // → relevantBestTime=undefined → isBest=true (初リレー記録扱い)
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 60.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
        // relayingTime なし
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={true}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("[Case5] フォールバックエントリ（is_relaying=true）+ isRelaying=true で time と比較", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: true, time: 50 }]（リレーのみユーザー）
    // isRelaying=true → match.is_relaying=true → relevantBestTime=match.time=50
    // currentTime=55 > 50 → isBest=false, diff=5.00
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 50.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: true,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={true}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
      expect(screen.getByText("Best +5.00")).toBeTruthy();
    });
  });

  it("[Case6] フォールバックエントリ（is_relaying=true）+ isRelaying=false で undefined 扱い", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: true, time: 50 }]
    // isRelaying=false → match.is_relaying=true → relevantBestTime=undefined (非リレー記録なし)
    // → isBest=true (初非リレー記録扱い)
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 50.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: true,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={false}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("🏆 Best Time!!")).toBeTruthy();
    });
  });

  it("[Case7] precomputed ブランチで同タイムはベスト扱いにならない（Critical #2 の検証）", async () => {
    const client = createMockSupabaseClient();
    mockUseAuth.mockReturnValue({ supabase: client });

    // precomputedBestTimes=[{..., is_relaying: false, time: 55 }]
    // isRelaying=false, currentTime=55 → relevantBestTime=55 → 55 < 55 = false → isBest=false
    // bestTimeDiff=55-55=0.0 → bestTimeDiff > 0 の条件を満たさないため diff テキストも表示されない
    const precomputedBestTimes = [
      {
        id: "bt-1",
        time: 55.0,
        created_at: "2025-01-01T00:00:00.000Z",
        pool_type: 1,
        is_relaying: false,
        style_id: 1,
        style: { name_jp: "自由形", distance: 100 },
      },
    ];

    render(
      <BestTimeBadge
        recordId="record-1"
        styleId={1}
        currentTime={55.0}
        recordDate="2025-03-01"
        poolType={1}
        isRelaying={false}
        showDiff={true}
        precomputedBestTimes={precomputedBestTimes}
      />,
    );

    await waitFor(
      () => {
        // 同タイム: isBest=false かつ bestTimeDiff=0 → どちらも表示されない
        expect(screen.queryByText("🏆 Best Time!!")).toBeNull();
        // bestTimeDiff > 0 のガード: 差分 0 は表示されない
        expect(screen.queryByText(/^Best \+/)).toBeNull();
      },
      { timeout: 2000 },
    );
  });
});
