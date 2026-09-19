/**
 * saveStyleRecords / TeamRelayRecordsAPI (mobile 種目詳細画面の保存ロジック) の
 * テスト共通: supabase クエリのチェーン可能モック。
 *
 * web 版 (`apps/web/__tests__/utils/supabaseRecordSaveMock.ts`) と同形の設計。
 * mobile は screen を render せず保存関数 (`saveStyleRecords`,
 * `scopeExistingRecordIdsForEntry`, `TeamRelayRecordsAPI.replace`) を直接呼ぶため、
 * このモックも screen 非依存の純粋な supabase フェイクとして独立させている。
 *
 * 🚨 `.eq()` を 1 段に減らしたり、引数を捨てて「常に成功」のように振る舞わせては
 *    いけない。サーバー絞り込みとクライアント filter を区別できなくなり、
 *    保存スコープが大会・種目を越えて広がっていても green のまま通り抜ける
 *    (既知のアンチパターン: test_mock_discards_query_args)。
 *    `eqCalls` / `inCalls` に列名と値を発生順で記録するので、テストは
 *    「対象の style_id / relay_kind / leg_distance 以外に触れていないこと」を
 *    直接 assert できる。
 *
 * 対応している操作 (saveStyleRecords / TeamRelayRecordsAPI が実際に使う形だけ):
 *   - `from(t).select(cols).eq(c, v).eq(c, v)`            → await で `{ data, error }`
 *   - `from(t).select(cols).in(c, vs)`                     → await で `{ data, error }`
 *     (`resolveRelayRecordIdsForRecords` の `relay_record_legs.select("relay_record_id")
 *     .in("record_id", recordIds)` の形。`op` は select のまま = 汎用の select 経路で
 *     既に処理される。`.in()` の列名・値も捨てずに `inCalls` へ記録する)
 *   - `from(t).insert(payload).select("id").single()`     → `{ data: { id }, error }`
 *   - `from(t).insert(rows)`                              → await で `{ data: null, error }`
 *   - `from(t).update(payload).eq(c, v)`                  → await で `{ data: null, error }`
 *   - `from(t).update(payload).eq(c, v).select(cols)`      → await で `{ data: rows, error }`
 *     (0行UPDATE検知用。`updateMatchedRows` でマッチ行数を制御できる。詳細は下記)
 *   - `from(t).delete().eq(c, v)` / `.delete().in(c, vs)` → await で `{ data: null, error }`
 *
 * 【修正ラウンド 2026-09-17】production (`saveStyleRecords.ts`) が
 *   `.update(payload).eq("id", id).select("id")`
 * で 0 行 UPDATE を検知して INSERT にフォールバックするようになった (High #2)。
 * 以前のこのモックは `.update()` チェーンを常に `{ data: null, error }` で解決して
 * いたため、`.select()` を挟んでも「0 行 UPDATE」と区別できず、正常系のテストでも
 * 常にフォールバックが発火してしまっていた。`.select()` を伴わない `.update()` は
 * 素の supabase-js と同じく `data: null` を返す (挙動を変えない)。`.select()` が
 * 伴った場合のみ、`updateMatchedRows` でマッチ行数を制御できる。未指定時のデフォルトは
 * 「`.eq("id", v)` があれば `[{ id: v }]` (1行ヒット)」— production の呼び出し形は
 * 必ず `.eq("id", ...)` を伴うため、明示的に 0 行を作りたいテストだけが
 * `updateMatchedRows` でオプトインすればよい。
 *
 * 意図的に対応していないもの: `order` / `range` / `upsert` / rpc。
 * 使い始めたらこのモックは `TypeError` で落ちる。
 * 「静かに undefined を返して緑のまま通る」よりそちらが望ましい。
 */

export type FakeError = { message: string; code?: string };

export interface RecordSaveEqCall {
  table: string;
  op: "select" | "update" | "delete" | "unknown";
  column: string;
  value: unknown;
}

export interface RecordSaveInCall {
  table: string;
  op: "select" | "update" | "delete" | "unknown";
  column: string;
  values: unknown[];
}

export interface RecordSaveInsertCall {
  table: string;
  payload: unknown;
}

export interface RecordSaveUpdateCall {
  table: string;
  payload: unknown;
  eq: Array<{ column: string; value: unknown }>;
}

export interface RecordSaveDeleteCall {
  table: string;
}

export interface RecordSaveSelectCall {
  table: string;
  columns: string;
}

export interface RecordSaveOperation {
  table: string;
  op: "select" | "insert" | "update" | "delete";
}

export interface RecordSaveSupabaseMockOptions {
  selectRows?: Record<string, Array<Record<string, unknown>>>;
  insertError?: (table: string, payload: unknown, nthForTable: number) => FakeError | null;
  updateError?: (table: string, payload: unknown, nthForTable: number) => FakeError | null;
  deleteError?: (table: string, nthForTable: number) => FakeError | null;
  selectError?: (table: string, nthForTable: number) => FakeError | null;
  /**
   * `.update(payload).eq(...).select(...)` の形で呼ばれたときにマッチした行を制御する。
   * `undefined` を返す (またはオプション自体を渡さない) とデフォルト挙動
   * (`.eq("id", v)` があれば `[{ id: v }]` = 1行ヒット、無ければ `[{}]`) になる。
   * 空配列を返すと「0行UPDATE」を模擬でき、production の INSERT フォールバックを
   * 意図的に起動させられる。`.select()` を伴わない `.update()` はこのオプションを
   * 経由せず常に `data: null` (素の supabase-js の挙動と同じ)。
   */
  updateMatchedRows?: (
    table: string,
    eq: ReadonlyArray<{ column: string; value: unknown }>,
    nthForTable: number,
  ) => Array<Record<string, unknown>> | undefined;
}

export interface RecordSaveSupabaseMock {
  supabase: { from: (table: string) => unknown };
  operations: RecordSaveOperation[];
  insertCalls: RecordSaveInsertCall[];
  updateCalls: RecordSaveUpdateCall[];
  deleteCalls: RecordSaveDeleteCall[];
  selectCalls: RecordSaveSelectCall[];
  eqCalls: RecordSaveEqCall[];
  inCalls: RecordSaveInCall[];
  insertedIds: Record<string, string[]>;
}

type Op = "select" | "insert" | "update" | "delete" | "unknown";

interface Counters {
  insert: Record<string, number>;
  update: Record<string, number>;
  select: Record<string, number>;
  delete: Record<string, number>;
  idSeq: Record<string, number>;
}

function bump(counter: Record<string, number>, table: string): number {
  const next = (counter[table] ?? 0) + 1;
  counter[table] = next;
  return next;
}

function issueId(counters: Counters, table: string): string {
  const seq = bump(counters.idSeq, table);
  return `fake-${table}-id-${seq}`;
}

export function buildRecordSaveSupabaseMock(
  options: RecordSaveSupabaseMockOptions = {},
): RecordSaveSupabaseMock {
  const operations: RecordSaveOperation[] = [];
  const insertCalls: RecordSaveInsertCall[] = [];
  const updateCalls: RecordSaveUpdateCall[] = [];
  const deleteCalls: RecordSaveDeleteCall[] = [];
  const selectCalls: RecordSaveSelectCall[] = [];
  const eqCalls: RecordSaveEqCall[] = [];
  const inCalls: RecordSaveInCall[] = [];
  const insertedIds: Record<string, string[]> = {};

  const counters: Counters = { insert: {}, update: {}, select: {}, delete: {}, idSeq: {} };

  const from = (table: string) => {
    let op: Op = "unknown";
    let insertNth = 0;
    let insertPayload: unknown = undefined;
    let updateNth = 0;
    let updatePayload: unknown = undefined;
    let updateCallRef: RecordSaveUpdateCall | null = null;
    let updateSelectRequested = false;
    let selectNth = 0;
    let deleteNth = 0;

    const resolveList = () => {
      if (op === "insert") {
        const error = options.insertError?.(table, insertPayload, insertNth) ?? null;
        return { data: null, error };
      }
      if (op === "update") {
        const error = options.updateError?.(table, updatePayload, updateNth) ?? null;
        if (error) return { data: null, error };
        // `.select()` を伴わない `.update()` は素の supabase-js と同じく data: null。
        if (!updateSelectRequested) return { data: null, error: null };
        const eq = updateCallRef?.eq ?? [];
        const override = options.updateMatchedRows?.(table, eq, updateNth);
        if (override !== undefined) return { data: override, error: null };
        const idEq = eq.find((e) => e.column === "id");
        return { data: idEq ? [{ id: idEq.value }] : [{}], error: null };
      }
      if (op === "delete") {
        const error = options.deleteError?.(table, deleteNth) ?? null;
        return { data: null, error };
      }
      const error = options.selectError?.(table, selectNth) ?? null;
      if (error) return { data: null, error };
      return { data: options.selectRows?.[table] ?? [], error: null };
    };

    const resolveSingle = () => {
      if (op === "insert") {
        const error = options.insertError?.(table, insertPayload, insertNth) ?? null;
        if (error) return { data: null, error };
        const id = issueId(counters, table);
        (insertedIds[table] ??= []).push(id);
        return { data: { id }, error: null };
      }
      const error = options.selectError?.(table, selectNth) ?? null;
      if (error) return { data: null, error };
      const rows = options.selectRows?.[table] ?? [];
      return { data: rows[0] ?? null, error: null };
    };

    const filterOp = (): "select" | "update" | "delete" | "unknown" =>
      op === "select" || op === "update" || op === "delete" ? op : "unknown";

    const builder = {
      insert(payload: unknown) {
        op = "insert";
        insertPayload = payload;
        insertNth = bump(counters.insert, table);
        insertCalls.push({ table, payload });
        operations.push({ table, op: "insert" });
        return builder;
      },
      update(payload: unknown) {
        op = "update";
        updatePayload = payload;
        updateNth = bump(counters.update, table);
        updateCallRef = { table, payload, eq: [] };
        updateCalls.push(updateCallRef);
        operations.push({ table, op: "update" });
        return builder;
      },
      select(columns?: string) {
        if (op === "unknown") {
          op = "select";
          selectNth = bump(counters.select, table);
          selectCalls.push({ table, columns: columns ?? "" });
          operations.push({ table, op: "select" });
        } else if (op === "update") {
          // update().eq(...).select(...) — 0行UPDATE検知用の select。
          // op は上書きしない (update のまま)。マッチ行の制御は updateMatchedRows へ。
          updateSelectRequested = true;
        }
        return builder;
      },
      delete() {
        op = "delete";
        deleteNth = bump(counters.delete, table);
        deleteCalls.push({ table });
        operations.push({ table, op: "delete" });
        return builder;
      },
      eq(column: string, value: unknown) {
        eqCalls.push({ table, op: filterOp(), column, value });
        if (op === "update" && updateCallRef) {
          updateCallRef.eq.push({ column, value });
        }
        return builder;
      },
      in(column: string, values: unknown[]) {
        inCalls.push({ table, op: filterOp(), column, values: [...values] });
        return builder;
      },
      single() {
        return Promise.resolve(resolveSingle());
      },
      maybeSingle() {
        return Promise.resolve(resolveSingle());
      },
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(resolveList()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  };

  return {
    supabase: { from },
    operations,
    insertCalls,
    updateCalls,
    deleteCalls,
    selectCalls,
    eqCalls,
    inCalls,
    insertedIds,
  };
}
