import { vi } from "vitest";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder,
} from "../../__mocks__/supabase";

export type TableResponse = {
  data: unknown;
  error?: unknown;
  configure?: (builder: MockQueryBuilder) => void;
};

export const createSupabaseMock = (options: { userId?: string } = {}) => {
  const { userId } = options;
  const client = createMockSupabaseClient({ userId });
  const tableQueues = new Map<string, TableResponse[]>();
  const builderHistory = new Map<string, MockQueryBuilder[]>();

  client.from = vi.fn((table: string) => {
    const queue = tableQueues.get(table) ?? [];
    const response =
      queue.length > 0
        ? queue.shift()!
        : {
            data: [],
            error: null,
          };

    const builder = createMockQueryBuilder(response.data, response.error ?? null);
    response.configure?.(builder);

    const history = builderHistory.get(table) ?? [];
    history.push(builder);
    builderHistory.set(table, history);

    return builder;
  }) as unknown as typeof client.from;

  return {
    client,
    queueTable: (table: string, responses: TableResponse[]) => {
      tableQueues.set(table, [...responses]);
    },
    getBuilderHistory: (table: string) => builderHistory.get(table) ?? [],
    // 呼び出し側は「このテストは対象テーブルへの呼び出しがN件目まで発生する」ことを
    // arrange/act で保証した上で読む。存在しなければテストの前提自体が崩れているため、
    // undefined を黙って返さずここで失敗させる
    getBuilder: (table: string, index = 0): MockQueryBuilder => {
      const builder = (builderHistory.get(table) ?? [])[index];
      if (!builder) {
        throw new Error(`No builder recorded for table "${table}" at index ${index}`);
      }
      return builder;
    },
  };
};
