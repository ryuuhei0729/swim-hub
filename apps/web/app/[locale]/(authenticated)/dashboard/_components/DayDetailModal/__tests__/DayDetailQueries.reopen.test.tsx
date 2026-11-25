/**
 * 日付詳細モーダルの取得 (React Query 化) — 開き直したときの表示
 *
 * 検証観点:
 *  - 同じ練習を開き直すと、前回の内容を「読み込み中」を挟まずにすぐ表示し、裏で取り直す
 *    (以前と同じく開くたびに取り直す = staleTime 0)
 *  - 裏での取り直しが失敗しても、表示中の内容をエラー表示で隠さない
 *  - 保存・削除の後 (CalendarProvider が dayDetailKeys.all を reset する) は書き込み前の内容を
 *    出さず、取り直しが終わるまで読み込み中にする
 *  - データが無いときの失敗はすぐ (リトライで待たせず) エラー表示にし、次に開いたら取り直す
 */

import { act, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import messages from "@apps/shared/messages/ja.json";
import { PracticeDetails } from "../components/PracticeSection/PracticeDetails";
import { dayDetailKeys } from "@/hooks/queries/dayDetailQueries";
import {
  createTestQueryClient,
  renderWithQueryClient,
} from "@/__tests__/helpers/dashboardQueryTestUtils";

type PracticeResult = { data: unknown; error: unknown };

const practiceFetch = vi.hoisted(() => vi.fn<() => Promise<PracticeResult>>());

function makeChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => chain,
    then: (resolve: (v: PracticeResult) => unknown, reject?: (e: unknown) => unknown) =>
      practiceFetch().then(resolve, reject),
  };
  return chain;
}

const fakeSupabase = { from: () => makeChain() };

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

const practiceRow = (title: string): PracticeResult => ({
  data: {
    id: "practice-1",
    date: "2026-08-01",
    title,
    place: "テストプール",
    practice_logs: [],
    image_paths: [],
  },
  error: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const LOADING_TEXT = messages.practice.details.loading;
const ERROR_TEXT = messages.practice.details.error;

const openPractice = (queryClient: QueryClient) =>
  renderWithQueryClient(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <PracticeDetails practiceId="practice-1" />
    </NextIntlClientProvider>,
    { queryClient },
  );

describe("日付詳細の取得 — 開き直したときの表示", () => {
  beforeEach(() => {
    practiceFetch.mockReset();
  });

  it("同じ練習を開き直すと前回の内容をすぐ表示し、裏で取り直した内容に置き換える", async () => {
    const queryClient = createTestQueryClient();
    practiceFetch.mockResolvedValueOnce(practiceRow("最初の内容"));

    const first = openPractice(queryClient);
    expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("最初の内容")).toBeInTheDocument());
    first.unmount();

    // 2回目は取り直しを保留にしておく
    const refetch = deferred<PracticeResult>();
    practiceFetch.mockReturnValueOnce(refetch.promise);

    openPractice(queryClient);
    // 読み込み中を挟まず、前回の内容がすぐ出る
    expect(screen.getByText("最初の内容")).toBeInTheDocument();
    expect(screen.queryByText(LOADING_TEXT)).toBeNull();
    // 開くたびに取り直している
    await waitFor(() => expect(practiceFetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      refetch.resolve(practiceRow("取り直した内容"));
    });
    await waitFor(() => expect(screen.getByText("取り直した内容")).toBeInTheDocument());
  });

  it("裏での取り直しが失敗しても、表示中の内容をエラー表示で隠さない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = createTestQueryClient();
    practiceFetch.mockResolvedValueOnce(practiceRow("最初の内容"));

    const first = openPractice(queryClient);
    await waitFor(() => expect(screen.getByText("最初の内容")).toBeInTheDocument());
    first.unmount();

    practiceFetch.mockResolvedValueOnce({ data: null, error: new Error("network down") });
    openPractice(queryClient);
    await waitFor(() =>
      expect(queryClient.getQueryState(dayDetailKeys.practice("practice-1", false, "user-1"))?.status).toBe(
        "error",
      ),
    );
    expect(screen.getByText("最初の内容")).toBeInTheDocument();
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    consoleErrorSpy.mockRestore();
  });

  it("保存・削除で日付詳細のキャッシュが reset されたら、書き込み前の内容を出さず取り直しを待つ", async () => {
    const queryClient = createTestQueryClient();
    practiceFetch.mockResolvedValueOnce(practiceRow("保存前の内容"));

    openPractice(queryClient);
    await waitFor(() => expect(screen.getByText("保存前の内容")).toBeInTheDocument());

    const refetch = deferred<PracticeResult>();
    practiceFetch.mockReturnValueOnce(refetch.promise);
    await act(async () => {
      void queryClient.resetQueries({ queryKey: dayDetailKeys.all });
    });

    await waitFor(() => expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument());
    expect(screen.queryByText("保存前の内容")).toBeNull();

    await act(async () => {
      refetch.resolve(practiceRow("保存後の内容"));
    });
    await waitFor(() => expect(screen.getByText("保存後の内容")).toBeInTheDocument());
  });

  it("データが無いときの失敗はリトライせずすぐエラー表示にし、成功としてキャッシュしない", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // 既定のリトライ (3回) を残した QueryClient でも、詳細のクエリ自体が retry:false
    const { QueryClient } = await import("@tanstack/react-query");
    const queryClient = new QueryClient();
    practiceFetch.mockResolvedValue({ data: null, error: new Error("network down") });

    const first = openPractice(queryClient);
    await waitFor(() => expect(screen.getByText(ERROR_TEXT)).toBeInTheDocument());
    expect(practiceFetch).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("練習詳細の取得エラー:", expect.any(Error));
    first.unmount();

    // 次に開いたときは取り直して表示する
    practiceFetch.mockResolvedValueOnce(practiceRow("復旧した内容"));
    openPractice(queryClient);
    await waitFor(() => expect(screen.getByText("復旧した内容")).toBeInTheDocument());
    consoleErrorSpy.mockRestore();
  });
});
