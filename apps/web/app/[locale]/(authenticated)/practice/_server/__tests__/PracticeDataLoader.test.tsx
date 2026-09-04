/**
 * PracticeDataLoader テスト
 *
 * Sprint Contract: SSR prefetch エラーログ欠落の解消 (V-LOG-01 / V-LOG-02 / V-LOG-03)
 *
 * CompetitionDataLoader.test.tsx と同じ観点。queryClient.prefetchQuery() は内部で
 * `.then(noop).catch(noop)` するため queryFn の reject では自身は落ちない
 * (@tanstack/query-core queryClient.js 実装より)。そのため
 * (1) ラベル付き console.error が呼ばれること
 * (2) dehydrate() された state に、失敗したクエリが「成功」として紛れ込んでいないこと
 * の2点で「エラーが握り潰されていないこと」を検証する。
 * PracticeClient は対象範囲外のため浅いスタブに差し替える。
 *
 * retry:false 追随: prefetchQuery に `retry: false` が付与されたため、失敗時に
 * queryFn(≒ PracticeAPI.getPractices)・console.error とも「ちょうど1回」しか発火しない。
 * これを toHaveBeenCalledTimes(1) で厳密化することで retry:false が実際に効いている
 * ことを検証する。バックオフ待ちが無くなったため、以前付けていたタイムアウト延長は撤去。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
  getStyles: vi.fn(),
  getUserTags: vi.fn(),
  getPractices: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mocks.getServerUser,
  createAuthenticatedServerClient: mocks.createAuthenticatedServerClient,
}));

vi.mock("@/lib/data-loaders/common", () => ({
  getStyles: mocks.getStyles,
  getUserTags: mocks.getUserTags,
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPractices = mocks.getPractices;
  },
}));

// PracticeClient はこのテストの対象範囲外(クライアントコンポーネント)。
// DataLoader 自体を JSX 生成のみで検証する(render はしない)ため浅いスタブに差し替える。
vi.mock("../../_client/PracticeClient", () => ({
  default: () => null,
}));

describe("PracticeDataLoader - prefetch エラーハンドリング", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerUser.mockResolvedValue({ id: "user-1" });
    mocks.createAuthenticatedServerClient.mockResolvedValue({});
    mocks.getStyles.mockResolvedValue([]);
    mocks.getUserTags.mockResolvedValue([]);
  });

  it("[V-LOG-01/02] Practices prefetch が失敗した場合、ラベル付き console.error がちょうど1回呼ばれ(retry:falseの実証)、失敗したクエリが成功として dehydrate されない", async () => {
    const error = new Error("db timeout");
    mocks.getPractices.mockRejectedValue(error);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: PracticeDataLoader, getDefaultDateRange } = await import(
      "../PracticeDataLoader"
    );
    const element = (await PracticeDataLoader()) as ReactElement<{
      state: { queries: Array<{ queryKey: unknown; state: { status: string } }> };
    }>;

    // V-LOG-01 + retry:false 実証: ラベル付きログが「ちょうど1回」呼ばれること。
    // toHaveBeenCalled のような緩いアサーションでは retry:3 の多重発火を検出できないため
    // 呼び出し回数を厳密化する。
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[PracticeDataLoader] Practices prefetch エラー:",
      error,
    );
    // API 呼び出し自体も retry:false によりちょうど1回のはず
    expect(mocks.getPractices).toHaveBeenCalledTimes(1);

    // V-LOG-02: 握り潰されていないこと(react-query 既定は success のみ dehydrate)。
    const dehydratedState = element.props.state;
    expect(dehydratedState.queries).toHaveLength(0);

    // getDefaultDateRange が named export として利用可能であること(QA テスト用に公開されている契約)
    expect(getDefaultDateRange()).toEqual(
      expect.objectContaining({ startDate: expect.any(String), endDate: expect.any(String) }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("[V-LOG-03] Practices prefetch が成功した場合、従来どおりデータが dehydrate され console.error は呼ばれない(退行なし)", async () => {
    const practices = [{ id: "practice-1" }];
    mocks.getPractices.mockResolvedValue(practices);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: PracticeDataLoader, getDefaultDateRange } = await import(
      "../PracticeDataLoader"
    );
    const { startDate, endDate } = getDefaultDateRange();
    const element = (await PracticeDataLoader()) as ReactElement<{
      state: {
        queries: Array<{
          queryKey: unknown;
          state: { status: string; data: unknown };
        }>;
      };
    }>;

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "[PracticeDataLoader] Practices prefetch エラー:",
      expect.anything(),
    );
    expect(mocks.getPractices).toHaveBeenCalledTimes(1);

    const dehydratedState = element.props.state;
    expect(dehydratedState.queries).toHaveLength(1);
    // 直前の toHaveLength(1) で1件以上の存在を確認済み
    expect(dehydratedState.queries[0]!.queryKey).toEqual(
      practiceKeys.list({ startDate, endDate, page: 1, pageSize: 1000 }),
    );
    expect(dehydratedState.queries[0]!.state.status).toBe("success");
    expect(dehydratedState.queries[0]!.state.data).toEqual(practices);

    consoleErrorSpy.mockRestore();
  });
});
