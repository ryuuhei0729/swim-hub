/**
 * リレー split_times の通算タイム混入バグ修正 (Sprint Contract) — web 側ユニットテスト。
 *
 * PM 実測確認: web にはこの種のユニットテストが 0 件だった (mobile には
 * teamRecordBulk.splitRoundTrip.test.ts が存在した)。本ファイルはその web 移植版として
 * 新規追加する。
 *
 * 真因 (Contract):
 *   保存時 (RecordClient.handleSubmit)、entry.relaySplitTimes (リレー開始からの通算距離・
 *   通算タイム) を各 leg に分配する際、`distance` は `st.distance - legLow` で leg 内相対に
 *   変換されるが `splitTime` は無変換のまま DB に書かれていた。修正 (D1/D2/D4) は
 *   `getLegStartCumulative` / `toLegRelativeSplitTime` / `toCumulativeSplitTime` を新設し、
 *   保存時は通算値→leg相対値、再読込時は leg相対値→通算値の対称変換を行う。
 *
 * このテストが検証する不変条件:
 *   「保存で leg 相対値に正規化 → 再読込で通算値に逆正規化 → 元の通算値と一致」
 * かつ、DB に書かれる中間値 (leg 相対値) が「通算値のまま漏れていないか」も明示的に検証する。
 * 旧バグは save 側・reload 側の両方が無変換だったため、round-trip の最終結果だけを見ると
 * (打ち消し合って) 一致してしまい検出できない。そのため各テストは (1) 保存される
 * 中間値 (DB 相当) と (2) 最終的な再読込結果の両方を assert する。
 *
 * トートロジー回避: 実装をコピーせず、保存側 (saveSplitsPerLeg) はここで本物の
 * 純粋関数 (getLegStartCumulative/toLegRelativeSplitTime) を使って最小再現し、
 * ロード側は本物の buildStyleEntriesFromExisting を通す
 * (apps/web/__tests__/buildStyleEntries.test.ts の [C3] セクションと同じ方針)。
 */
import { describe, it, expect } from "vitest";
import {
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
  calcCumulativeTimes,
  RelayEventId,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/relayEvents";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
  SplitTimeEntry,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";
import { calculateRaceLapTimesTable } from "../../utils/lapTimeCalculator";

const STYLES = [
  { id: 3, name_jp: "100m 自由形" },
  { id: 4, name_jp: "200m 自由形", distance: 200 },
];

// NOTE: このファイル全体で `!` を多用する。saved[N]!/result[0]! 系は、この関数の戻り配列が
// legCount(常に4)と一致する長さで返る設計であることに基づく (呼び出し元は全て legCount=4)。
const STYLE_ID_FOR_RELAY: Record<string, number> = {
  relay_4x100_free: 3,
  relay_4x200_free: 4,
};

// 保存側変換 (RecordClient.handleSubmit の split 変換ロジックの最小再現)。
// D2 修正後の仕様: distance は leg 内距離へ、splitTime は legStart を引いた leg 相対値へ変換する。
function saveSplitsPerLeg(
  relayEventId: RelayEventId,
  legCount: number,
  relaySplits: SplitTimeEntry[],
  legTimes: number[],
): Array<{ distance: number; split_time: number }[]> {
  const legBoundaries = getRelayLegBoundaries(relayEventId);
  const cumulatives = calcCumulativeTimes(legTimes);
  const out: Array<{ distance: number; split_time: number }[]> = [];
  for (let legIdx = 0; legIdx < legCount; legIdx++) {
    // legCount は呼び出し元で常に getRelayLegBoundaries(relayEventId).length と一致する値を渡す
    // (このファイル内の全呼び出しで legCount=4 かつ4×リレーを使用)
    const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1]!;
    const legHigh = legBoundaries[legIdx]!;
    const legStart = getLegStartCumulative(cumulatives, legIdx);
    out.push(
      relaySplits
        .filter((st) => st.distance > legLow && st.distance <= legHigh)
        .map((st) => ({
          distance: legIdx === 0 ? st.distance : st.distance - legLow,
          split_time: toLegRelativeSplitTime(st.splitTime, legStart),
        })),
    );
  }
  return out;
}

function reloadGlobalDistances(
  relayEventId: RelayEventId,
  savedPerLeg: Array<{ distance: number; split_time: number }[]>,
  legTimes: number[],
): { distance: number; splitTime: number }[] {
  // STYLE_ID_FOR_RELAY はこのファイルで実際に使う relay_4x100_free / relay_4x200_free のみを
  // カバーする (RelayEventId 全種を網羅する必要は無い、テスト専用の最小マップ)
  const styleId = STYLE_ID_FOR_RELAY[relayEventId]!;
  const records: ExistingRecord[] = savedPerLeg.map((legSplits, idx) => ({
    id: `r-${idx}`,
    user_id: `u-${idx}`,
    style_id: styleId,
    // legTimes は呼び出し元で savedPerLeg と同じ leg 数の配列を渡す設計 (このファイル内の
    // 全呼び出しで saveSplitsPerLeg に渡した同じ配列を再利用している)
    time: legTimes[idx]!,
    is_relaying: idx !== 0,
    reaction_time: null,
    note: null,
    split_times: legSplits.map((s, j) => ({
      id: `${idx}-${j}`,
      distance: s.distance,
      split_time: s.split_time,
    })),
    users: { id: `u-${idx}`, name: `S${idx}` },
  }));
  const entry = buildStyleEntriesFromExisting(records, STYLES).find((e) => e.relayEventId === relayEventId)!;
  return (entry.relaySplitTimes ?? []).map((s) => ({ distance: s.distance, splitTime: s.splitTime }));
}

describe("[web] リレー split 通算値⇔leg相対値 round-trip (relay_4x100_free)", () => {
  const LEG_TIMES = [57, 58, 57, 56];

  it("全 leg 終端距離 (100,200,300,400) が保存→再ロードで距離・通算タイムとも保持される", () => {
    const original: SplitTimeEntry[] = [
      { id: "1", distance: 100, splitTime: 57.0, displayValue: "57.00" },
      { id: "2", distance: 200, splitTime: 115.5, displayValue: "1:55.50" },
      { id: "3", distance: 300, splitTime: 173.3, displayValue: "2:53.30" },
      { id: "4", distance: 400, splitTime: 230.0, displayValue: "3:50.00" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original, LEG_TIMES);
    // cumulatives(LEG_TIMES) = [57,115,172,228] → legStart = [0,57,115,172]
    expect(saved).toEqual([
      [{ distance: 100, split_time: 57.0 }],
      [{ distance: 100, split_time: 58.5 }],
      [{ distance: 100, split_time: 58.3 }],
      [{ distance: 100, split_time: 58.0 }],
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved, LEG_TIMES);
    expect(reloaded).toContainEqual({ distance: 100, splitTime: 57.0 });
    expect(reloaded).toContainEqual({ distance: 200, splitTime: 115.5 });
    expect(reloaded).toContainEqual({ distance: 300, splitTime: 173.3 });
    expect(reloaded).toContainEqual({ distance: 400, splitTime: 230.0 });
  });

  it("leg 境界の distance はちょうど 1 つの leg に属し、通算タイムも正しく復元される (二重計上なし)", () => {
    const original: SplitTimeEntry[] = [
      { id: "x", distance: 200, splitTime: 115.5, displayValue: "" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original, LEG_TIMES);
    expect(saved.flat()).toHaveLength(1);
    expect(saved[1]).toEqual([{ distance: 100, split_time: 58.5 }]);
    expect(saved[2]).toEqual([]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved, LEG_TIMES);
    expect(reloaded.filter((s) => s.distance === 200)).toEqual([{ distance: 200, splitTime: 115.5 }]);
  });
});

// =============================================================================
// [S1] スクショ実データ相当の回帰テスト (Sprint Contract Success Criteria S1)
//
// 4x200m フリーリレー・第4泳者 (legIdx=3)。legStart は Contract 記載の
// 「leg境界=536.40 (通算) - record.time(136.54) = 399.86」から逆算した。
// legTimes = [130.00, 134.00, 135.86, 136.54] とすると
//   cumulatives = [130.00, 264.00, 399.86, 536.40]
// で legStart(leg3) = cumulatives[2] = 399.86 となり Contract の数値と一致する。
// =============================================================================
describe("[S1] 4x200mフリーリレー第4泳者の実データ回帰 (Success Criteria S1)", () => {
  const LEG_TIMES_S1 = [130.0, 134.0, 135.86, 136.54];
  const RECORD_TIME_LEG3 = 136.54;

  const originalCumulativeSplits: SplitTimeEntry[] = [
    { id: "leg3-50", distance: 650, splitTime: 459.86, displayValue: "" }, // 600(legLow) + 50
    { id: "leg3-100", distance: 700, splitTime: 493.98, displayValue: "" }, // 600 + 100
    { id: "leg3-150", distance: 750, splitTime: 530.28, displayValue: "" }, // 600 + 150
  ];

  it("legStart(leg3) が Contract の数値どおり 399.86 になる", () => {
    const cumulatives = calcCumulativeTimes(LEG_TIMES_S1);
    expect(cumulatives).toEqual([130.0, 264.0, 399.86, 536.4]);
    expect(getLegStartCumulative(cumulatives, 3)).toBe(399.86);
  });

  it("保存される split は leg 相対値になる (通算値そのものは DB に残らない)", () => {
    const saved = saveSplitsPerLeg("relay_4x200_free", 4, originalCumulativeSplits, LEG_TIMES_S1);
    expect(saved[3]).toEqual([
      { distance: 50, split_time: 60.0 }, // 459.86 - 399.86
      { distance: 100, split_time: 94.12 }, // 493.98 - 399.86
      { distance: 150, split_time: 130.42 }, // 530.28 - 399.86
    ]);
    for (const st of saved[3]!) {
      expect(st.split_time).toBeLessThan(140);
    }
  });

  it(
    "calculateRaceLapTimesTable に leg 相対値 + ゴール補完 (record.time) を渡すと、" +
      "先頭 50m lap が通算値 (459.86) ではなくなり、100m/150m lap は現状どおり維持され、" +
      "最終 200m lap が 0.00 でない正の値になり、4 区間の合計が record.time (2:16.54) と " +
      "±0.01 秒で一致する (RecordSplitTimes.tsx が raceDistance のゴール split を record.time で " +
      "補完する挙動を再現)",
    () => {
      const saved = saveSplitsPerLeg("relay_4x200_free", 4, originalCumulativeSplits, LEG_TIMES_S1);
      const leg3Splits = saved[3]!.map((s) => ({ distance: s.distance, splitTime: s.split_time }));

      // RecordSplitTimes.tsx 相当: DB の leg 相対値 + raceDistance(200) のゴール補完 (record.time)
      const displaySplits = [...leg3Splits, { distance: 200, splitTime: RECORD_TIME_LEG3 }];

      const table = calculateRaceLapTimesTable(displaySplits, 200);
      const lapAt = (distance: number) => table.find((row) => row.distance === distance)!.lapTimes[50];

      // 先頭ラップ (0→50m) は通算値 459.86 ではない (旧バグはここが 459.86 になっていた)
      expect(lapAt(50)).not.toBeCloseTo(459.86, 1);
      expect(lapAt(50)).toBeCloseTo(60.0, 2);
      // 中間ラップは Contract 記載どおり現状の値を維持
      expect(lapAt(100)).toBeCloseTo(34.12, 2);
      expect(lapAt(150)).toBeCloseTo(36.3, 2);
      // 最終ラップ (150→200m) は 0.00 でない正の値
      expect(lapAt(200)).toBeGreaterThan(0);
      expect(lapAt(200)).toBeCloseTo(6.12, 2);

      // 4 区間の合計が record.time と ±0.01 秒で一致する
      const total = [50, 100, 150, 200].reduce((sum, d) => sum + (lapAt(d) ?? 0), 0);
      expect(Math.abs(total - RECORD_TIME_LEG3)).toBeLessThanOrEqual(0.01);
    },
  );

  it("保存 → 再読込で元の通算 split (650=459.86 / 700=493.98 / 750=530.28) が復元される (S2)", () => {
    const saved = saveSplitsPerLeg("relay_4x200_free", 4, originalCumulativeSplits, LEG_TIMES_S1);
    expect(saved[0]).toEqual([]);
    expect(saved[1]).toEqual([]);
    expect(saved[2]).toEqual([]);

    const reloaded = reloadGlobalDistances("relay_4x200_free", saved, LEG_TIMES_S1);
    expect(reloaded).toContainEqual({ distance: 650, splitTime: 459.86 });
    expect(reloaded).toContainEqual({ distance: 700, splitTime: 493.98 });
    expect(reloaded).toContainEqual({ distance: 750, splitTime: 530.28 });
  });

  it("第1泳者 (legIdx=0) は offset0 なので保存値が通算値と一致する (Success Criteria S3)", () => {
    const leg0Splits: SplitTimeEntry[] = [
      { id: "leg0-50", distance: 50, splitTime: 32.5, displayValue: "" },
      { id: "leg0-100", distance: 100, splitTime: 65.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLeg("relay_4x200_free", 4, leg0Splits, LEG_TIMES_S1);
    expect(saved[0]).toEqual([
      { distance: 50, split_time: 32.5 },
      { distance: 100, split_time: 65.0 },
    ]);
  });
});

// =============================================================================
// [S4] 非リレー (個人種目) 不変の回帰テスト (Success Criteria S4)
//
// D2/D3/D4 の分岐はすべて `entry.relayEventId` の有無でガードされているため、
// 個人種目の split_times 保存・lap 表示は今回の修正で変化してはならない。
// =============================================================================
describe("[S4] 個人種目 (非リレー) の split_times / lap 表示は現状どおり変わらない", () => {
  it("個人種目の split はそのまま (leg 相対変換の対象外)", () => {
    const records: ExistingRecord[] = [
      {
        id: "r-1",
        user_id: "u-1",
        style_id: 4, // 200m 自由形 (relayEventId を持たない単独レコード)
        time: 125.0,
        is_relaying: false,
        reaction_time: null,
        note: null,
        split_times: [
          { id: "s1", distance: 50, split_time: 30.0 },
          { id: "s2", distance: 100, split_time: 62.0 },
          { id: "s3", distance: 150, split_time: 94.5 },
        ],
        users: { id: "u-1", name: "太郎" },
      },
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result[0]!.relayEventId).toBeUndefined();
    const splitTimes = result[0]!.memberRecords[0]!.splitTimes;
    // distance も splitTime も DB の値のまま (leg 相対変換は適用されない)。
    // 200m (= 種目距離) は Phase5 の既存機能でゴール split として record.time (125.0) が
    // 復元される (今回の修正の対象外・不変)
    expect(splitTimes.map((s) => ({ distance: s.distance, splitTime: s.splitTime }))).toEqual([
      { distance: 50, splitTime: 30.0 },
      { distance: 100, splitTime: 62.0 },
      { distance: 150, splitTime: 94.5 },
      { distance: 200, splitTime: 125.0 },
    ]);
  });

  it("個人種目の lap 表示 (calculateRaceLapTimesTable) は通常の差分計算のまま", () => {
    const splits = [
      { distance: 50, splitTime: 30.0 },
      { distance: 100, splitTime: 62.0 },
      { distance: 150, splitTime: 94.5 },
      { distance: 200, splitTime: 125.0 },
    ];
    const table = calculateRaceLapTimesTable(splits, 200);
    const lapAt = (distance: number) => table.find((row) => row.distance === distance)!.lapTimes[50];
    expect(lapAt(50)).toBe(30.0); // 先頭ラップは通算値と等しい (leg 相対変換されない)
    expect(lapAt(100)).toBe(32.0);
    expect(lapAt(150)).toBe(32.5);
    expect(lapAt(200)).toBe(30.5);
  });

  it(
    "個人種目の記録に is_relaying=true が単独で立っていても (StyleChipSelector 由来の自由入力)、" +
      "4件連続パターンに一致しない限りリレーとして誤検出されず split は無変換のまま (Contract D6 注記の裏付け)",
    () => {
      const records: ExistingRecord[] = [
        {
          id: "r-1",
          user_id: "u-1",
          style_id: 2,
          time: 27.5,
          is_relaying: true, // 個人記録でも自由に立てられるフラグ (Contract D6 参照)
          reaction_time: null,
          note: null,
          split_times: [{ id: "s1", distance: 25, split_time: 13.0 }],
          users: { id: "u-1", name: "花子" },
        },
      ];
      const result = buildStyleEntriesFromExisting(records, [{ id: 2, name_jp: "50m 自由形" }]);
      expect(result[0]!.relayEventId).toBeUndefined();
      expect(result[0]!.memberRecords[0]!.splitTimes).toEqual([{ id: "s1", distance: 25, splitTime: 13.0, displayValue: "13.00" }]);
    },
  );
});
