/**
 * RecordClient (大会の記録入力) の保存フローテスト共通: supabase クエリのチェーン可能モック。
 *
 * 背景 (第3弾 / リレーのチーム記録化):
 *   `apps/web/__tests__/records/` の 3 ファイルは、それぞれ自前の supabase フェイクを
 *   `vi.hoisted` 内に持っていた。そのフェイクは
 *       eq: () => Promise.resolve({ error: null })
 *   と定義されていたため **`.eq()` が Promise を返し、2 段目の `.eq()` が存在しなかった**。
 *   `replaceRelayRecords` が
 *       .select(...).eq("team_id", ...).eq("competition_id", ...)
 *   を要求した時点で `TypeError: ....eq is not a function` になった。
 *
 * 🚨 これを「`.eq()` を 1 段に減らす」(= `competition_id` をクライアント側 filter に
 *    落とす) 方向で解決してはいけない。サーバー絞り込みとクライアント filter を
 *    区別できなくなり、過去に情報露出が全 green のまま通り抜けた既知のアンチパターンである
 *    (`supabaseCompetitionsMock.ts` の docstring / C3 と同じ罠)。
 *    このモックは **`.eq()` を任意段チェーンでき、かつ引数を捨てない**。
 *    `eqCalls` / `inCalls` に列名と値を発生順で記録するので、テストは
 *    「`team_id` と `competition_id` の両方でサーバー絞り込みを要求していること」を
 *    直接 assert できる。
 *
 * 対応している操作 (RecordClient.tsx が実際に使う形だけ):
 *   - `from(t).select(cols).eq(c, v).eq(c, v)`            → await で `{ data, error }`
 *   - `from(t).insert(payload).select("id").single()`     → `{ data: { id }, error }`
 *   - `from(t).insert(rows)`                              → await で `{ data: null, error }`
 *   - `from(t).update(payload).eq(c, v)`                  → await で `{ data: null, error }`
 *   - `from(t).delete().eq(c, v)` / `.delete().in(c, vs)` → await で `{ data: null, error }`
 *
 * `update` は upsert 化 (Sprint #records-upsert) で QA (Phase B) が追加した。追加時も
 * 「クエリ引数を捨てない」原則を維持する: `.update()` に渡された payload そのものと、
 * 続く `.eq()` の列名・値の両方を `updateCalls` に記録するので、テストは
 * 「どのテーブルに・どの payload で・どの `.eq()` 条件で」UPDATE したかを直接 assert できる
 * (`eqCalls` にも `op: "update"` として同時に記録されるので、単に列名だけを見たい場合は
 * そちらでも良い)。
 *
 * 【修正ラウンド 2026-09-17】production (`RecordClient.tsx`) が
 *   `.update(payload).eq("id", id).select("id")`
 * で 0 行 UPDATE を検知して INSERT にフォールバックするようになった (High #2)。
 * 以前のこのモックは `.update()` チェーンを常に `{ data: null, error }` で解決して
 * いたため、`.select()` を挟んでも「0 行 UPDATE」と区別できず、**正常系のテストでも
 * 常にフォールバックが発火してしまっていた** (production 側は正しいのに、モックの
 * 表現力不足でテストが割れる状態)。
 *
 * `.select()` を伴わない `.update()` は素の supabase-js と同じく `data: null` を返す
 * (挙動を変えない)。`.select()` が伴った場合のみ、`updateMatchedRows` でマッチ行数を
 * 制御できる。未指定時のデフォルトは「`.eq("id", v)` があれば `[{ id: v }]` (1行ヒット)」
 * — production の呼び出し形は必ず `.eq("id", ...)` を伴うため、明示的に 0 行を作りたい
 * テストだけが `updateMatchedRows` でオプトインすればよい。
 */

export type FakeError = { message: string; code?: string };

export interface RecordSaveEqCall {
  /** `from()` に渡されたテーブル名 */
  table: string;
  /** その `.eq()` がどの操作の絞り込みだったか */
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

/**
 * `.update(payload).eq(c, v)...` の1呼び出し分。`eq` はこの update チェーンに続いた
 * `.eq()` だけを発生順に集める (他のチェーンの `.eq()` は混ざらない)。
 */
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

/**
 * すべての操作を発生順に 1 本の列として記録する。
 *
 * `insertCalls` / `deleteCalls` は別配列なので、それだけでは
 * 「insert → delete の順序」を証明できない。差し替えの順序を逆にすると
 * insert 失敗で記録が完全に消えるため、順序そのものが検証対象になる。
 */
export interface RecordSaveOperation {
  table: string;
  op: "select" | "insert" | "update" | "delete";
}

export interface RecordSaveSupabaseMockOptions {
  /**
   * `.select()` が返す行 (テーブル名キー)。未指定のテーブルは空配列。
   * `relay_records` に既存行を仕込むと「古い行の delete」の検証ができる。
   */
  selectRows?: Record<string, Array<Record<string, unknown>>>;
  /**
   * insert を失敗させる。`null` を返せば成功。
   * @param nthForTable そのテーブルへの insert が何回目か (1 始まり)
   */
  insertError?: (table: string, payload: unknown, nthForTable: number) => FakeError | null;
  /** update を失敗させる。`null` を返せば成功
   * @param nthForTable そのテーブルへの update が何回目か (1 始まり)
   */
  updateError?: (table: string, payload: unknown, nthForTable: number) => FakeError | null;
  /**
   * `.update(payload).eq(...).select(...)` の形で呼ばれたときにマッチした行を制御する。
   * `undefined` を返す (またはオプション自体を渡さない) とデフォルト挙動
   * (`.eq("id", v)` があれば `[{ id: v }]` = 1行ヒット、無ければ `[{}]`) になる。
   * **空配列を返すと「0行UPDATE」を模擬でき、production の INSERT フォールバックを
   * 意図的に起動させられる。**
   * `.select()` を伴わない `.update()` はこのオプションを経由せず常に `data: null`
   * (素の supabase-js の挙動と同じ)。
   * @param eq その update チェーンに続いた `.eq()` を発生順に並べたもの
   * @param nthForTable そのテーブルへの update が何回目か (1 始まり)
   */
  updateMatchedRows?: (
    table: string,
    eq: ReadonlyArray<{ column: string; value: unknown }>,
    nthForTable: number,
  ) => Array<Record<string, unknown>> | undefined;
  /** delete を失敗させる。`null` を返せば成功 */
  deleteError?: (table: string, nthForTable: number) => FakeError | null;
  /** select を失敗させる。`null` を返せば成功 */
  selectError?: (table: string, nthForTable: number) => FakeError | null;
}

export interface RecordSaveSupabaseMock {
  /** `useAuth().supabase` に流し込む本体 */
  supabase: { from: (table: string) => unknown };
  /** 全操作の発生順 (順序の検証に使う) */
  operations: RecordSaveOperation[];
  insertCalls: RecordSaveInsertCall[];
  /** `.update(payload).eq()...` を発生順に記録する (payload と eq 条件を捨てない) */
  updateCalls: RecordSaveUpdateCall[];
  deleteCalls: RecordSaveDeleteCall[];
  selectCalls: RecordSaveSelectCall[];
  /** `.eq()` の列名・値を発生順に記録する (引数を捨てない) */
  eqCalls: RecordSaveEqCall[];
  /** `.in()` の列名・値を発生順に記録する */
  inCalls: RecordSaveInCall[];
  /** `insert().select().single()` で払い出した id (テーブル名キー・発生順) */
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

/**
 * insert に払い出す id。テーブル名を含めた固有の文字列にして、
 * `relay_record_legs.record_id` が `records` の id を指しているのか
 * `relay_records` の id を指しているのかをテスト側で区別できるようにする。
 */
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
    // 1 つの `from()` で始まるチェーンの状態。`op` は最初に呼ばれた
    // insert / update / select / delete で確定する。
    let op: Op = "unknown";
    let insertNth = 0;
    let insertPayload: unknown = undefined;
    let updateNth = 0;
    let updatePayload: unknown = undefined;
    let updateCallRef: RecordSaveUpdateCall | null = null;
    let updateSelectRequested = false;
    let selectNth = 0;
    let deleteNth = 0;

    /** await されたときの解決値 (`.single()` を経由しない形) */
    const resolveList = () => {
      if (op === "insert") {
        const error = options.insertError?.(table, insertPayload, insertNth) ?? null;
        return { data: null, error };
      }
      if (op === "update") {
        const error = options.updateError?.(table, updatePayload, updateNth) ?? null;
        if (error) return { data: null, error };
        // `.select()` を伴わない `.update()` は素の supabase-js と同じく data: null
        // (この分岐が既存の「常に null」挙動を保つ)。
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
      // select (および op 未確定) は行配列を返す
      const error = options.selectError?.(table, selectNth) ?? null;
      if (error) return { data: null, error };
      return { data: options.selectRows?.[table] ?? [], error: null };
    };

    /** `.single()` の解決値 */
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

    /** `.eq()` / `.in()` の記録に使う操作種別 (insert には絞り込みが来ない) */
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
        // insert().select("id") は「insert の戻り列指定」なので op を上書きしない
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
