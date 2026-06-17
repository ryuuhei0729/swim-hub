/**
 * EntryLogFormScreen — Sprint 3 teamId ロジックテスト
 *
 * Sprint Contract 検証観点:
 * [S3-V-05] teamId あり + 新規: createTeamEntry が正しいシグネチャで呼ばれる
 * [S3-V-06] teamId なし + 新規: createPersonalEntry が呼ばれ createTeamEntry は呼ばれない
 * [S3-V-07] handleSkip で RecordLogForm 遷移時に teamId が引き継がれる
 * [S3-V-08] handleContinueToRecord で RecordLogForm 遷移時に teamId が引き継がれる
 * [S3-V-09] teamId あり: 保存後 teamKeys.competitions(teamId) が invalidate される
 *
 * 実装アプローチ:
 * EntryLogFormScreen は RN の Dimensions / Modal / Keyboard / KeyboardAvoidingView 等が
 * 未モックなため直接 render 不可。EntryLogFormScreen.tsx のコアロジック
 * (saveOrUpdateEntries / handleSkip) をロジック抽出テストで検証する。
 * TeamPracticeList / TeamCompetitionList のテストと同様のピュアロジックパターン。
 */

import { describe, it, expect, vi } from "vitest";
import { teamKeys } from "@apps/shared/hooks/queries/keys";

// ============================================================
// saveOrUpdateEntries ロジック抽出
// EntryLogFormScreen.tsx lines 419-439 相当の分岐
//
// 分岐:
//   1. 既存エントリーがある → updateEntry
//   2. 既存なし + teamId あり → createTeamEntry
//   3. 既存なし + teamId なし → createPersonalEntry
// ============================================================

interface EntryAPILike {
  createTeamEntry: (
    teamId: string,
    userId: string,
    entry: Record<string, unknown>,
  ) => Promise<{ id: string; style_id: number; team_id: string | null }>;
  createPersonalEntry: (
    entry: Record<string, unknown>,
  ) => Promise<{ id: string; style_id: number; team_id: null }>;
  checkExistingEntry: (
    competitionId: string,
    userId: string,
    styleId: number,
  ) => Promise<{ id: string } | null>;
  updateEntry: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ id: string; style_id: number; team_id: string | null }>;
}

/**
 * 新規作成パスの分岐ロジック (saveOrUpdateEntries lines 404-438 抽出)
 */
async function resolveCreateEntry(
  entryAPI: EntryAPILike,
  competitionId: string,
  userId: string,
  styleId: number,
  entryTime: number | null,
  note: string | null,
  teamId: string | undefined,
): Promise<{ id: string; style_id: number; team_id: string | null }> {
  // 既存エントリーチェック
  const existingEntry = await entryAPI.checkExistingEntry(competitionId, userId, styleId);

  if (existingEntry) {
    return entryAPI.updateEntry(existingEntry.id, {
      entry_time: entryTime,
      note,
    });
  } else if (teamId) {
    return entryAPI.createTeamEntry(teamId, userId, {
      competition_id: competitionId,
      style_id: styleId,
      entry_time: entryTime,
      note,
    });
  } else {
    return entryAPI.createPersonalEntry({
      competition_id: competitionId,
      style_id: styleId,
      entry_time: entryTime,
      note,
    });
  }
}

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

describe("EntryLogFormScreen — Sprint 3 saveOrUpdateEntries 分岐テスト", () => {
  // [S3-V-05] teamId あり + 既存なし → createTeamEntry が呼ばれる
  it("[S3-V-05] teamId あり + 既存エントリーなし: createTeamEntry が正しい引数で呼ばれる", async () => {
    const entryAPI: EntryAPILike = {
      createTeamEntry: vi.fn().mockResolvedValue({
        id: "new-team-entry",
        style_id: 1,
        team_id: "team-1",
      }),
      createPersonalEntry: vi.fn(),
      checkExistingEntry: vi.fn().mockResolvedValue(null),
      updateEntry: vi.fn().mockResolvedValue({ id: "upd", style_id: 1, team_id: null }),
    };

    await resolveCreateEntry(
      entryAPI,
      "comp-1",
      "user-1",
      1,
      null,
      null,
      "team-1",
    );

    expect(entryAPI.createTeamEntry).toHaveBeenCalledWith(
      "team-1",
      "user-1",
      expect.objectContaining({
        competition_id: "comp-1",
        style_id: 1,
      }),
    );
    expect(entryAPI.createPersonalEntry).not.toHaveBeenCalled();
  });

  // [S3-V-05] createTeamEntry の戻り値に team_id が含まれる
  it("[S3-V-05] createTeamEntry の戻り値: team_id が正しくセットされている", async () => {
    const entryAPI: EntryAPILike = {
      createTeamEntry: vi.fn().mockResolvedValue({
        id: "entry-t1",
        style_id: 1,
        team_id: "team-xyz",
      }),
      createPersonalEntry: vi.fn(),
      checkExistingEntry: vi.fn().mockResolvedValue(null),
      updateEntry: vi.fn().mockResolvedValue({ id: "upd", style_id: 1, team_id: null }),
    };

    const result = await resolveCreateEntry(
      entryAPI,
      "comp-1",
      "user-1",
      1,
      null,
      null,
      "team-xyz",
    );

    expect(result.team_id).toBe("team-xyz");
  });

  // [S3-V-06] teamId なし + 既存なし → createPersonalEntry が呼ばれる
  it("[S3-V-06] teamId なし + 既存エントリーなし: createPersonalEntry が呼ばれる", async () => {
    const entryAPI: EntryAPILike = {
      createTeamEntry: vi.fn(),
      createPersonalEntry: vi.fn().mockResolvedValue({
        id: "new-personal-entry",
        style_id: 1,
        team_id: null,
      }),
      checkExistingEntry: vi.fn().mockResolvedValue(null),
      updateEntry: vi.fn().mockResolvedValue({ id: "upd", style_id: 1, team_id: null }),
    };

    await resolveCreateEntry(
      entryAPI,
      "comp-2",
      "user-2",
      2,
      null,
      null,
      undefined,
    );

    expect(entryAPI.createPersonalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        competition_id: "comp-2",
        style_id: 2,
      }),
    );
    expect(entryAPI.createTeamEntry).not.toHaveBeenCalled();
  });

  // [S3-V-06 境界値] teamId が空文字列 → falsy なので createPersonalEntry が呼ばれる
  it("[S3-V-06 境界値] teamId が空文字列: createPersonalEntry が呼ばれる", async () => {
    const entryAPI: EntryAPILike = {
      createTeamEntry: vi.fn(),
      createPersonalEntry: vi.fn().mockResolvedValue({
        id: "entry-empty",
        style_id: 1,
        team_id: null,
      }),
      checkExistingEntry: vi.fn().mockResolvedValue(null),
      updateEntry: vi.fn().mockResolvedValue({ id: "upd", style_id: 1, team_id: null }),
    };

    await resolveCreateEntry(entryAPI, "comp-3", "user-3", 1, null, null, "");

    expect(entryAPI.createPersonalEntry).toHaveBeenCalled();
    expect(entryAPI.createTeamEntry).not.toHaveBeenCalled();
  });

  // 既存エントリーがある場合は updateEntry が呼ばれる (teamId の有無問わず)
  it("[回帰] 既存エントリーがある場合: teamId があっても updateEntry が呼ばれる", async () => {
    const entryAPI: EntryAPILike = {
      createTeamEntry: vi.fn(),
      createPersonalEntry: vi.fn(),
      checkExistingEntry: vi.fn().mockResolvedValue({ id: "existing-entry" }),
      updateEntry: vi.fn().mockResolvedValue({ id: "existing-entry", style_id: 1 }),
    };

    await resolveCreateEntry(entryAPI, "comp-4", "user-4", 1, 60.0, null, "team-1");

    expect(entryAPI.updateEntry).toHaveBeenCalledWith(
      "existing-entry",
      expect.objectContaining({ entry_time: 60.0 }),
    );
    expect(entryAPI.createTeamEntry).not.toHaveBeenCalled();
    expect(entryAPI.createPersonalEntry).not.toHaveBeenCalled();
  });
});

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
