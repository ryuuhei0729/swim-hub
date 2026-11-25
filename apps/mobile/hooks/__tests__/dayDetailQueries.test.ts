// =============================================================================
// dayDetailQueries.test.ts
// =============================================================================
//
// 保存・削除のあと、どの日別詳細を「取り直すまで見せない」対象にするかを確かめる。
// 書き換えた対象だけに絞らないと、保存のたびに全ての日のキャッシュが使えなくなる。

import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  dayDetailKeys,
  invalidateCalendarAfterSave,
  invalidateDayDetailsAfterDelete,
} from "../dayDetailQueries";

const CALENDAR_KEY = ["calendar", "2026-11-01", "2026-11-30"];
const PRACTICE_A = dayDetailKeys.practice("practice-a");
const PRACTICE_A_LOG = dayDetailKeys.practiceLog("practice-a", "log-1");
const PRACTICE_B = dayDetailKeys.practice("practice-b");
const COMPETITION_A_ENTRIES = dayDetailKeys.entries("competition-a", "user-1");
const COMPETITION_A_RECORDS = dayDetailKeys.records("competition-a", {
  userId: "user-1",
  ownOnly: false,
  recordId: null,
});
const COMPETITION_B_RECORDS = dayDetailKeys.records("competition-b", {
  userId: "user-1",
  ownOnly: false,
  recordId: null,
});
const ALL_KEYS = [
  CALENDAR_KEY,
  PRACTICE_A,
  PRACTICE_A_LOG,
  PRACTICE_B,
  COMPETITION_A_ENTRIES,
  COMPETITION_A_RECORDS,
  COMPETITION_B_RECORDS,
];

function createSeededClient(): QueryClient {
  const queryClient = new QueryClient();
  for (const key of ALL_KEYS) queryClient.setQueryData(key, "cached");
  return queryClient;
}

function invalidatedKeys(queryClient: QueryClient): unknown[] {
  return ALL_KEYS.filter((key) => queryClient.getQueryState(key)?.isInvalidated);
}

describe("invalidateCalendarAfterSave", () => {
  it("練習を保存したら、一覧とその練習の詳細 (本体・メニュー) だけを無効化する", async () => {
    const queryClient = createSeededClient();

    await invalidateCalendarAfterSave(queryClient, { practiceId: "practice-a" });

    expect(invalidatedKeys(queryClient)).toEqual([CALENDAR_KEY, PRACTICE_A, PRACTICE_A_LOG]);
  });

  it("大会を保存したら、一覧とその大会の詳細 (エントリー・記録) だけを無効化する", async () => {
    const queryClient = createSeededClient();

    await invalidateCalendarAfterSave(queryClient, { competitionId: "competition-a" });

    expect(invalidatedKeys(queryClient)).toEqual([
      CALENDAR_KEY,
      COMPETITION_A_ENTRIES,
      COMPETITION_A_RECORDS,
    ]);
  });

  it("対象を絞れないとき (一括登録など) は、すべての詳細を無効化する", async () => {
    const queryClient = createSeededClient();

    await invalidateCalendarAfterSave(queryClient);

    expect(invalidatedKeys(queryClient)).toEqual(ALL_KEYS);
  });

  it("対象の id が空 (新規作成に失敗した等) のときも、絞らずにすべて無効化する", async () => {
    const queryClient = createSeededClient();

    await invalidateCalendarAfterSave(queryClient, { practiceId: null, competitionId: undefined });

    expect(invalidatedKeys(queryClient)).toEqual(ALL_KEYS);
  });
});

describe("invalidateDayDetailsAfterDelete", () => {
  it("すべての詳細を無効化するが、表示中のエントリー・記録をここでは取り直さない", async () => {
    const queryClient = createSeededClient();
    const recordsFetch = vi.fn().mockResolvedValue("fresh");
    const practiceFetch = vi.fn().mockResolvedValue("fresh");
    // 表示中 (observer あり) の状態を作る
    const recordsObserver = new QueryObserver(queryClient, {
      queryKey: COMPETITION_A_RECORDS,
      queryFn: recordsFetch,
      staleTime: Infinity,
    });
    const practiceObserver = new QueryObserver(queryClient, {
      queryKey: PRACTICE_A,
      queryFn: practiceFetch,
      staleTime: Infinity,
    });
    const stopRecords = recordsObserver.subscribe(() => {});
    const stopPractice = practiceObserver.subscribe(() => {});

    invalidateDayDetailsAfterDelete(queryClient);
    await vi.waitFor(() => expect(practiceFetch).toHaveBeenCalledTimes(1));

    // エントリー・記録は一覧の更新をきっかけに取り直すので、ここでは走らせない
    expect(recordsFetch).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(COMPETITION_A_RECORDS)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(COMPETITION_B_RECORDS)?.isInvalidated).toBe(true);
    // 一覧 (カレンダー) は呼び出し元が取り直すので触らない
    expect(queryClient.getQueryState(CALENDAR_KEY)?.isInvalidated).toBe(false);

    stopRecords();
    stopPractice();
  });
});
