// =============================================================================
// rankingStyleAxis.test.ts — チームランキング 種目/距離軸の導出 (QA Sprint Contract Phase B)
// =============================================================================
//
// 対象: apps/shared/utils/rankingStyleAxis.ts
//
// このファイルは web (apps/web/components/team/rankings/) と
// mobile (apps/mobile/components/teams/rankings/) の**唯一の定義元**であり、
// 既存テストで一切カバーされていなかった (Phase B 開始時点で
// `grep -rl rankingStyleAxis apps/*/__tests__` が 0 件)。
// 片方のプラットフォームだけが壊れる形の退行を最も起こしやすい箇所なので、
// PM が裁定した4項目 (既定 Fr/100m / 既定水路=長水路 / 種目変更時の距離引き継ぎ /
// 入力の頑健性) を全部ここで pin する。
//
// Sprint Contract 検証観点:
//   [V-40-a] buildRankingStyleGroups が styles マスターの実データから
//            25m×4種目 と 1500mFr を落とさずに選択肢を作る (件数の厳密一致で検証)
//   [V-40-b] 既定は Fr / 100m (styleId=3) / 長水路 (poolType=1) / **男子**
//            (第3弾でユーザー依頼により「男女すべて」を廃止し男子を既定にした。
//             水泳は性別で分かれて実施されるので男女混在の順位表に競技上の意味が無い)
//   [V-40-c] 種目変更時は同距離を維持し、無ければその種目の最短距離に落ちる
//   [V-40-d] 不正な行 (distance<=0 / 非有限 / 正規化不能な style) は選択肢に出さない。
//            同一 (種目,距離) の重複は min styleId を採る
//   [V-40-e] **削除済み** (2026-09-08)。`countActiveRankingFilters` は種目軸の統合で
//            未使用になり production 参照 0 件になったため関数ごと廃止された。
//            「既定との差分を何軸数えるか」は
//            `./rankingEventAxis.test.ts` の [V-EA-06] が担保する
//            (統合後は5軸だが**その画面に出ている軸だけ**を数えるので、
//             ここの4軸をそのまま移植したものではない)。
//            ⚠️ 移植先が無い観点が1つある: 「`period` は数えない」。
//            `RankingFilterState` に `period` フィールドが存在せず数える対象が
//            そもそも無いため。**Phase 2 (年度別 / 全レース) で `period` を
//            state の軸に戻すときは数え方を決めること。**
//
// ─────────────────────────────────────────────────────────────────────────────
// STYLES_MASTER のグラウンドトゥルース (トートロジー防止)
//
// 期待値は **プロダクションのビルダーでは作らない**。ローカル Supabase の実 DB を
// 直接読んだ結果 (2026-09-07 実測) をここに転記している:
//
//   docker exec supabase_db_swim-hub psql -U postgres -d postgres \
//     -c "select id, style, distance from public.styles order by id;"
//   → 22 行。Fr:25/50/100/200/400/800/1500 (id 1-7),
//     Br:25/50/100/200 (id 8-11), Ba:25/50/100/200 (id 12-15),
//     Fly:25/50/100/200 (id 16-19), IM:100/200/400 (id 20-22)
//
// 「この 22 行が実 DB に本当に存在するか」は
// supabase/tests/11_team_record_rankings_rpc.test.sql (V-DB-40) が実 DB 側で
// 検証する。ユニットテスト側は「その 22 行を渡したときの導出結果」だけを見る。
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  buildDefaultRankingFilters,
  buildRankingStyleGroups,
  findStyleAxis,
  findStyleId,
  resolveStyleIdOnStyleChange,
  RANKING_GENDER_VALUES,
} from "../../utils/rankingStyleAxis";
import type { Style, SwimStyle } from "../../types";

/**
 * styles マスターの1行を作る。name / name_jp はランキング軸の導出に使われないので
 * 「導出に効いていない」ことを示すために id から機械的に埋める
 * (もし実装が name_jp を見ていたら、この値では絶対に一致しないため赤くなる)。
 */
function styleRow(id: number, style: string, distance: number): Style {
  return {
    id,
    name: `db-name-${id}`,
    name_jp: `db-name-jp-${id}`,
    style: style as SwimStyle,
    distance,
  };
}

/** ローカル実 DB の public.styles 22 行 (上記コメントの実測値をそのまま転記) */
const STYLES_MASTER: readonly Style[] = [
  styleRow(1, "Fr", 25),
  styleRow(2, "Fr", 50),
  styleRow(3, "Fr", 100),
  styleRow(4, "Fr", 200),
  styleRow(5, "Fr", 400),
  styleRow(6, "Fr", 800),
  styleRow(7, "Fr", 1500),
  styleRow(8, "Br", 25),
  styleRow(9, "Br", 50),
  styleRow(10, "Br", 100),
  styleRow(11, "Br", 200),
  styleRow(12, "Ba", 25),
  styleRow(13, "Ba", 50),
  styleRow(14, "Ba", 100),
  styleRow(15, "Ba", 200),
  styleRow(16, "Fly", 25),
  styleRow(17, "Fly", 50),
  styleRow(18, "Fly", 100),
  styleRow(19, "Fly", 200),
  styleRow(20, "IM", 100),
  styleRow(21, "IM", 200),
  styleRow(22, "IM", 400),
];

// 実 DB から読んだ「種目 → 距離の全列挙」。toEqual で厳密一致させるため、
// toContain(50) のような部分一致では検出できない 25m/1500m の欠落を必ず捕まえる。
const EXPECTED_DISTANCES_BY_STYLE: ReadonlyArray<readonly [SwimStyle, readonly number[]]> = [
  ["Fr", [25, 50, 100, 200, 400, 800, 1500]],
  ["Br", [25, 50, 100, 200]],
  ["Ba", [25, 50, 100, 200]],
  ["Fly", [25, 50, 100, 200]],
  ["IM", [100, 200, 400]],
];

describe("buildRankingStyleGroups", () => {
  // [V-40-a] 25m と 1500m の欠落検出。swimStyles.ts の DISTANCES
  // ([50,100,200,400,800]) や regionalStandardTimes の SELECTABLE_DISTANCES を
  // 使ってしまうと、ここが必ず赤くなる (25m×4種目 と 1500mFr が消えるため)。
  it.each(EXPECTED_DISTANCES_BY_STYLE)(
    "[V-40-a] %s の距離選択肢が styles マスターと厳密に一致する (25m/1500m を落とさない)",
    (style, expectedDistances) => {
      const groups = buildRankingStyleGroups(STYLES_MASTER);
      const group = groups.find((candidate) => candidate.style === style);

      expect(group, `${style} のグループが選択肢に存在しない`).toBeDefined();
      expect(group?.distances.map((option) => option.distance)).toEqual([...expectedDistances]);
    },
  );

  it("[V-40-a] 25m を持つ種目がちょうど4種目 (IM には 25m が無い)", () => {
    const groups = buildRankingStyleGroups(STYLES_MASTER);

    const stylesWith25 = groups
      .filter((group) => group.distances.some((option) => option.distance === 25))
      .map((group) => group.style);

    // 「4件ある」だけでなく「どの4件か」まで固定する
    expect(stylesWith25).toEqual(["Fr", "Br", "Ba", "Fly"]);
  });

  it("[V-40-a] 1500m は Fr だけが持ち、styleId は実 DB の 7 である", () => {
    const groups = buildRankingStyleGroups(STYLES_MASTER);

    const stylesWith1500 = groups
      .filter((group) => group.distances.some((option) => option.distance === 1500))
      .map((group) => group.style);
    expect(stylesWith1500).toEqual(["Fr"]);
    expect(findStyleId(groups, "Fr", 1500)).toBe(7);
  });

  it("[V-40-a] 選択肢の総数が styles マスターの行数 (22) と一致する (行の取りこぼしゼロ)", () => {
    const groups = buildRankingStyleGroups(STYLES_MASTER);

    const totalOptions = groups.reduce((sum, group) => sum + group.distances.length, 0);
    expect(totalOptions).toBe(STYLES_MASTER.length);
  });

  it("種目の並びが canonical (SWIM_STYLES) の定義順である", () => {
    const groups = buildRankingStyleGroups(STYLES_MASTER);

    expect(groups.map((group) => group.style)).toEqual(["Fr", "Br", "Ba", "Fly", "IM"]);
  });

  it("入力の並びが逆順でも距離は昇順・種目は canonical 順に整列する", () => {
    const groups = buildRankingStyleGroups([...STYLES_MASTER].reverse());

    expect(groups.map((group) => group.style)).toEqual(["Fr", "Br", "Ba", "Fly", "IM"]);
    for (const [style, expectedDistances] of EXPECTED_DISTANCES_BY_STYLE) {
      const group = groups.find((candidate) => candidate.style === style);
      expect(group?.distances.map((option) => option.distance)).toEqual([...expectedDistances]);
    }
  });

  // [V-40-d] 入力の頑健性
  it("[V-40-d] distance が 0 / 負数 / 非有限の行は選択肢に出ない", () => {
    const groups = buildRankingStyleGroups([
      styleRow(301, "Fr", 100),
      styleRow(302, "Fr", 0),
      styleRow(303, "Fr", -50),
      styleRow(304, "Fr", Number.NaN),
      styleRow(305, "Fr", Number.POSITIVE_INFINITY),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.distances).toEqual([{ distance: 100, styleId: 301 }]);
  });

  it("[V-40-d] legacy 小文字 'fr' の行は canonical Fr として救済される", () => {
    const groups = buildRankingStyleGroups([styleRow(307, "fr", 200)]);

    expect(groups).toEqual([{ style: "Fr", distances: [{ distance: 200, styleId: 307 }] }]);
  });

  it("[V-40-d] リレー略称 'FR' や未知の種目文字列の行は選択肢に出ない", () => {
    const groups = buildRankingStyleGroups([
      styleRow(311, "FR", 200),
      styleRow(313, "MEDLEY", 400),
      styleRow(317, "", 100),
      styleRow(319, "Fr ", 300), // 前後空白は trim して救済される (対照用)
    ]);

    expect(groups).toEqual([{ style: "Fr", distances: [{ distance: 300, styleId: 319 }] }]);
  });

  it("[V-40-d] 同一 (種目, 距離) が重複した場合は最小の styleId を採る (取得順に依存しない)", () => {
    const ascending = buildRankingStyleGroups([
      styleRow(43, "Ba", 200),
      styleRow(57, "Ba", 200),
      styleRow(71, "Ba", 200),
    ]);
    const descending = buildRankingStyleGroups([
      styleRow(71, "Ba", 200),
      styleRow(57, "Ba", 200),
      styleRow(43, "Ba", 200),
    ]);

    expect(ascending[0]?.distances).toEqual([{ distance: 200, styleId: 43 }]);
    expect(descending[0]?.distances).toEqual([{ distance: 200, styleId: 43 }]);
  });

  it("空配列を渡すと空配列を返す (styles 取得前/取得失敗)", () => {
    expect(buildRankingStyleGroups([])).toEqual([]);
  });
});

describe("findStyleAxis / findStyleId", () => {
  const groups = buildRankingStyleGroups(STYLES_MASTER);

  it.each([
    [1, "Fr", 25],
    [7, "Fr", 1500],
    [12, "Ba", 25],
    [22, "IM", 400],
  ] as const)("styleId=%i を (%s, %im) に逆引きできる", (styleId, style, distance) => {
    expect(findStyleAxis(groups, styleId)).toEqual({ style, distance });
  });

  it("styles マスターに無い styleId は null を返す (キャストで押し通さない)", () => {
    expect(findStyleAxis(groups, 9999)).toBeNull();
    expect(findStyleAxis(groups, 0)).toBeNull();
    expect(findStyleAxis(groups, -3)).toBeNull();
  });

  it("存在しない (種目, 距離) の組み合わせは null を返す", () => {
    // Br の 400m / IM の 25m は styles マスターに存在しない
    expect(findStyleId(groups, "Br", 400)).toBeNull();
    expect(findStyleId(groups, "IM", 25)).toBeNull();
  });

  it("存在する組み合わせは実 DB の styleId を返す", () => {
    expect(findStyleId(groups, "Fr", 100)).toBe(3);
    expect(findStyleId(groups, "Fly", 25)).toBe(16);
    expect(findStyleId(groups, "IM", 100)).toBe(20);
  });
});

describe("resolveStyleIdOnStyleChange", () => {
  const groups = buildRankingStyleGroups(STYLES_MASTER);

  // [V-40-c] 同距離が存在すれば維持する
  it.each([
    ["Fr", 200, "Ba", 15],
    ["Ba", 100, "Fly", 18],
    ["IM", 200, "Br", 11],
  ] as const)(
    "[V-40-c] %s %im から %s に切り替えると同じ距離を維持する (styleId=%i)",
    (_fromStyle, currentDistance, nextStyle, expectedStyleId) => {
      expect(resolveStyleIdOnStyleChange(groups, nextStyle, currentDistance)).toBe(expectedStyleId);
    },
  );

  // [V-40-c] PM 裁定の代表ケース: Fr400 → Br は 400 が無いので Br の最短 (25m, id=8)
  it("[V-40-c] Fr 400m から Br に切り替えると 400m が無いので Br の最短 25m (styleId=8) になる", () => {
    expect(resolveStyleIdOnStyleChange(groups, "Br", 400)).toBe(8);
  });

  it("[V-40-c] Fr 1500m から IM に切り替えると IM の最短 100m (styleId=20) になる", () => {
    expect(resolveStyleIdOnStyleChange(groups, "IM", 1500)).toBe(20);
  });

  it("[V-40-c] 現在の距離が不明 (負の番兵値) でも最短距離にフォールバックする", () => {
    expect(resolveStyleIdOnStyleChange(groups, "Fr", -1)).toBe(1);
    expect(resolveStyleIdOnStyleChange(groups, "IM", -1)).toBe(20);
  });

  it("選択肢に存在しない種目に切り替えようとすると null を返す", () => {
    const frOnly = buildRankingStyleGroups([styleRow(401, "Fr", 100)]);
    expect(resolveStyleIdOnStyleChange(frOnly, "IM", 100)).toBeNull();
  });
});

describe("buildDefaultRankingFilters", () => {
  // [V-40-b] 既定は Fr / 100m / 長水路。ここが変わると web/mobile 両方の初期表示が変わる
  it("[V-40-b] 既定条件は Fr 50m (styleId=2) / 長水路 (poolType=1) / **男子** / チームの大会 / personalBest / 通算", () => {
    const defaults = buildDefaultRankingFilters(buildRankingStyleGroups(STYLES_MASTER));

    expect(defaults).toEqual({
      styleId: 2,
      poolType: 1,
      gender: "male",
      scope: "teamCompetitions",
      aggregation: "personalBest",
      period: { kind: "allTime" },
    });
  });

  it("[V-40-b] 既定の性別は「すべて」ではない (廃止された値が残っていない)", () => {
    const defaults = buildDefaultRankingFilters(buildRankingStyleGroups(STYLES_MASTER));
    expect(defaults?.gender).not.toBe("all");
  });

  it("[V-40-b] 性別の選択肢は男子/女子の2択で、既定はその中に実在する", () => {
    expect([...RANKING_GENDER_VALUES]).toEqual(["male", "female"]);
    const defaults = buildDefaultRankingFilters(buildRankingStyleGroups(STYLES_MASTER));
    expect(RANKING_GENDER_VALUES).toContain(defaults?.gender);
  });

  it("[V-40-b] 既定 styleId が指す軸は本当に Fr 50m である (id のマジックナンバー化を防ぐ)", () => {
    const groups = buildRankingStyleGroups(STYLES_MASTER);
    const defaults = buildDefaultRankingFilters(groups);

    expect(defaults).not.toBeNull();
    expect(findStyleAxis(groups, defaults?.styleId ?? -1)).toEqual({ style: "Fr", distance: 50 });
  });

  it("Fr 100m が styles マスターに無い場合は先頭種目の最短距離にフォールバックする", () => {
    // Fr 自体が無い (200mBa と 100mBa のみ) 異常系。canonical 順の先頭は Ba になる
    const groups = buildRankingStyleGroups([styleRow(503, "Ba", 200), styleRow(507, "Ba", 100)]);
    const defaults = buildDefaultRankingFilters(groups);

    expect(defaults?.styleId).toBe(507);
    expect(findStyleAxis(groups, 507)).toEqual({ style: "Ba", distance: 100 });
  });

  it("styles マスターが空 (取得前・取得失敗) のときは null を返す", () => {
    expect(buildDefaultRankingFilters([])).toBeNull();
  });
});
