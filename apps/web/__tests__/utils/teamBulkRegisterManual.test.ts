/**
 * チーム一括登録「手動入力モード」バリデーション/変換ロジックテスト (Sprint Contract D6)
 *
 * D6: components/team/TeamBulkRegister.tsx にファイル/手動入力モード切替を追加し、
 * 手動入力(practice/competition 行入力)を新規実装する。手本 = mobile
 * components/teams/TeamBulkRegisterForm.tsx。共有API
 * apps/shared/api/teams/bulkRegister.ts の TeamBulkRegisterAPI.bulkRegister を再利用する。
 *
 * 【QA から Developer への実装インターフェース提案】
 * mobile 版 (TeamBulkRegisterForm.tsx) はバリデーション/変換ロジックをコンポーネント内部の
 * クロージャとして実装しており、外部からユニットテストできない。web 版では同じロジックを
 * 純粋関数として `apps/web/utils/teamBulkRegisterManual.ts` に切り出すことを D6 実装要件として
 * 提案する (UI 本体である TeamBulkRegister.tsx からはこのモジュールの関数を呼ぶ形にする)。
 * これにより、コンポーネントを一切レンダリングせずに境界値/異常系を高速に検証できる
 * (validators.test.ts / recordLogFormatters.test.ts 等、本リポジトリの既存規約に倣う)。
 *
 * 提案するインターフェース (mobile 版の実装と1:1対応させた):
 *   interface PracticeRow { date: string; title: string; place: string; note: string }
 *   interface CompetitionRow {
 *     date: string; endDate: string; title: string; place: string;
 *     poolType: 0 | 1; note: string;
 *   }
 *   validatePracticeRows(rows: PracticeRow[]): string[]       // 行ごとのエラーメッセージ配列
 *   validateCompetitionRows(rows: CompetitionRow[]): string[]
 *   buildManualBulkRegisterInput(
 *     mode: "practice" | "competition",
 *     practiceRows: PracticeRow[],
 *     competitionRows: CompetitionRow[],
 *   ): BulkRegisterInput  // 空行除外・trim・型変換込みで TeamBulkRegisterAPI.bulkRegister に渡せる形
 *
 * Sprint Contract 検証観点 (mobile 実装からの移植 + web 追加境界値):
 *   [V-D6-01] 練習行: date が空文字だとエラー ("N行目: 日付は必須です" 相当)
 *   [V-D6-02] 練習行: date のみ入力・他は空でもエラー無し (title/place/note は任意)
 *   [V-D6-03] 大会行: date(開始日) が空文字だとエラー
 *   [V-D6-04] 大会行: endDate が date より前だとエラー ("終了日は開始日以降" 相当)
 *   [V-D6-05] 大会行: endDate が date と同日は許容 (境界値: 同日はエラーにしない)
 *   [V-D6-06] 大会行: endDate 未入力は許容 (単日開催)
 *   [V-D6-07] buildManualBulkRegisterInput: mode="practice" のとき competitions は常に空配列
 *   [V-D6-08] buildManualBulkRegisterInput: mode="competition" のとき practices は常に空配列
 *   [V-D6-09] buildManualBulkRegisterInput: 前後空白は trim され、空文字は null に変換される
 *             (title/place/note が空文字の行 → null。API 側の Insert 型と整合)
 *   [V-D6-10] buildManualBulkRegisterInput: date が空文字の行は除外される (送信対象外)
 *   [V-D6-11] 境界値: 全行が空 (date未入力) の場合、practices/competitions は空配列になる
 *             (呼び出し側で「登録するデータがありません」ガードにつながる)
 *   [V-D6-12] poolType は 0/1 のみ (25m/50m) がそのまま渡る (数値変換をしない)
 *
 * NOTE: apps/web/utils/teamBulkRegisterManual.ts は D6 未実装のため、
 * このテストは import 解決の時点で失敗する (期待された赤テスト)。
 */

import { describe, it, expect } from "vitest";
import {
  validatePracticeRows,
  validateCompetitionRows,
  buildManualBulkRegisterInput,
  type PracticeRow,
  type CompetitionRow,
} from "@/utils/teamBulkRegisterManual";

const practiceRow = (overrides: Partial<PracticeRow> = {}): PracticeRow => ({
  date: "2026-08-01",
  title: "",
  place: "",
  note: "",
  ...overrides,
});

const competitionRow = (overrides: Partial<CompetitionRow> = {}): CompetitionRow => ({
  date: "2026-08-01",
  endDate: "",
  title: "",
  place: "",
  poolType: 0,
  note: "",
  ...overrides,
});

describe("validatePracticeRows (D6)", () => {
  it("[V-D6-01] date が空文字だとエラーになる", () => {
    const errors = validatePracticeRows([practiceRow({ date: "" })]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("[V-D6-02] date のみ入力なら他項目が空でもエラーにならない", () => {
    const errors = validatePracticeRows([practiceRow()]);
    expect(errors).toHaveLength(0);
  });

  it("複数行のうち1行だけ date 未入力ならその行のみエラーになる", () => {
    const errors = validatePracticeRows([practiceRow(), practiceRow({ date: "" })]);
    expect(errors).toHaveLength(1);
  });
});

describe("validateCompetitionRows (D6)", () => {
  it("[V-D6-03] date(開始日) が空文字だとエラーになる", () => {
    const errors = validateCompetitionRows([competitionRow({ date: "" })]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("[V-D6-04] endDate が date より前だとエラーになる", () => {
    const errors = validateCompetitionRows([
      competitionRow({ date: "2026-08-10", endDate: "2026-08-09" }),
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("[V-D6-05] 境界値: endDate が date と同日はエラーにならない", () => {
    const errors = validateCompetitionRows([
      competitionRow({ date: "2026-08-10", endDate: "2026-08-10" }),
    ]);
    expect(errors).toHaveLength(0);
  });

  it("[V-D6-06] endDate 未入力 (単日開催) はエラーにならない", () => {
    const errors = validateCompetitionRows([competitionRow({ date: "2026-08-10", endDate: "" })]);
    expect(errors).toHaveLength(0);
  });
});

describe("buildManualBulkRegisterInput (D6)", () => {
  it("[V-D6-07] mode=practice のとき competitions は常に空配列", () => {
    const input = buildManualBulkRegisterInput(
      "practice",
      [practiceRow()],
      [competitionRow()],
    );
    expect(input.competitions).toEqual([]);
    expect(input.practices).toHaveLength(1);
  });

  it("[V-D6-08] mode=competition のとき practices は常に空配列", () => {
    const input = buildManualBulkRegisterInput(
      "competition",
      [practiceRow()],
      [competitionRow()],
    );
    expect(input.practices).toEqual([]);
    expect(input.competitions).toHaveLength(1);
  });

  it("[V-D6-09] 前後空白は trim され、空文字は null に変換される", () => {
    const input = buildManualBulkRegisterInput(
      "practice",
      [practiceRow({ title: "  朝練  ", place: "   ", note: "" })],
      [],
    );
    expect(input.practices[0]).toEqual(
      expect.objectContaining({ title: "朝練", place: null, note: null }),
    );
  });

  it("[V-D6-10] date が空文字の行は送信対象から除外される", () => {
    const input = buildManualBulkRegisterInput(
      "practice",
      [practiceRow(), practiceRow({ date: "" })],
      [],
    );
    expect(input.practices).toHaveLength(1);
  });

  it("[V-D6-11] 境界値: 全行が空 (date未入力) なら practices/competitions は空配列", () => {
    const input = buildManualBulkRegisterInput(
      "practice",
      [practiceRow({ date: "" })],
      [],
    );
    expect(input.practices).toEqual([]);
  });

  it("[V-D6-12] poolType (0/1) はそのまま渡り、数値変換や丸めをしない", () => {
    const input = buildManualBulkRegisterInput(
      "competition",
      [],
      [competitionRow({ poolType: 1 })],
    );
    expect(input.competitions[0]).toEqual(expect.objectContaining({ pool_type: 1 }));
  });

  it("end_date も trim/null 変換される (空文字→null、複数日開催は値がそのまま渡る)", () => {
    const input = buildManualBulkRegisterInput(
      "competition",
      [],
      [
        competitionRow({ date: "2026-08-01", endDate: " 2026-08-03 " }),
        competitionRow({ date: "2026-08-05", endDate: "" }),
      ],
    );
    expect(input.competitions[0].end_date).toBe("2026-08-03");
    expect(input.competitions[1].end_date).toBeNull();
  });
});
