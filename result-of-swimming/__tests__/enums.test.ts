/**
 * parser/enums.ts の code -> canonical 種目 変換テスト
 *
 * Sprint: GitHub Issue #13 種目略称ケーシング統一 (result-of-swimming への波及, PM実測)
 *
 * 背景 (PM 実測 2026-09-01):
 *   `STROKE_BY_CODE` (swimming_style.code -> RawStroke) は外部API由来の数値コード
 *   (1-5) を swim-hub の canonical 種目コードへ変換する境界層。
 *   数値コードと種目の対応 (1=自由形, 2=背泳ぎ, 3=平泳ぎ, 4=バタフライ, 5=個人メドレー)
 *   は canonical 配列の並び順 (Fr, Br, Ba, Fly, IM) と**順序が異なる**
 *   (2=Ba, 3=Br の対応が canonical 配列の Br, Ba の並びと逆)。
 *   ケーシング統一時に canonical 配列順へ機械的に並べ替えると、背泳ぎ(Ba)と
 *   平泳ぎ(Br)が静かに入れ替わる恐れがある。
 *
 *   過去に同型の事故が実在する (スクレイピングの STYLE_MAP で背泳ぎ50mの style_id を
 *   8→13 と誤り、誤った style_id が DB に入った実障害)。
 *
 * このテストの設計方針 (PM 指摘の反映):
 *   「5件とも変換できた」という集合の一致だけでは、2件が入れ替わっていても
 *   検出できない (集合としては同じ5値のまま)。**コードごとに個別に**
 *   期待する種目を固定することで、入れ替わりを個別に検出できるようにする。
 *
 * Sprint Contract 検証観点:
 *   [V-ROS-01] code=1..5 が個別に正しい種目へ変換される (集合一致ではなく1件ずつ)
 *   [V-ROS-02] 未知のcode / null / undefined は "unknown" を返す
 *   [V-ROS-03] リレー種目コード(6,7)は個人種目の変換対象ではない (isRelayStyle)
 *
 * トートロジー防止メモ:
 *   本物の `toStroke`/`STROKE_BY_CODE`/`isRelayStyle` を import して検証しており、
 *   対応表を再実装していない。期待値 (どのcodeがどの種目か) は PM が実測した
 *   Result of Swimming 側の実際の意味 (外部サイトの表示上の種目名) に基づき、
 *   プロダクションコードの値をそのままコピーしたものではない。
 */
import { describe, expect, it } from "vitest";
import { STROKE_BY_CODE, GAME_STATUS_CONFIRMED, isRelayStyle, toStroke } from "../src/parser/enums";

describe("[V-ROS-01] toStroke / STROKE_BY_CODE — code ごとの個別対応(入れ替わり検知)", () => {
  // 集合一致 (toEqual(expect.arrayContaining(...))) ではなく、
  // 1件ずつ個別の it() で固定する。これにより「2件が入れ替わった」状態を
  // 2件のテストが個別に red になる形で検出できる (集合一致だと red が0件になり得る)。
  it("code=1 は自由形(Fr)", () => {
    expect(toStroke(1)).toBe("Fr");
    expect(STROKE_BY_CODE[1]).toBe("Fr");
  });

  it("code=2 は背泳ぎ(Ba) — 3(平泳ぎ)との入れ替わり事故に対する回帰ガード", () => {
    expect(toStroke(2)).toBe("Ba");
    expect(STROKE_BY_CODE[2]).toBe("Ba");
  });

  it("code=3 は平泳ぎ(Br) — 2(背泳ぎ)との入れ替わり事故に対する回帰ガード", () => {
    expect(toStroke(3)).toBe("Br");
    expect(STROKE_BY_CODE[3]).toBe("Br");
  });

  it("code=4 はバタフライ(Fly)", () => {
    expect(toStroke(4)).toBe("Fly");
    expect(STROKE_BY_CODE[4]).toBe("Fly");
  });

  it("code=5 は個人メドレー(IM)", () => {
    expect(toStroke(5)).toBe("IM");
    expect(STROKE_BY_CODE[5]).toBe("IM");
  });

  it("STROKE_BY_CODE はちょうど5エントリである(6,7=リレーを含まない)", () => {
    expect(Object.keys(STROKE_BY_CODE)).toHaveLength(5);
  });
});

describe("[V-ROS-02] toStroke — 未知/null/undefined", () => {
  it("未知のcode(0, 6, 7, 99)は unknown を返す", () => {
    expect(toStroke(0)).toBe("unknown");
    expect(toStroke(6)).toBe("unknown"); // リレー扱いだが個人種目コード表には無い
    expect(toStroke(7)).toBe("unknown");
    expect(toStroke(99)).toBe("unknown");
  });

  it("null/undefinedは unknown を返す", () => {
    expect(toStroke(null)).toBe("unknown");
    expect(toStroke(undefined)).toBe("unknown");
  });
});

describe("[V-ROS-03] isRelayStyle", () => {
  it("6,7 はリレー種目コードである", () => {
    expect(isRelayStyle(6)).toBe(true);
    expect(isRelayStyle(7)).toBe(true);
  });

  it("個人種目コード(1-5)・未知(0,99)・null/undefinedはリレーでない", () => {
    for (const code of [0, 1, 2, 3, 4, 5, 99]) {
      expect(isRelayStyle(code)).toBe(false);
    }
    expect(isRelayStyle(null)).toBe(false);
    expect(isRelayStyle(undefined)).toBe(false);
  });
});

describe("GAME_STATUS_CONFIRMED (回帰ガード, 変更検知用)", () => {
  it("記録確定ステータスコードは 5 のまま", () => {
    expect(GAME_STATUS_CONFIRMED).toBe(5);
  });
});
