// =============================================================================
// useMemberWaPointsRecords.test.ts — QA Sprint Contract 検証 (Phase B 本実装検証)
// =============================================================================
// Sprint Contract 検証観点:
//   [V-HOOK-01] `.in("user_id", userIds)` の単一バッチクエリで全メンバー分を取得する
//     (メンバーごとの個別クエリ = N+1 になっていないこと。呼び出し回数そのものを assert)
//   [V-HOOK-02] is_relaying=true の記録は、クエリ側 (.eq) だけでなくクライアント側の
//     フィルタでも構造的に除外される (サーバー側フィルタが効かなかった場合の防御を実証する
//     ため、モックは意図的に is_relaying=true の行を含めて返す。クエリ引数を捨てるモックは
//     スコープを検証不能にするため、.eq() に渡された列名・値も別途 assert する)
//   [V-HOOK-03] pool_type=0→SCM(0) / pool_type=1→LCM(1) の向きが正しく変換される
//     (想定外値は 0 にフォールバックする防御的処理も pin する)
//   [V-HOOK-04] name_jp から解決できない種目 (STYLES に無い名称) の行はスキップされる
//   [V-HOOK-05] userIds が空配列のときはクエリを発行せず、空の Map を返す
//   [V-RACE-*] loadRecords を連続で呼び出したとき、先に発行した (古い) リクエストが
//     後から発行した (新しい) リクエストより後に解決しても、新しいリクエストの
//     結果/loading/error を上書きしない (CodeRabbit 指摘: useRef 連番ガードの回帰テスト)。
//     `waitFor` で最終状態だけを見る書き方ではこの種の競合は原理的に再現しないため、
//     deferred (resolve/reject を外部から明示的に制御できる Promise) で解決順序を
//     意図的に「新→旧」に固定して検証する。
//
// トートロジー防止メモ: 期待する pool_type/styleKey/distance の組み合わせはテスト側の
// fixture 定義そのものであり、useMemberWaPointsRecords.ts の実装をコピーしていない。
// =============================================================================

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useMemberWaPointsRecords } from "../useMemberWaPointsRecords";

interface FakeRow {
  user_id: string;
  time: number;
  pool_type: number;
  is_relaying: boolean;
  styles: { name_jp: string; distance: number } | { name_jp: string; distance: number }[] | null;
}

function buildSupabaseMock(rows: FakeRow[]) {
  const selectCalls: string[] = [];
  const inCalls: { column: string; ids: string[] }[] = [];
  const eqCalls: { column: string; value: unknown }[] = [];

  const from = vi.fn((_table: string) => ({
    select: vi.fn((sel: string) => {
      selectCalls.push(sel);
      return {
        in: vi.fn((column: string, ids: string[]) => {
          inCalls.push({ column, ids });
          return {
            eq: vi.fn((col: string, val: unknown) => {
              eqCalls.push({ column: col, value: val });
              // 意図的にサーバー側フィルタが効かなかったケースを模倣し、
              // is_relaying=true の行を含んだまま返す (クライアント側フィルタの実証用)
              return Promise.resolve({ data: rows, error: null });
            }),
          };
        }),
      };
    }),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = { from } as any;
  return { supabase, from, selectCalls, inCalls, eqCalls };
}

describe("useMemberWaPointsRecords", () => {
  it("[V-HOOK-01] .in(\"user_id\", userIds) の単一バッチクエリで全メンバー分を取得する (N+1 でないこと)", async () => {
    const rows: FakeRow[] = [
      { user_id: "u-1", time: 30.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
      { user_id: "u-2", time: 31.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
      { user_id: "u-3", time: 32.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
    ];
    const { supabase, from, inCalls } = buildSupabaseMock(rows);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(["u-1", "u-2", "u-3"]);
    });

    // records テーブルへの from() 呼び出しは1回だけ (メンバーごとに3回呼ばれていない)
    expect(from).toHaveBeenCalledTimes(1);
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0]).toEqual({ column: "user_id", ids: ["u-1", "u-2", "u-3"] });
    expect(result.current.recordsByUserId.size).toBe(3);
  });

  it("[V-HOOK-02] is_relaying=true の記録は、サーバー側フィルタが効かなくてもクライアント側で除外される", async () => {
    const rows: FakeRow[] = [
      { user_id: "u-1", time: 30.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
      // サーバー側 .eq("is_relaying", false) が効かなかった想定の混入行
      { user_id: "u-1", time: 20.0, pool_type: 0, is_relaying: true, styles: { name_jp: "50m自由形", distance: 50 } },
    ];
    const { supabase, eqCalls } = buildSupabaseMock(rows);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(["u-1"]);
    });

    // クエリ側フィルタが正しい列・値で発火していること (クエリ引数を捨てないモックの保証)
    expect(eqCalls).toEqual([{ column: "is_relaying", value: false }]);

    // クライアント側フィルタにより is_relaying=true の行 (time=20.0) は結果に含まれない
    const records = result.current.recordsByUserId.get("u-1") ?? [];
    expect(records).toHaveLength(1);
    expect(records[0].time).toBe(30.0);
  });

  it("[V-HOOK-03] pool_type=1 は LCM(1) に、pool_type=0 は SCM(0) に変換される", async () => {
    const rows: FakeRow[] = [
      { user_id: "u-1", time: 30.0, pool_type: 1, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
      { user_id: "u-1", time: 31.0, pool_type: 0, is_relaying: false, styles: { name_jp: "100m自由形", distance: 100 } },
    ];
    const { supabase } = buildSupabaseMock(rows);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(["u-1"]);
    });

    const records = result.current.recordsByUserId.get("u-1") ?? [];
    const lcm = records.find((r) => r.time === 30.0);
    const scm = records.find((r) => r.time === 31.0);
    expect(lcm?.poolType).toBe(1);
    expect(scm?.poolType).toBe(0);
  });

  it("[V-HOOK-03b] pool_type が想定外の値 (例: 2) の場合は 0(SCM) にフォールバックする (DBの値自体は再解釈しない防御)", async () => {
    const rows: FakeRow[] = [
      { user_id: "u-1", time: 30.0, pool_type: 2, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
    ];
    const { supabase } = buildSupabaseMock(rows);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(["u-1"]);
    });

    const records = result.current.recordsByUserId.get("u-1") ?? [];
    expect(records[0].poolType).toBe(0);
  });

  it("[V-HOOK-04] STYLES に解決できない種目名の行はスキップされる", async () => {
    const rows: FakeRow[] = [
      { user_id: "u-1", time: 30.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m自由形", distance: 50 } },
      { user_id: "u-1", time: 10.0, pool_type: 0, is_relaying: false, styles: { name_jp: "50m未知種目", distance: 50 } },
    ];
    const { supabase } = buildSupabaseMock(rows);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(["u-1"]);
    });

    const records = result.current.recordsByUserId.get("u-1") ?? [];
    expect(records).toHaveLength(1);
    expect(records[0].time).toBe(30.0);
  });

  it("[V-HOOK-05] userIds が空配列のときはクエリを発行せず、空の Map になる", async () => {
    const { supabase, from } = buildSupabaseMock([]);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords([]);
    });

    expect(from).not.toHaveBeenCalled();
    expect(result.current.recordsByUserId.size).toBe(0);
  });
});

// =============================================================================
// チャンク分割 (USER_ID_CHUNK_SIZE) — PM 追加依頼 (Developer 修正2 の再検証)
// =============================================================================
// Sprint Contract 検証観点:
//   [V-CHUNK-01] userIds が 250件のとき、クエリ (.from() 呼び出し) が複数回に分割して
//     発行される (メンバー1人1クエリの N+1 には戻っていないこと、かつ単一クエリに
//     全件を詰め込んでもいないこと)。回数そのものを厳密一致で assert する
//     (「1回以上呼ばれた」のような緩い assert は N+1 への退行もチャンク未分割への
//     退行も検出できないため使わない)。
//   [V-CHUNK-02] 各チャンクに渡された userId の集合が、重複・欠落なく元の250件と
//     完全に一致する (チャンク境界のオフバイワンによる取りこぼし/重複を検出する)。
//   [V-CHUNK-03] 3チャンク分の結果が正しくマージされ、250人全員分の記録が
//     recordsByUserId に欠落なく格納される (各ユーザーのタイム値を個別に検証し、
//     取り違え・重複が無いことを保証する)。
//
// モック方針: 前段の buildSupabaseMock は `.in()` に渡された ids を無視して常に
// 固定データを返す簡易モックだが、本 describe ではチャンクの境界・重複を検証する
// ため意図的に別実装とし、`.in()` に渡された ids でサーバー側フィルタを実際に
// 模倣する (クエリ引数を捨てるモックはチャンク網羅性を検証不能にするため)。
// =============================================================================
describe("useMemberWaPointsRecords - チャンク分割 (USER_ID_CHUNK_SIZE)", () => {
  interface ChunkAwareRow {
    user_id: string;
    time: number;
    pool_type: number;
    is_relaying: boolean;
    styles: { name_jp: string; distance: number };
  }

  /**
   * `.in("user_id", ids)` に渡された ids でサーバー側フィルタを実際に模倣するモック。
   * (buildSupabaseMock と異なり ids を無視しない)
   */
  function buildChunkAwareSupabaseMock(allRowsByUserId: Map<string, ChunkAwareRow>) {
    const fromCalls: string[] = [];
    const inCalls: string[][] = [];

    const from = vi.fn((table: string) => {
      fromCalls.push(table);
      return {
        select: vi.fn(() => ({
          in: vi.fn((_column: string, ids: string[]) => {
            inCalls.push(ids);
            const data = ids
              .map((id) => allRowsByUserId.get(id))
              .filter((row): row is ChunkAwareRow => row !== undefined);
            return {
              eq: vi.fn(() => Promise.resolve({ data, error: null })),
            };
          }),
        })),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from } as any;
    return { supabase, fromCalls, inCalls };
  }

  const TOTAL_USERS = 250;

  function buildLargeFixture(): { userIds: string[]; rowsByUserId: Map<string, ChunkAwareRow> } {
    const userIds: string[] = [];
    const rowsByUserId = new Map<string, ChunkAwareRow>();
    for (let i = 0; i < TOTAL_USERS; i++) {
      const id = `u-${String(i).padStart(4, "0")}`;
      userIds.push(id);
      rowsByUserId.set(id, {
        user_id: id,
        // 各ユーザーごとに一意なタイムにし、マージ後の取り違え・重複を検出可能にする
        time: 30 + i * 0.01,
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
      });
    }
    return { userIds, rowsByUserId };
  }

  it("[V-CHUNK-01] 250人のとき、.from() が複数回 (3回) に分割して発行される (N+1 にも単一クエリにもなっていない)", async () => {
    const { userIds, rowsByUserId } = buildLargeFixture();
    const { supabase, fromCalls } = buildChunkAwareSupabaseMock(rowsByUserId);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(userIds);
    });

    // 250人に対して 250 回 (N+1) でも 1 回 (未分割) でもなく、
    // USER_ID_CHUNK_SIZE=100 による ceil(250/100)=3 回であることを厳密一致で確認する。
    expect(fromCalls).toHaveLength(3);
  });

  it("[V-CHUNK-02] 各チャンクに渡された userId は重複・欠落なく元の250件と完全に一致する", async () => {
    const { userIds, rowsByUserId } = buildLargeFixture();
    const { supabase, inCalls } = buildChunkAwareSupabaseMock(rowsByUserId);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(userIds);
    });

    const flattened = inCalls.flat();

    // 欠落なし: 元の250件が1件残らずどこかのチャンクに含まれる
    const flattenedSet = new Set(flattened);
    for (const id of userIds) {
      expect(flattenedSet.has(id)).toBe(true);
    }

    // 重複なし: チャンク境界のオフバイワンで同じ id が2チャンクに混入していない
    expect(flattened.length).toBe(new Set(flattened).size);

    // 過不足なし: 合計件数が元の250件と一致する (取りこぼしも水増しも無い)
    expect(flattened.length).toBe(TOTAL_USERS);
  });

  it("[V-CHUNK-03] 3チャンク分の結果が正しくマージされ、250人全員分の記録が欠落・取り違えなく格納される", async () => {
    const { userIds, rowsByUserId } = buildLargeFixture();
    const { supabase } = buildChunkAwareSupabaseMock(rowsByUserId);
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    await act(async () => {
      await result.current.loadRecords(userIds);
    });

    expect(result.current.recordsByUserId.size).toBe(TOTAL_USERS);

    // 全員分について、対応するタイムが正しく (取り違えなく) 格納されていることを検証する
    // (先頭・末尾・チャンク境界付近を含め全件チェックする)
    for (const id of userIds) {
      const expectedRow = rowsByUserId.get(id)!;
      const records = result.current.recordsByUserId.get(id);
      expect(records).toBeDefined();
      expect(records).toHaveLength(1);
      expect(records![0].time).toBe(expectedRow.time);
    }
  });
});

// =============================================================================
// 競合するリクエストの解決順序 (V-RACE) — CodeRabbit 指摘の回帰テスト
// =============================================================================
// loadRecords は WaPointsCompareModal の visible / memberUserIds いずれの変化からも
// 連続で呼ばれうる。古い呼び出しの Promise.all が未解決のまま残り、それが新しい
// 呼び出しより後に解決すると新しい結果を上書きしてしまう回帰を防ぐ。
// waitFor で最終状態だけを見る書き方ではこの競合は再現しないため、resolve/reject を
// 外部から明示的に制御できる deferred で解決順序を「新→旧」に固定して検証する。
describe("useMemberWaPointsRecords - 競合するリクエストの解決順序 (V-RACE)", () => {
  interface DeferredCall {
    userIds: string[];
    resolve: (value: { data: unknown; error: unknown }) => void;
    reject: (reason: unknown) => void;
  }

  function buildDeferredSupabaseMock() {
    const calls: DeferredCall[] = [];

    const from = vi.fn((_table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn((_column: string, ids: string[]) => ({
          eq: vi.fn(() => {
            let resolve!: DeferredCall["resolve"];
            let reject!: DeferredCall["reject"];
            const promise = new Promise<{ data: unknown; error: unknown }>((res, rej) => {
              resolve = res;
              reject = rej;
            });
            calls.push({ userIds: ids, resolve, reject });
            return promise;
          }),
        })),
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from } as any;
    return { supabase, calls };
  }

  const rowFor = (userId: string, time: number) => ({
    user_id: userId,
    time,
    pool_type: 0,
    is_relaying: false,
    styles: { name_jp: "50m自由形", distance: 50 },
  });

  it("[V-RACE-01] 古いリクエストが新しいリクエストより後に解決しても、新しい結果を上書きしない", async () => {
    const { supabase, calls } = buildDeferredSupabaseMock();
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    let oldPromise!: Promise<void>;
    let newPromise!: Promise<void>;

    act(() => {
      oldPromise = result.current.loadRecords(["u-old"]);
    });
    act(() => {
      newPromise = result.current.loadRecords(["u-new"]);
    });

    // 2回の loadRecords 呼び出しに対応する2件のクエリが (解決順序に関わらず) 発行されている
    expect(calls).toHaveLength(2);

    // 新しい (2番目の) リクエストを先に解決する
    await act(async () => {
      calls[1].resolve({ data: [rowFor("u-new", 30.0)], error: null });
      await newPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.recordsByUserId.has("u-new")).toBe(true);
    expect(result.current.recordsByUserId.has("u-old")).toBe(false);

    // 古い (1番目の) リクエストを後から解決する。新しい結果を上書きしてはならない
    await act(async () => {
      calls[0].resolve({ data: [rowFor("u-old", 99.0)], error: null });
      await oldPromise;
    });

    expect(result.current.recordsByUserId.size).toBe(1);
    expect(result.current.recordsByUserId.has("u-new")).toBe(true);
    expect(result.current.recordsByUserId.has("u-old")).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("[V-RACE-02] 古いリクエストが後で reject しても、新しいリクエストの正常な結果と loading/error を上書きしない", async () => {
    const { supabase, calls } = buildDeferredSupabaseMock();
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    let oldPromise!: Promise<void>;
    let newPromise!: Promise<void>;

    act(() => {
      oldPromise = result.current.loadRecords(["u-old"]);
    });
    act(() => {
      newPromise = result.current.loadRecords(["u-new"]);
    });

    expect(calls).toHaveLength(2);

    await act(async () => {
      calls[1].resolve({ data: [rowFor("u-new", 30.0)], error: null });
      await newPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.recordsByUserId.has("u-new")).toBe(true);

    // 古いリクエストが後からエラーで解決する。新しい正常な状態を破壊してはならない
    await act(async () => {
      calls[0].reject(new Error("stale request failed"));
      await oldPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.recordsByUserId.has("u-new")).toBe(true);
    expect(result.current.recordsByUserId.size).toBe(1);
  });

  it("[V-RACE-03] userIds.length===0 の早期return経路も、古いリクエストの遅延解決に上書きされない", async () => {
    const { supabase, calls } = buildDeferredSupabaseMock();
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    let oldPromise!: Promise<void>;

    // 1件目 (古い): 通常のクエリを発行する (まだ解決しない)
    act(() => {
      oldPromise = result.current.loadRecords(["u-old"]);
    });
    expect(calls).toHaveLength(1);

    // 2件目 (新しい): userIds=[] の早期return経路。同期的に空Mapへ更新される
    await act(async () => {
      await result.current.loadRecords([]);
    });

    expect(result.current.recordsByUserId.size).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    // 古いリクエストを後から解決する。空Mapの状態を上書きしてはならない
    await act(async () => {
      calls[0].resolve({ data: [rowFor("u-old", 30.0)], error: null });
      await oldPromise;
    });

    expect(result.current.recordsByUserId.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("[V-RACE-04] まだ解決していない新しいリクエストがある間は、古いリクエストの finally が loading を早期に false へ戻さない", async () => {
    // 前例: web 側で `.finally()` だけガードを外した実装が Critical になったことがある
    // (finally は catch/成功どちらの経路でも実行されるため、ここだけガード漏れがあると
    // 他の分岐が正しくても loading の見た目だけ壊れる)。
    const { supabase, calls } = buildDeferredSupabaseMock();
    const { result } = renderHook(() => useMemberWaPointsRecords(supabase));

    let oldPromise!: Promise<void>;
    let newPromise!: Promise<void>;

    act(() => {
      oldPromise = result.current.loadRecords(["u-old"]);
    });
    act(() => {
      newPromise = result.current.loadRecords(["u-new"]);
    });

    expect(calls).toHaveLength(2);
    expect(result.current.loading).toBe(true);

    // 新しい (2番目の) リクエストがまだ未解決のうちに、古い (1番目の) リクエストだけを解決する
    await act(async () => {
      calls[0].resolve({ data: [rowFor("u-old", 99.0)], error: null });
      await oldPromise;
    });

    // 新しいリクエストがまだ進行中なので、loading は true のままでなければならない
    expect(result.current.loading).toBe(true);

    // 新しいリクエストを解決すると、ここで初めて loading が false になる
    await act(async () => {
      calls[1].resolve({ data: [rowFor("u-new", 30.0)], error: null });
      await newPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.recordsByUserId.has("u-new")).toBe(true);
    expect(result.current.recordsByUserId.has("u-old")).toBe(false);
  });
});
