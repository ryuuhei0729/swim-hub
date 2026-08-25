/**
 * TeamCompetitions の自己記録導線テスト共通: supabase クエリの汎用チェーン可能モック。
 *
 * 背景 (PM裁定 / C3):
 * 従来 各テストファイルが個別に持っていた buildSupabaseMock は `.eq()` を1回しか
 * チェーンできず、かつ引数を無視して常に固定の rows を返していた。これにより
 * 「サーバー側で正しく絞り込んでいるか」をテストで検証できず、C3 (他メンバーの
 * 記録の過剰取得) が検出できなかった。
 *
 * このモックは:
 * - `.eq()` を複数回チェーンできる (`.eq(...).eq(...)` も可)
 * - 呼ばれた `.eq()` の列名・値を実際にフィルタへ反映する (無視しない)
 * - `records.user_id` のような埋め込みリレーション列パスは、行の `records` 配列を
 *   絞り込む embedded `!inner` フィルタとして解釈する
 * - `.from("records")` で直接クエリされた場合も動作するよう、`rows[].records` を
 *   `competition_id` 付きでフラット化した仮想 records テーブルを用意する
 *   (将来の C3 再実装が `records` テーブル直クエリ + `.eq("competition_id",...)
 *   .eq("user_id",...)` に変わっても、このモックを差し替えずに使えるようにする)
 * - `.order()` は実際に並び替え、`.range()` は実際にスライスする
 *   (「直近50件」の境界条件をテストで再現できるようにする)
 * - クエリビルダー自身が thenable (`.then` を持つ) なので、`.order()`/`.range()`
 *   を経由しない `await supabase.from(...).select(...).eq(...).eq(...)` も解決できる
 */

export interface EqCall {
  column: string;
  value: unknown;
}

export interface CompetitionMockRow {
  id: string;
  date?: string;
  team_id?: string;
  entries?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown> & { user_id?: string }>;
  [key: string]: unknown;
}

interface QueryState {
  table: string;
  filters: EqCall[];
  head: boolean;
}

type QueryResult = { data: unknown; error: null } | { count: number; error: null };

function stripEmbeddedPrefix(column: string): { relation?: string; field: string } {
  const dotIndex = column.indexOf(".");
  if (dotIndex === -1) return { field: column };
  return { relation: column.slice(0, dotIndex), field: column.slice(dotIndex + 1) };
}

function flattenRecordsTable(rows: CompetitionMockRow[]): Array<Record<string, unknown>> {
  return rows.flatMap((row) =>
    (row.records || []).map((record) => ({ ...record, competition_id: row.id })),
  );
}

function applyFilters(
  rows: CompetitionMockRow[],
  table: string,
  filters: EqCall[],
): Array<Record<string, unknown>> {
  if (table === "records") {
    let dataset = flattenRecordsTable(rows);
    for (const { column, value } of filters) {
      const { field } = stripEmbeddedPrefix(column);
      dataset = dataset.filter((record) => record[field] === value);
    }
    return dataset;
  }

  // デフォルト (competitions 等、埋め込みリレーション select を含む場合がある)
  let dataset: CompetitionMockRow[] = rows;
  for (const { column, value } of filters) {
    const { relation, field } = stripEmbeddedPrefix(column);
    if (relation) {
      // 埋め込みリレーションの eq フィルタ (例: "records.user_id") は
      // !inner と組み合わさる前提で、対象配列を絞り込み、1件も残らない行は
      // (INNER JOIN 同様) 結果から除外する。
      dataset = dataset
        .map((row) => {
          const nested = (row[relation] as Array<Record<string, unknown>> | undefined) || [];
          return { ...row, [relation]: nested.filter((item) => item[field] === value) };
        })
        .filter((row) => ((row[relation] as unknown[]) || []).length > 0);
    } else {
      dataset = dataset.filter((row) => row[field] === value);
    }
  }
  return dataset;
}

function createQueryBuilder(
  rows: CompetitionMockRow[],
  state: QueryState,
  eqCalls: EqCall[],
) {
  const resolve = (): QueryResult => {
    const filtered = applyFilters(rows, state.table, state.filters);
    if (state.head) {
      return { count: filtered.length, error: null };
    }
    return { data: filtered, error: null };
  };

  const builder = {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value });
      return createQueryBuilder(rows, { ...state, filters: [...state.filters, { column, value }] }, eqCalls);
    },
    order(column: string, opts?: { ascending?: boolean }) {
      const ascending = opts?.ascending ?? true;
      const filtered = applyFilters(rows, state.table, state.filters) as CompetitionMockRow[];
      const sorted = [...filtered].sort((a, b) => {
        const av = String(a[column] ?? "");
        const bv = String(b[column] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return createOrderedBuilder(sorted, state, eqCalls);
    },
    range(from: number, to: number) {
      const filtered = applyFilters(rows, state.table, state.filters);
      return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
    },
    single() {
      const filtered = applyFilters(rows, state.table, state.filters);
      return Promise.resolve({ data: filtered[0] ?? null, error: null });
    },
    then(
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

// order() 後は既にソート済みデータを保持したうえで、range() のスライス対象にする
// 「並び替え後の配列」を保持する専用ビルダー。
function createOrderedBuilder(
  sortedRows: Array<Record<string, unknown>>,
  state: QueryState,
  eqCalls: EqCall[],
) {
  return {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value });
      return createOrderedBuilder(
        sortedRows.filter((row) => row[column] === value),
        state,
        eqCalls,
      );
    },
    range(from: number, to: number) {
      return Promise.resolve({ data: sortedRows.slice(from, to + 1), error: null });
    },
    then(
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data: sortedRows, error: null } as QueryResult).then(
        onFulfilled,
        onRejected,
      );
    },
  };
}

export interface SupabaseCompetitionsMockHandle {
  supabase: { from: (table: string) => unknown };
  /** テスト中に呼ばれた全ての .eq() 呼び出し (列名・値) を発生順に記録する。
   * 「サーバー側で正しい条件を渡しているか」をテストで直接検証するために使う
   * (クライアント側の多重防御フィルタで結果的に隠れているだけ、を PASS にしないため)。 */
  eqCalls: EqCall[];
}

export function buildSupabaseCompetitionsMock(
  rows: CompetitionMockRow[],
): SupabaseCompetitionsMockHandle {
  const eqCalls: EqCall[] = [];

  const from = (table: string) => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      const state: QueryState = { table, filters: [], head: !!opts?.head };
      return createQueryBuilder(rows, state, eqCalls);
    },
  });

  return { supabase: { from }, eqCalls };
}
