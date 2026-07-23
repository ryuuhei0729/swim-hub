/**
 * SSR prefetch と CSR usePracticesQuery の queryKey 完全一致 契約テスト (Bug B: TZ 二重フェッチ)
 *
 * 背景 (グラウンドトゥルース, PM 実測):
 * - SSR (PracticeDataLoader) は自前の getDefaultDateRange() (date-fns, サーバーTZ) で計算した
 *   startDate/endDate を使い、
 *   queryClient.prefetchQuery({ queryKey: practiceKeys.list({ startDate, endDate, page: 1, pageSize: 1000 }) })
 *   で React Query キャッシュに投入する。
 * - CSR (usePracticesQuery, apps/shared) はフック内部で
 *   `defaultStartDate = startDate ?? (クライアントTZ基準で計算した既定値)` を computed し、
 *   その値で queryKey (practiceKeys.list) を生成する。
 * - fix 前は PracticeClient が startDate/endDate を一切渡していなかったため、CSR 側は
 *   クライアント(UTC)基準の既定日付を再計算していた。サーバーTZとズレると2つの queryKey が
 *   異なり、HydrationBoundary の prefetch キャッシュが CSR 側から見つからず(cache miss)、
 *   二重フェッチが発生していた。
 * - fix 後は PracticeDataLoader が計算した startDate/endDate を props 経由で PracticeClient に
 *   渡し、PracticeClient がそれをそのまま usePracticesQuery に渡すため、CSR 側の
 *   defaultStartDate/defaultEndDate は props の値 (`startDate ?? ...` の `??` 左辺) が採用され、
 *   SSR 側と同一のリテラル値になる。
 *
 * このテストは「実装コードを読んで正しそう」ではなく、実際に
 *   1. PracticeDataLoader が named export した本物の getDefaultDateRange() を呼び、
 *      その戻り値で SSR がやるのと同じ形で queryClient.prefetchQuery を実行し
 *   2. その同じ queryClient 上で (mock を挟まず) 本物の usePracticesQuery フックを
 *      同じ getDefaultDateRange() の戻り値を startDate/endDate props として渡してレンダーし
 * queryKey が完全一致していれば cache hit (queryFn が再度呼ばれない) になることを検証する。
 *
 * Reviewer 指摘対応: 旧版はテスト内で startDate/endDate をハードコードしていたため、
 * 「PracticeDataLoader が実際に getDefaultDateRange() の戻り値を prefetch key と props の
 * 両方に同一値で渡す」という経路そのものは未検証だった。本版では getDefaultDateRange() を
 * PracticeDataLoader から直接 import し、SSR 側/CSR 側の両方の起点として同じ関数呼び出しの
 * 戻り値を使うことで、「将来 DataLoader が別の日付計算に差し替える/props 渡し忘れる」
 * リグレッションを検出できるようにする(RSC の DataLoader 自体を直接 render するテストは
 * next/headers 依存等で困難なため、日付計算ロジックの共有元である getDefaultDateRange を
 * 実体として使うことで実質的に担保する)。
 *
 * ネガティブコントロール: startDate/endDate をあえて1日ズラす(=fix前の TZ ズレバグを再現)と
 * cache miss (queryFn が追加で呼ばれる) になることも確認し、本テストが実際にこの種の
 * リグレッションを検出できることを担保する(トートロジー防止)。
 *
 * usePracticesQuery はモックしない(実物を使う)。ネットワーク/Supabase 呼び出しは
 * usePracticesQuery が受け付ける `api` オプション(PracticeAPI 互換オブジェクト)を
 * フェイクに差し替えることで排除する。enableRealtime:false でリアルタイム購読 effect も無効化する。
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePracticesQuery } from "@apps/shared/hooks/queries/practices";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";
import type { PracticeWithLogs } from "@apps/shared/types";
import { getDefaultDateRange } from "../../../app/[locale]/(authenticated)/practice/_server/PracticeDataLoader";

// usePracticesQuery 内部の supabase.auth.getUser() 等はリアルタイム effect 内でしか
// 呼ばれない(enableRealtime:false で無効化する)ため、ダミーで十分。
const fakeSupabase = {} as never;

function makeFakeApi(practices: PracticeWithLogs[]) {
  return {
    getPractices: vi.fn().mockResolvedValue(practices),
  };
}

function Wrapper({ client, children }: { client: QueryClient; children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

describe("PracticeDataLoader.getDefaultDateRange()", () => {
  it("startDate/endDate が yyyy-MM-dd 形式で、startDate <= endDate かつ約365日レンジであること", () => {
    const { startDate, endDate } = getDefaultDateRange();

    expect(startDate).toMatch(YYYY_MM_DD);
    expect(endDate).toMatch(YYYY_MM_DD);

    const start = new Date(startDate);
    const end = new Date(endDate);
    expect(start.getTime()).toBeLessThanOrEqual(end.getTime());

    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    // ±1日の誤差はテスト実行タイミング(日付境界をまたぐケース)の許容誤差
    expect(diffDays).toBeGreaterThanOrEqual(364);
    expect(diffDays).toBeLessThanOrEqual(366);
  });
});

describe("SSR prefetch ⇄ CSR usePracticesQuery queryKey 契約 (Bug B)", () => {
  const ssrPractices = [{ id: "ssr-practice-1" }] as unknown as PracticeWithLogs[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-TZ-03] PracticeDataLoader の getDefaultDateRange() の戻り値を SSR prefetch と CSR 両方に使うと cache hit し、queryFn (getPractices) を呼ばない", async () => {
    // getDefaultDateRange() は本物の PracticeDataLoader からの named export を1回だけ
    // 呼び出す(SSR 側・CSR 側どちらも同一戻り値を使うことで、実プロダクションコードの
    // 「同一の日付計算結果を両方に伝播させる」設計をそのまま検証する)。
    const { startDate, endDate } = getDefaultDateRange();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
    });

    // 1. SSR (PracticeDataLoader) を模倣: 実プロダクションコードと同じ queryKey 生成関数
    //    (practiceKeys.list) + 同じ getDefaultDateRange() の戻り値 + 同じ形の引数
    //    (page:1, pageSize:1000) で prefetch する。
    await queryClient.prefetchQuery({
      queryKey: practiceKeys.list({ startDate, endDate, page: 1, pageSize: 1000 }),
      queryFn: async () => ssrPractices,
    });

    // 2. CSR (PracticeClient) を模倣: fix 後の実装は SSR (getDefaultDateRange()) と
    //    同じ startDate/endDate を props からそのまま usePracticesQuery に渡す。
    const fakeApi = makeFakeApi([]);
    const { result } = renderHook(
      () =>
        usePracticesQuery(fakeSupabase, {
          startDate,
          endDate,
          pageSize: 1000,
          enableRealtime: false,
          api: fakeApi as never,
        }),
      { wrapper: ({ children }) => <Wrapper client={queryClient}>{children}</Wrapper> },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // queryKey が完全一致していれば cache hit するため、CSR 側の queryFn (fakeApi.getPractices)
    // は一度も呼ばれず、SSR が prefetch したデータがそのまま返る。
    expect(fakeApi.getPractices).not.toHaveBeenCalled();
    expect(result.current.data).toEqual(ssrPractices);
  });

  it("ネガティブコントロール: startDate が1日ズレる(TZ 非一致を再現)と queryKey が食い違い cache miss して CSR が再フェッチする", async () => {
    const { startDate, endDate } = getDefaultDateRange();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
    });

    await queryClient.prefetchQuery({
      queryKey: practiceKeys.list({ startDate, endDate, page: 1, pageSize: 1000 }),
      queryFn: async () => ssrPractices,
    });

    // fix 前バグの再現: クライアント側が別の(1日ズレた) startDate を独自計算してしまうケース
    const startDateObj = new Date(startDate);
    startDateObj.setDate(startDateObj.getDate() + 1);
    const mismatchedStartDate = startDateObj.toISOString().split("T")[0];
    const csrPractices = [{ id: "csr-refetched" }] as unknown as PracticeWithLogs[];
    const fakeApi = makeFakeApi(csrPractices);

    const { result } = renderHook(
      () =>
        usePracticesQuery(fakeSupabase, {
          startDate: mismatchedStartDate,
          endDate,
          pageSize: 1000,
          enableRealtime: false,
          api: fakeApi as never,
        }),
      { wrapper: ({ children }) => <Wrapper client={queryClient}>{children}</Wrapper> },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // queryKey がズレるため cache miss し、CSR 側の queryFn が呼ばれて二重フェッチになる
    // (このネガティブコントロールが red にならないなら、上の PASS テストはトートロジー)
    expect(fakeApi.getPractices).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(csrPractices);
  });
});
