/**
 * resolveSaveReturnTarget 単体テスト (mobile)
 *
 * Sprint Contract: チーム大会・チーム練習の保存後、popToTop() で MainTabs (チーム一覧) まで
 * 吹き飛ばされ、直前にいた TeamDetail の大会タブへ戻れなくなるバグの修正 (utils/tabFormUtils.ts)。
 *
 * QA Phase A の注意: このファイルは apps/mobile/utils/tabFormUtils.ts から
 * resolveSaveReturnTarget を **実装 import** して検証する。テスト内にロジックを
 * 再実装しない (過去に「テスト内にプロダクションロジックを再実装し、赤も緑も無意味になった」
 * 事故があるため)。
 *
 * 検証観点 (Sprint Contract Verification Checklist SC-9 相当):
 *   - teamId が非空文字列 → { kind: "team", teamId } (チーム大会/練習フロー)
 *   - teamId が undefined/null/空文字/空白のみ → { kind: "popToTop" } (個人フロー・フォールバック)
 *
 * `options.fallback` の検証観点:
 *   - options 省略時 → { kind: "popToTop" } (この関数が導入された時点の既定値)
 *   - options.fallback: "goBack" + teamId なし → { kind: "goBack" }
 *   - teamId あり → fallback に関わらず { kind: "team" }
 *
 * 【Sprint Contract v3 / D6 によるコメント更新】
 * かつてここには「options 省略時は CompetitionBasicFormScreen の既存呼び出し元の
 * 非退行のため」と書かれていたが、D2 で CompetitionBasicFormScreen は
 * CompetitionTabForm へのリダイレクトシムになり、この関数を呼ばなくなった。
 * QA 実測 (grep): 現在この関数を呼ぶプロダクションコードは
 * `screens/CompetitionTabFormScreen.tsx` の1箇所だけで、そこは
 * `{ fallback: "goBack" }` を明示的に渡す (PracticeTabFormScreen はこの関数を使わず
 * 常に `navigation.goBack()`)。つまり省略時の "popToTop" は現時点でプロダクション
 * からは到達しない既定値であり、この単体テストが唯一の呼び出し元である
 * (削除する場合は関数シグネチャ側と一緒に判断すること)。
 */

import { describe, it, expect } from "vitest";
import { resolveSaveReturnTarget } from "../tabFormUtils";

describe("resolveSaveReturnTarget", () => {
  it("teamId が非空文字列 → { kind: 'team', teamId } を返す", () => {
    expect(resolveSaveReturnTarget("team-123")).toEqual({ kind: "team", teamId: "team-123" });
  });

  it("teamId が UUID 形式でも同様に team を返す (実データを想定した境界値)", () => {
    const uuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(resolveSaveReturnTarget(uuid)).toEqual({ kind: "team", teamId: uuid });
  });

  it("[境界値] teamId が undefined → { kind: 'popToTop' } (個人フロー)", () => {
    expect(resolveSaveReturnTarget(undefined)).toEqual({ kind: "popToTop" });
  });

  it("[境界値] teamId が null → { kind: 'popToTop' }", () => {
    expect(resolveSaveReturnTarget(null)).toEqual({ kind: "popToTop" });
  });

  it("[境界値] teamId が空文字 '' → { kind: 'popToTop' }", () => {
    expect(resolveSaveReturnTarget("")).toEqual({ kind: "popToTop" });
  });

  it("[境界値] teamId が空白のみ '   ' → { kind: 'popToTop' } (trim 後に空)", () => {
    expect(resolveSaveReturnTarget("   ")).toEqual({ kind: "popToTop" });
  });

  it("[回帰] 戻り値の判別ユニオンは kind='team' のときのみ teamId プロパティを持つ", () => {
    const result = resolveSaveReturnTarget("team-1");
    expect(result.kind).toBe("team");
    if (result.kind === "team") {
      expect(result.teamId).toBe("team-1");
    } else {
      throw new Error("kind が team ではない (退行)");
    }
  });

  describe("options.fallback (今回のスプリントで追加)", () => {
    it("[非退行] options 省略時、teamId なしは従来通り { kind: 'popToTop' } を返す", () => {
      expect(resolveSaveReturnTarget(undefined)).toEqual({ kind: "popToTop" });
    });

    it("options.fallback: 'goBack' + teamId なし → { kind: 'goBack' }", () => {
      expect(resolveSaveReturnTarget(undefined, { fallback: "goBack" })).toEqual({ kind: "goBack" });
    });

    it("options.fallback: 'goBack' + teamId が空文字 → { kind: 'goBack' }", () => {
      expect(resolveSaveReturnTarget("", { fallback: "goBack" })).toEqual({ kind: "goBack" });
    });

    it("options.fallback: 'popToTop' を明示しても teamId なしは { kind: 'popToTop' }", () => {
      expect(resolveSaveReturnTarget(undefined, { fallback: "popToTop" })).toEqual({ kind: "popToTop" });
    });

    it("teamId あり + fallback: 'goBack' でも { kind: 'team', teamId } が優先される", () => {
      expect(resolveSaveReturnTarget("team-9", { fallback: "goBack" })).toEqual({
        kind: "team",
        teamId: "team-9",
      });
    });
  });
});
