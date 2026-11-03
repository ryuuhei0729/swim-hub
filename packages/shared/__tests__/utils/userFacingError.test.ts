/**
 * toUserFacingMessage / UserFacingError の回帰テスト (Sprint Contract F1)
 *
 * 背景:
 *   `/competition` タブ (CompetitionClient.tsx) は、UI を迂回して
 *   `delete_competition_with_records` RPC を直接叩きチーム大会の削除を試みた場合
 *   (SC2 の想定シナリオ)、RPC が `success:false` で返す内部識別子文字列
 *   `'team competition cannot be deleted via this function'` をそのまま
 *   `new Error(result.error)` として throw していた (packages/shared/api/records.ts の
 *   deleteCompetition())。修正前の CompetitionClient.tsx はこの生の Error の
 *   `.message` をそのまま画面に表示しており、内部実装の詳細が露出していた (F1)。
 *
 *   修正後は `toUserFacingMessage(rawError, fallback)` を経由し、
 *   `UserFacingError` のインスタンスでない限り fallback (汎用文言) に畳まれる。
 *
 * トートロジー防止・過剰防御の防止 (対で置く理由):
 *   「汎用文言に変えただけ」と「全部潰しただけ (有用なエラーまで握りつぶす)」は
 *   区別できない。[V-F1-02] で UserFacingError は素通しされることを確認し、
 *   このユーティリティが「情報を握りつぶす」のではなく「表示してよいと明示された
 *   メッセージだけを通す」設計になっていることを担保する。
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  UserFacingError,
  configureNetworkErrorMessage,
  toUserFacingMessage,
} from "../../utils/userFacingError";

describe("toUserFacingMessage", () => {
  it("[V-F1-01] RPC が返す内部識別子文字列 (生のError) はそのまま露出せず、fallback に畳まれる", () => {
    // delete_competition_with_records RPC の team_id ガードが返す実際の文字列
    // (20260919000000_team_delete_admin_only.sql)。これは表示用文言ではなく
    // 機械可読な識別子であり、そのままユーザーに見せてはならない。
    const rawError = new Error("team competition cannot be deleted via this function");

    const result = toUserFacingMessage(rawError, "エラーが発生しました");

    expect(result).toBe("エラーが発生しました");
    expect(result).not.toContain("team competition cannot be deleted via this function");
  });

  it("[V-F1-02] UserFacingError は素通しされる (有用なエラーまで握りつぶさないことの確認)", () => {
    const userError = new UserFacingError("大会名を入力してください");

    const result = toUserFacingMessage(userError, "エラーが発生しました");

    expect(result).toBe("大会名を入力してください");
  });

  it("[V-F1-03] PostgrestError相当 (テーブル名/RLSポリシー名を含む文字列) も露出せず fallback に畳まれる", () => {
    const rawError = new Error(
      'new row violates row-level security policy for table "competitions"',
    );

    const result = toUserFacingMessage(rawError, "エラーが発生しました");

    expect(result).toBe("エラーが発生しました");
  });

  it("[V-F1-04] Error 以外の未知の値 (文字列そのもの等) も fallback に畳まれる", () => {
    const result = toUserFacingMessage("some raw string thrown without Error wrapper", "エラーが発生しました");

    expect(result).toBe("エラーが発生しました");
  });
});

describe("configureNetworkErrorMessage", () => {
  afterEach(() => {
    configureNetworkErrorMessage(null);
  });

  it("未設定なら通信エラーでも fallback を返す (web の従来動作)", () => {
    expect(toUserFacingMessage(new TypeError("Network request failed"), "保存に失敗しました")).toBe(
      "保存に失敗しました",
    );
  });

  it("設定すると、判定関数が返した文言を fallback より優先する", () => {
    configureNetworkErrorMessage((error) =>
      error instanceof TypeError ? "通信できませんでした" : null,
    );
    expect(toUserFacingMessage(new TypeError("Network request failed"), "保存に失敗しました")).toBe(
      "通信できませんでした",
    );
    expect(toUserFacingMessage(new Error("boom"), "保存に失敗しました")).toBe("保存に失敗しました");
  });

  it("UserFacingError はそのまま表示する (判定関数より優先)", () => {
    configureNetworkErrorMessage(() => "通信できませんでした");
    expect(toUserFacingMessage(new UserFacingError("管理者権限が必要です"), "x")).toBe(
      "管理者権限が必要です",
    );
  });
});
