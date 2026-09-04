/**
 * CompetitionDataLoader テスト
 *
 * Sprint Contract: SSR prefetch エラーログ欠落の解消 (V-LOG-01 / V-LOG-02 / V-LOG-03)
 *
 * queryClient.prefetchQuery() は内部で `.then(noop).catch(noop)` しており、
 * queryFn が reject しても prefetchQuery 自体は常に resolve する
 * (@tanstack/query-core queryClient.js 実装より)。そのためこのテストでは
 * 「prefetch が失敗した事実がどこにも記録されず握り潰される」退行を検出するために、
 * (1) ラベル付き console.error が呼ばれること
 * (2) dehydrate() された state に、失敗したクエリが「成功」として紛れ込んでいないこと
 *     (react-query の defaultShouldDehydrateQuery は status==="success" のみ dehydrate するため、
 *      エラー時は queries が空になるのが正しい。ここが埋まっていたら「エラーを握り潰して空配列等の
 *      フェイク成功データを注入している」退行を意味する)
 * の2点を検証する。テスト対象外の CompetitionClient は浅いスタブに差し替え、
 * DataLoader 自体の prefetch エラーハンドリングだけを対象範囲とする。
 *
 * retry:false 追随: prefetchQuery に `retry: false` が付与されたため、失敗時に
 * queryFn(≒ RecordAPI.getRecords)・console.error とも「ちょうど1回」しか発火しない。
 * これを toHaveBeenCalledTimes(1) で厳密化することで retry:false が実際に効いている
 * ことを検証する(toHaveBeenCalled のような緩いアサーションだと retry:3 に戻っても
 * 検出できない)。バックオフ待ちが無くなったため、以前付けていたタイムアウト延長は撤去。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { recordKeys } from "@apps/shared/hooks/queries/keys";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
  getStyles: vi.fn(),
  getRecords: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mocks.getServerUser,
  createAuthenticatedServerClient: mocks.createAuthenticatedServerClient,
}));

vi.mock("@/lib/data-loaders/common", () => ({
  getStyles: mocks.getStyles,
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getRecords = mocks.getRecords;
  },
}));

// CompetitionClient はこのテストの対象範囲外(クライアントコンポーネント)。
// DataLoader 自体を JSX 生成のみで検証する(render はしない)ため浅いスタブに差し替える。
vi.mock("../../_client/CompetitionClient", () => ({
  default: () => null,
}));

const RECORDS_QUERY_KEY = recordKeys.list({
  startDate: undefined,
  endDate: undefined,
  styleId: undefined,
  page: 1,
  pageSize: 1000,
});

describe("CompetitionDataLoader - prefetch エラーハンドリング", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerUser.mockResolvedValue({ id: "user-1" });
    mocks.createAuthenticatedServerClient.mockResolvedValue({});
    mocks.getStyles.mockResolvedValue([]);
  });

  it("[V-LOG-01/02] Records prefetch が失敗した場合、ラベル付き console.error がちょうど1回呼ばれ(retry:falseの実証)、失敗したクエリが成功として dehydrate されない", async () => {
    const error = new Error("network down");
    mocks.getRecords.mockRejectedValue(error);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: CompetitionDataLoader } = await import("../CompetitionDataLoader");
    const element = (await CompetitionDataLoader()) as ReactElement<{
      state: { queries: Array<{ queryKey: unknown; state: { status: string } }> };
    }>;

    // V-LOG-01 + retry:false 実証: ラベル付きログが「ちょうど1回」呼ばれること。
    // toHaveBeenCalled のような緩いアサーションでは retry:3 の多重発火を検出できないため
    // 呼び出し回数を厳密化する。
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[CompetitionDataLoader] Records prefetch エラー:",
      error,
    );
    // API 呼び出し自体も retry:false によりちょうど1回のはず
    expect(mocks.getRecords).toHaveBeenCalledTimes(1);

    // V-LOG-02: 握り潰されていないこと。
    // react-query は既定で status==="success" のクエリのみ dehydrate するため、
    // reject したクエリは dehydrate 結果に含まれない=空のはず。
    // ここに要素が紛れ込んでいたら「エラーを飲み込んでフェイク成功データを注入している」退行。
    const dehydratedState = element.props.state;
    expect(dehydratedState.queries).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("[V-LOG-03] Records prefetch が成功した場合、従来どおりデータが dehydrate され console.error は呼ばれない(退行なし)", async () => {
    const records = [{ id: "rec-1" }];
    mocks.getRecords.mockResolvedValue(records);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: CompetitionDataLoader } = await import("../CompetitionDataLoader");
    const element = (await CompetitionDataLoader()) as ReactElement<{
      state: {
        queries: Array<{
          queryKey: unknown;
          state: { status: string; data: unknown };
        }>;
      };
    }>;

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "[CompetitionDataLoader] Records prefetch エラー:",
      expect.anything(),
    );
    expect(mocks.getRecords).toHaveBeenCalledTimes(1);

    const dehydratedState = element.props.state;
    expect(dehydratedState.queries).toHaveLength(1);
    expect(dehydratedState.queries[0]!.queryKey).toEqual(RECORDS_QUERY_KEY);
    expect(dehydratedState.queries[0]!.state.status).toBe("success");
    expect(dehydratedState.queries[0]!.state.data).toEqual(records);

    consoleErrorSpy.mockRestore();
  });
});
