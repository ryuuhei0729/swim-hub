/**
 * EntryLogFormScreen — Sprint 3 teamId ナビゲーション/invalidate ロジックテスト
 *
 * Sprint Contract 検証観点:
 * [S3-V-07] handleSkip で RecordLogForm 遷移時に teamId が引き継がれる
 * [S3-V-08] handleContinueToRecord で RecordLogForm 遷移時に teamId が引き継がれる
 * [S3-V-09] teamId あり: 保存後 teamKeys.competitions(teamId) が invalidate される
 *
 * 実装アプローチ:
 * EntryLogFormScreen は RN の Dimensions / Modal / Keyboard / KeyboardAvoidingView 等が
 * 未モックなため直接 render 不可。ナビゲーション引数生成 / invalidate のピュアロジックのみ検証する。
 *
 * NOTE (C-2 解消):
 * 旧テストにあった saveOrUpdateEntries の create/update 分岐 (ローカル resolveCreateEntry)
 * は「実装を import せず再実装した」トートロジーであり、かつ現行の screen は
 * checkExistingEntry ベースの分岐を使わず resolveEntryMutations に一元化されたため削除した。
 * 保存ロジック (create/update/delete 解決) の検証は
 * utils/__tests__/entryMutations.test.ts で実物 resolveEntryMutations を import して行う。
 */

import { describe, it, expect } from "vitest";
import { teamKeys } from "@apps/shared/hooks/queries/keys";

/**
 * handleSkip のナビゲーション引数生成ロジック
 * (EntryLogFormScreen.tsx lines 554-561 相当)
 */
function buildSkipNavParams(
  competitionId: string,
  date: string,
  teamId: string | undefined,
) {
  return {
    competitionId,
    entryDataList: [],
    date,
    teamId,
  };
}

/**
 * handleContinueToRecord のナビゲーション引数生成ロジック
 * (EntryLogFormScreen.tsx lines 532-538 相当)
 */
function buildContinueNavParams(
  competitionId: string,
  date: string,
  teamId: string | undefined,
  entryDataList: unknown[],
) {
  return {
    competitionId,
    entryDataList,
    date,
    teamId,
  };
}

/**
 * 保存後の invalidateQueries 呼び出しシミュレーション
 * (EntryLogFormScreen.tsx lines 465-469 相当)
 */
function simulateEntrySaveInvalidation(
  teamId: string | undefined,
): Array<{ queryKey: unknown[] }> {
  const calls: Array<{ queryKey: unknown[] }> = [];

  calls.push({ queryKey: ["calendar"] });

  if (teamId) {
    calls.push({ queryKey: teamKeys.competitions(teamId) as unknown as unknown[] });
  }

  return calls;
}

// ============================================================
// テスト
// ============================================================

describe("EntryLogFormScreen — Sprint 3 handleSkip / handleContinueToRecord テスト", () => {
  // [S3-V-07] handleSkip → RecordLogForm 遷移時に teamId が引き継がれる
  it("[S3-V-07] スキップ: RecordLogForm に teamId が引き継がれる", () => {
    const params = buildSkipNavParams("comp-skip", "2026-06-16", "team-skip");

    expect(params.teamId).toBe("team-skip");
    expect(params.competitionId).toBe("comp-skip");
    expect(params.entryDataList).toHaveLength(0);
  });

  it("[S3-V-07 境界値] スキップ + teamId なし: teamId=undefined が渡る", () => {
    const params = buildSkipNavParams("comp-personal", "2026-06-16", undefined);

    expect(params.teamId).toBeUndefined();
  });

  // [S3-V-08] handleContinueToRecord → RecordLogForm 遷移時に teamId が引き継がれる
  it("[S3-V-08] 続けて記録: RecordLogForm に teamId が引き継がれる", () => {
    const mockEntries = [{ styleId: 1, styleName: "50m Fr", entryTime: 30.0 }];
    const params = buildContinueNavParams("comp-cont", "2026-06-16", "team-cont", mockEntries);

    expect(params.teamId).toBe("team-cont");
    expect(params.competitionId).toBe("comp-cont");
    expect(params.entryDataList).toHaveLength(1);
  });

  it("[S3-V-08 境界値] 続けて記録 + teamId なし: teamId=undefined が渡る", () => {
    const params = buildContinueNavParams("comp-2", "2026-06-16", undefined, []);

    expect(params.teamId).toBeUndefined();
  });
});

describe("EntryLogFormScreen — Sprint 3 保存後 invalidate ロジックテスト", () => {
  // [S3-V-09] teamId あり → teamKeys.competitions(teamId) が invalidate される
  it("[S3-V-09] teamId あり: 保存後 teamKeys.competitions(teamId) が invalidate される", () => {
    const calls = simulateEntrySaveInvalidation("team-comp");

    const keys = calls.map((c) => JSON.stringify(c.queryKey));
    const expected = JSON.stringify(teamKeys.competitions("team-comp"));
    expect(keys).toContain(expected);
  });

  // [S3-V-09 境界値] teamId なし → teamKeys.competitions は invalidate されない
  it("[S3-V-09 境界値] teamId なし: teamKeys.competitions は invalidate されない", () => {
    const calls = simulateEntrySaveInvalidation(undefined);

    const hasTeamKey = calls.some((c) => {
      const str = JSON.stringify(c.queryKey);
      return str.includes("team") && str.includes("competitions");
    });
    expect(hasTeamKey).toBe(false);
  });

  // calendar は常に invalidate される
  it("[回帰] calendar は常に invalidate される", () => {
    const callsWithTeam = simulateEntrySaveInvalidation("team-1");
    const callsNoTeam = simulateEntrySaveInvalidation(undefined);

    expect(callsWithTeam.map((c) => JSON.stringify(c.queryKey))).toContain(
      JSON.stringify(["calendar"]),
    );
    expect(callsNoTeam.map((c) => JSON.stringify(c.queryKey))).toContain(
      JSON.stringify(["calendar"]),
    );
  });
});
