import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import {
  STORE_REVIEW_DELAY_MS,
  hasPendingAchievementPrompt,
  requestStoreReviewOnce,
} from "../storeReview";

const getItem = vi.mocked(AsyncStorage.getItem);
const setItem = vi.mocked(AsyncStorage.setItem);
const isAvailableAsync = vi.mocked(StoreReview.isAvailableAsync);
const requestReview = vi.mocked(StoreReview.requestReview);

async function run(promise: Promise<void>) {
  await vi.advanceTimersByTimeAsync(STORE_REVIEW_DELAY_MS);
  await promise;
}

describe("requestStoreReviewOnce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    isAvailableAsync.mockResolvedValue(true);
    requestReview.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未依頼なら、待ってから依頼し、依頼済みの印を残す", async () => {
    const promise = requestStoreReviewOnce();
    await vi.advanceTimersByTimeAsync(STORE_REVIEW_DELAY_MS - 1);
    expect(requestReview).not.toHaveBeenCalled();

    await run(promise);

    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]![0]).toBe("store-review-requested");
  });

  it("依頼済みの端末では依頼しない", async () => {
    getItem.mockResolvedValue("2026-11-25T00:00:00.000Z");

    await run(requestStoreReviewOnce());

    expect(requestReview).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("使えない環境 (TestFlight など) では依頼せず、印も残さない (次の機会に依頼する)", async () => {
    isAvailableAsync.mockResolvedValue(false);

    await run(requestStoreReviewOnce());

    expect(requestReview).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("続けて呼ばれても依頼は1回だけ", async () => {
    const first = requestStoreReviewOnce();
    const second = requestStoreReviewOnce();

    await run(Promise.all([first, second]).then(() => undefined));

    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("依頼や保存に失敗しても例外を投げない", async () => {
    requestReview.mockRejectedValue(new Error("native"));
    await expect(run(requestStoreReviewOnce())).resolves.toBeUndefined();

    getItem.mockRejectedValue(new Error("io"));
    await expect(run(requestStoreReviewOnce())).resolves.toBeUndefined();
  });

  it("shouldSkip が true なら依頼せず、印も残さない (次の登録で依頼する)", async () => {
    await run(requestStoreReviewOnce(async () => true));
    expect(requestReview).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();

    await run(requestStoreReviewOnce(async () => false));
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("ネイティブモジュールが無いバイナリでも例外を投げず、ストアの URL も開かない", async () => {
    vi.resetModules();
    vi.doMock("expo-store-review", () => {
      throw new Error("Cannot find native module 'ExpoStoreReview'");
    });
    try {
      const fresh = await import("../storeReview");
      await expect(run(fresh.requestStoreReviewOnce())).resolves.toBeUndefined();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("expo-store-review");
      vi.resetModules();
    }
  });
});

describe("hasPendingAchievementPrompt", () => {
  const supabase = {} as SupabaseClient;

  it("達成候補があれば true、無ければ false", async () => {
    const getPending = vi.spyOn(GoalAPI.prototype, "getPendingAchievementMilestones");
    getPending.mockResolvedValueOnce([{ id: "m-1" }] as never);
    await expect(hasPendingAchievementPrompt(new QueryClient(), supabase)).resolves.toBe(true);

    getPending.mockResolvedValueOnce([]);
    await expect(hasPendingAchievementPrompt(new QueryClient(), supabase)).resolves.toBe(false);
  });

  it("保存直後の取り直しが進行中なら、その結果を使う (新しく取得しない)", async () => {
    const getPending = vi.spyOn(GoalAPI.prototype, "getPendingAchievementMilestones");
    const queryClient = new QueryClient();
    let resolveInFlight: (value: unknown[]) => void = () => {};
    const inFlight = queryClient.fetchQuery({
      queryKey: goalKeys.pendingAchievements(),
      queryFn: () => new Promise<unknown[]>((resolve) => (resolveInFlight = resolve)),
    });

    const result = hasPendingAchievementPrompt(queryClient, supabase);
    resolveInFlight([{ id: "m-1" }]);

    await expect(result).resolves.toBe(true);
    await inFlight;
    expect(getPending).not.toHaveBeenCalled();
  });
});
