/**
 * getEditingDataTeamId テスト (Sprint Contract 2)
 *
 * この関数は「親 (practices/competitions) 行の basicData UPDATE を許可してよいか」
 * (= allowParentUpdate) を導出する唯一の判定元であり、SC1/SC2/SC3 の安全性が
 * すべてこの1関数の正しさに依存する。
 *
 * 設計上の要件 (Reviewer 指摘 F1):
 *   - team_id が確認できて null → 個人 (編集可)
 *   - team_id が確認できて文字列 → チーム (編集不可)
 *   - team_id が「不明」(DB取得失敗・未対応の構築経路等) → 個人と混同せず
 *     "unknown" を返す。呼び出し側は `getEditingDataTeamId(x) == null` で
 *     判定するため、"unknown" は truthy な文字列として false 側 (編集不可) に
 *     倒れる。ここが誤って null になると、DB取得失敗時に個人画面から
 *     チーム大会/練習の basicData を編集できてしまう (fail open)。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 の記述と JSDoc の仕様記述から
 * 導出したものであり、実装のコピーではない。
 */

import { describe, expect, it } from "vitest";
import { getEditingDataTeamId } from "../dashboardHelpers";

describe("getEditingDataTeamId", () => {
  it("[V-1] editingData が null/undefined (新規作成) のときは null (個人) を返す", () => {
    expect(getEditingDataTeamId(null)).toBeNull();
    expect(getEditingDataTeamId(undefined)).toBeNull();
  });

  it("[V-2] team_id キーを持ち値が null (個人大会/練習) のときは null を返す", () => {
    expect(getEditingDataTeamId({ id: "comp-1", team_id: null })).toBeNull();
  });

  it("[V-3] team_id キーを持ち値が文字列 (チーム) のときはその文字列を返す", () => {
    expect(getEditingDataTeamId({ id: "comp-1", team_id: "team-abc" })).toBe("team-abc");
  });

  it('[V-4] team_id の値が明示的に "unknown" 文字列のときは "unknown" を返す', () => {
    expect(getEditingDataTeamId({ id: "comp-1", team_id: "unknown" })).toBe("unknown");
  });

  it("[V-5 / fail-safe の核心] team_id キーはあるが値が undefined (DB取得失敗の暫定値等) のときは" +
    ' "unknown" を返す (null と混同して個人扱いにしない)', () => {
    expect(getEditingDataTeamId({ id: "comp-1", team_id: undefined })).toBe("unknown");
  });

  it('[V-6 / fail-safe の核心] team_id キー自体を持たないオブジェクト (取得失敗フォールバック等) は' +
    ' "unknown" を返す', () => {
    expect(getEditingDataTeamId({ id: "comp-1" })).toBe("unknown");
  });

  it("[V-7] CalendarItem 形式: metadata.team_id が null なら null (個人) を返す", () => {
    expect(
      getEditingDataTeamId({
        id: "item-1",
        type: "practice",
        metadata: { team_id: null },
      }),
    ).toBeNull();
  });

  it("[V-8] CalendarItem 形式: metadata.team_id が文字列ならその文字列を返す", () => {
    expect(
      getEditingDataTeamId({
        id: "item-1",
        type: "team_practice",
        metadata: { team_id: "team-xyz" },
      }),
    ).toBe("team-xyz");
  });

  it("[V-9] CalendarItem 形式: metadata.competition.team_id を参照する (entry 経由の大会編集)", () => {
    expect(
      getEditingDataTeamId({
        id: "entry-1",
        type: "entry",
        metadata: { competition: { id: "comp-1", team_id: "team-entry" } },
      }),
    ).toBe("team-entry");
  });

  it("[V-10] CalendarItem 形式: metadata.entry.team_id を参照する", () => {
    expect(
      getEditingDataTeamId({
        id: "entry-1",
        type: "entry",
        metadata: { entry: { id: "entry-1", team_id: "team-entry2" } },
      }),
    ).toBe("team-entry2");
  });

  it("[V-11] CalendarItem 形式で team_id がどの経路にも存在しない場合は null (個人) を返す" +
    " (JSDoc: calendar 取得パイプラインは該当時に必ず team_id を含めるため)", () => {
    expect(
      getEditingDataTeamId({
        id: "item-1",
        type: "practice",
        metadata: {},
      }),
    ).toBeNull();
  });

  it('[V-12] 判定式 (x == null) との整合性: "unknown" は == null で false になる', () => {
    // getEditingDataTeamId(x) == null という呼び出し側の判定パターンが
    // "unknown" を誤って個人扱いにしないことを、実際の判定式で確認する。
    const result = getEditingDataTeamId({ id: "comp-1" });
    expect(result).toBe("unknown");
    expect(result == null).toBe(false);
  });

  it("[V-13 / 非退行] 判定式 (x == null) との整合性: null は == null で true になる", () => {
    const result = getEditingDataTeamId({ id: "comp-1", team_id: null });
    expect(result).toBeNull();
    expect(result == null).toBe(true);
  });
});
