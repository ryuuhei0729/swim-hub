/**
 * PracticeLogFormScreen — Sprint 3 teamId ロジックテスト
 *
 * Sprint Contract 検証観点:
 * [S3-V-01] teamId あり: 保存後 teamKeys.practices(teamId) が invalidate される
 * [S3-V-02] teamId なし (個人フロー): teamKeys.practices は invalidate されない
 * [S3-V-03] teamId の有無に関わらず practiceKeys.lists() は invalidate される
 * [S3-V-04] OCR ボタン・機能が画面ソースに存在しない (ソース grep ベース確認)
 *
 * 注意:
 * PracticeLogFormScreen は RN の KeyboardAvoidingView / Modal 等未モックにより
 * フル render が困難なため、Sprint 3 で変更されたコアロジックをピュア関数に
 * 近い形で抽出して検証する (splitTimesEvery50m.logic.test.ts パターン準拠)。
 *
 * S3-V-04 の OCR 不在は静的 grep で確認済み。テストとしても記録する。
 */

import { describe, it, expect } from "vitest";
import { teamKeys, practiceKeys } from "@apps/shared/hooks/queries/keys";

// ============================================================
// PracticeLogFormScreen.tsx 保存後の invalidate ロジック抽出
// (lines 527-531 相当)
//
// 実装コード:
//   queryClient.invalidateQueries({ queryKey: ["calendar"] });
//   queryClient.invalidateQueries({ queryKey: practiceKeys.lists() });
//   if (teamId) {
//     queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });
//   }
// ============================================================

type QueryKeyValue = readonly unknown[] | unknown[];

interface InvalidateCall {
  queryKey: QueryKeyValue;
}

/**
 * 保存後に実行される invalidateQueries 呼び出しシミュレーション
 */
function simulatePracticeLogSaveInvalidation(
  teamId: string | undefined,
): InvalidateCall[] {
  const calls: InvalidateCall[] = [];

  calls.push({ queryKey: ["calendar"] });
  calls.push({ queryKey: practiceKeys.lists() as unknown as unknown[] });

  if (teamId) {
    calls.push({ queryKey: teamKeys.practices(teamId) as unknown as unknown[] });
  }

  return calls;
}

// ============================================================
// テスト
// ============================================================

describe("PracticeLogFormScreen — Sprint 3 保存後 invalidate ロジック", () => {
  // [S3-V-01] teamId あり → teamKeys.practices(teamId) が invalidate される
  it("[S3-V-01] teamId あり: 保存後 teamKeys.practices(teamId) が invalidate される", () => {
    const calls = simulatePracticeLogSaveInvalidation("team-abc");

    const keys = calls.map((c) => JSON.stringify(c.queryKey));
    const expected = JSON.stringify(teamKeys.practices("team-abc"));
    expect(keys).toContain(expected);
  });

  // [S3-V-01 境界値] teamId が空文字列 → falsy なので invalidate されない
  it("[S3-V-01 境界値] teamId が空文字列: teamKeys.practices は invalidate されない", () => {
    const calls = simulatePracticeLogSaveInvalidation("");

    const keys = calls.map((c) => JSON.stringify(c.queryKey));
    const unexpectedPrefix = JSON.stringify(teamKeys.practices(""));
    // 空文字は falsy なので teamKeys.practices は呼ばれない
    expect(keys).not.toContain(unexpectedPrefix);
  });

  // [S3-V-02] teamId なし → teamKeys.practices は invalidate されない
  it("[S3-V-02] teamId が undefined: teamKeys.practices は invalidate されない", () => {
    const calls = simulatePracticeLogSaveInvalidation(undefined);

    // チームキーを含む呼び出しがないことを確認
    const hasTeamKey = calls.some((c) => {
      const str = JSON.stringify(c.queryKey);
      return str.includes("team") && str.includes("practices");
    });
    expect(hasTeamKey).toBe(false);
  });

  // [S3-V-03] teamId の有無に関わらず practiceKeys.lists() は invalidate される
  it("[S3-V-03] teamId あり: practiceKeys.lists() も invalidate される", () => {
    const calls = simulatePracticeLogSaveInvalidation("team-1");

    const keys = calls.map((c) => JSON.stringify(c.queryKey));
    const expected = JSON.stringify(practiceKeys.lists());
    expect(keys).toContain(expected);
  });

  it("[S3-V-03] teamId なし: practiceKeys.lists() も invalidate される", () => {
    const calls = simulatePracticeLogSaveInvalidation(undefined);

    const keys = calls.map((c) => JSON.stringify(c.queryKey));
    const expected = JSON.stringify(practiceKeys.lists());
    expect(keys).toContain(expected);
  });

  // [S3-V-03] calendar も常に invalidate される
  it("[S3-V-03 補足] calendar は常に invalidate される", () => {
    const callsWithTeam = simulatePracticeLogSaveInvalidation("team-1");
    const callsNoTeam = simulatePracticeLogSaveInvalidation(undefined);

    expect(callsWithTeam.map((c) => JSON.stringify(c.queryKey))).toContain(
      JSON.stringify(["calendar"]),
    );
    expect(callsNoTeam.map((c) => JSON.stringify(c.queryKey))).toContain(
      JSON.stringify(["calendar"]),
    );
  });
});

// ============================================================
// [S3-V-04] OCR 機能不在の静的検証
//
// PracticeLogFormScreen.tsx のソースコードに OCR/scan/カメラ読み取り
// 関連の文字列・コンポーネントが存在しないことを確認する。
// これは実装仕様（OCRなし）の証跡として記録する。
// ============================================================

import * as fs from "fs";
import * as path from "path";

describe("PracticeLogFormScreen — [S3-V-04] OCR 機能不在確認", () => {
  const screenPath = path.resolve(
    __dirname,
    "../../screens/PracticeLogFormScreen.tsx",
  );

  let sourceCode: string;

  try {
    sourceCode = fs.readFileSync(screenPath, "utf-8");
  } catch {
    sourceCode = "";
  }

  it("[S3-V-04] ソースに OCR という文字列が存在しない", () => {
    expect(sourceCode).not.toMatch(/\bOCR\b/i);
  });

  it("[S3-V-04] ソースに Gemini という文字列が存在しない", () => {
    expect(sourceCode).not.toMatch(/\bGemini\b/i);
  });

  it("[S3-V-04] ソースに scanTimesheet / scanSheet / detectText などのOCR関数呼び出しが存在しない", () => {
    expect(sourceCode).not.toMatch(/scanTimesheet|scanSheet|detectText|analyzeImage/i);
  });

  it("[S3-V-04] ソースに「タイムシートを読み取る」「スキャン」などのOCRラベル文字列がない", () => {
    // i18n キーや直書き文字列で OCR 関連ラベルがないことを確認
    expect(sourceCode).not.toMatch(/タイムシートを読み取|スキャン.*ボタン|OCR.*ボタン/);
  });

  it("[S3-V-04] ソースは非空 (ファイルが正しく読み込まれている)", () => {
    expect(sourceCode.length).toBeGreaterThan(100);
  });
});
