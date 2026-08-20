// =============================================================================
// テスト専用ヘルパー: テーブル名で分岐する軽量 supabase モック
// =============================================================================
// QA (Evaluator) が所有するテスト支援コード。プロダクションコードではない。
//
// 各画面の pull-to-refresh 検証テスト (DashboardScreen 等) で、react-query の
// フック自体は実物のまま QueryClientProvider 配下で動かし、supabase への
// 実ネットワーク呼び出しだけをテーブル名ベースでスタブする。
// PostgREST の builder チェーン (.select().eq()... -> then/single) を模倣する。

import { vi } from "vitest";

export interface TableFixture {
  data: unknown;
  error?: unknown;
}

export interface TableDispatchSupabase {
  client: {
    auth: { getUser: ReturnType<typeof vi.fn> };
    from: ReturnType<typeof vi.fn>;
    channel: ReturnType<typeof vi.fn>;
    removeChannel: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
  };
  /** テーブルごとの実 fetch (then/single が解決された) 回数 */
  fetchCounts: Record<string, number>;
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "is",
  "like",
  "ilike",
  "in",
  "contains",
  "overlaps",
  "or",
  "order",
  "limit",
  "range",
  "returns",
] as const;

/**
 * テーブル名 -> 固定レスポンスのマップから、テーブル名で分岐する supabase クライアント
 * モックを作る。フィルタ条件 (.eq 等) の中身は見ない (このテストの関心事は
 * 「そのテーブルへの queryFn が再実行されたか」の回数であり、データの正しさではない)。
 */
export function createTableDispatchSupabase(options: {
  userId: string;
  tables: Record<string, TableFixture>;
  defaultTable?: TableFixture;
}): TableDispatchSupabase {
  const { userId, tables, defaultTable = { data: [], error: null } } = options;
  const fetchCounts: Record<string, number> = {};

  function buildBuilder(table: string) {
    const fixture = tables[table] ?? defaultTable;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = vi.fn(() => builder);
    }
    const resolve = () => {
      fetchCounts[table] = (fetchCounts[table] ?? 0) + 1;
      return Promise.resolve({ data: fixture.data, error: fixture.error ?? null });
    };
    builder.single = vi.fn(() => resolve());
    builder.maybeSingle = vi.fn(() => resolve());
    builder.then = (
      onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => resolve().then(onFulfilled, onRejected);
    return builder;
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: userId, email: "qa-drift-test@example.com" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => buildBuilder(table)),
    channel: vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ch: any = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };

  return { client, fetchCounts };
}
