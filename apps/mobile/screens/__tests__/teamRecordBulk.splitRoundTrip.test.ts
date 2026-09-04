// QA Phase A/B (D7): リレー split の「通算値→leg相対値への正規化 (保存) →
// leg相対値→通算値への逆正規化 (再読込)」round-trip 検証。
//
// 背景 (Sprint Contract 真因):
//   保存時、split の `distance` は `st.distance - legLow` で leg 内相対に変換されていたが、
//   `splitTime` (タイム) は無変換のまま DB に書かれていた。これにより DB の 1 レコード内に
//   「リレー開始からの通算タイム」が leg 相対値として混入し、表示側のラップ計算が破綻する
//   (先頭ラップが通算値そのもの・最終ラップが負値→0.00 クランプ)。
//
// 修正 (D1/D2/D4): `getLegStartCumulative` / `toLegRelativeSplitTime` /
// `toCumulativeSplitTime` を新設し、保存時は通算値→leg相対値、再読込時は
// leg相対値→通算値の変換を対で行う。
//
// このテストが検証する不変条件:
//   「保存で leg 相対値に正規化 → 再読込で通算値に逆正規化 → 元の通算値と一致」
// かつ、DB に書かれる中間値 (leg相対値) そのものが「通算値のまま漏れていないか」も
// 明示的に検証する。旧バグは save 側・reload 側の両方が無変換だったため、
// round-trip の最終結果だけを見ると (打ち消し合って) 一致してしまい検出できない。
// そのため各テストは (1) 保存される中間値 (DB 相当) と (2) 最終的な再読込結果の
// 両方を assert する。
//
// トートロジー回避: 実装をコピーせず、保存側 (saveSplitsPerLeg) はここで
// 本物の純粋関数 (getLegStartCumulative/toLegRelativeSplitTime) を使って最小再現し、
// ロード側は本物の buildStyleEntriesFromExisting を通す。
import { describe, it, expect } from "vitest";
import {
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
  calcCumulativeTimes,
  RelayEventId,
} from "../teamRecordBulk/relayEvents";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
  SplitTimeEntry,
} from "../teamRecordBulk/buildStyleEntries";

const STYLES = [
  { id: 3, name_jp: "100m 自由形" },
  { id: 4, name_jp: "200m 自由形" },
];

// relayEventId → 各 leg の style_id (フリーリレーは全 leg 同一)。
// RELAY_EVENTS (relayEvents.ts) の freeLegsDef と同じ値を使う。
const STYLE_ID_FOR_RELAY: Record<string, number> = {
  relay_4x100_free: 3,
  relay_4x200_free: 4,
};

// reloadGlobalDistances で使う各 leg の記録タイム (records.time は常に leg 相対値で正しい)。
// save 側の legStart 計算にも同じ配列を使うことで、実際のアプリの
// 「保存時に entry.memberRecords.map(mr => mr.time) から legStart を出す」動作を再現する。
//
// 各 leg の時間は、この後のテストで使う leg 相対値 (通算値-legStart) が必ず
// record.time より小さくなるよう十分な余裕を持たせている。buildStyleEntries.ts の
// `isRecordSplitTimesCorrupted` (split_time >= record.time を旧バグ由来の破損
// データとみなして丸ごと捨てる防御ロジック) を誤って発火させないための配慮
// (このガード自体は正しい設計であり、テストの入力を現実的な値に保つ側で対応する)。
const LEG_TIMES = [63, 68, 64, 60];

// 保存側変換 (TeamRecordBulkFormScreen.handleSubmit の split 変換ロジックの最小再現)。
// D2 修正後の仕様: 各 leg に属する split を抽出し、distance は leg 内距離へ、
// splitTime は leg 開始通算タイム (legStart) を引いた leg 相対値へ変換する。
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
    const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1]!; // legBoundaries は呼び出し元で legCount と同じ長さを渡す設計
    const legHigh = legBoundaries[legIdx]!; // 同上
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

// 保存された leg 内 split から「再ロード用 ExistingRecord 配列」を組み立て、
// buildStyleEntriesFromExisting に通して全体距離・通算タイムへ復元する。
function reloadGlobalDistances(
  relayEventId: RelayEventId,
  savedPerLeg: Array<{ distance: number; split_time: number }[]>,
  legTimes: number[] = LEG_TIMES,
): { distance: number; splitTime: number }[] {
  const styleId = STYLE_ID_FOR_RELAY[relayEventId]!; // このファイルで使う2種 (relay_4x100_free/relay_4x200_free) のみ定義されており必ず存在
  const records: ExistingRecord[] = savedPerLeg.map((legSplits, idx) => ({
    id: `r-${idx}`,
    user_id: `u-${idx}`,
    style_id: styleId,
    time: legTimes[idx]!, // legTimes は savedPerLeg と同じ leg 数以上の長さを持つ設計
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

describe("[T-2] リレー split 距離・通算タイム round-trip (relay_4x100_free)", () => {
  it("全 leg 終端距離 (100,200,300,400) が保存→再ロードで距離・タイムとも保持される", () => {
    const original: SplitTimeEntry[] = [
      { id: "1", distance: 100, splitTime: 57.0, displayValue: "57.00" },
      { id: "2", distance: 200, splitTime: 115.5, displayValue: "1:55.50" },
      { id: "3", distance: 300, splitTime: 173.3, displayValue: "2:53.30" },
      { id: "4", distance: 400, splitTime: 230.0, displayValue: "3:50.00" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original, LEG_TIMES);
    // cumulatives(LEG_TIMES=[63,68,64,60]) = [63,131,195,255] → legStart = [0,63,131,195]
    // D2 修正後: splitTime は通算値 - legStart (leg 相対値) として DB に書かれる。
    // leg0: 57.0-0=57.0 / leg1: 115.5-63=52.5 / leg2: 173.3-131=42.3 / leg3: 230.0-195=35.0
    // (旧バグでは splitTime が無変換のまま 57.0/115.5/173.3/230.0 になっていた)
    expect(saved).toEqual([
      [{ distance: 100, split_time: 57.0 }],
      [{ distance: 100, split_time: 52.5 }],
      [{ distance: 100, split_time: 42.3 }],
      [{ distance: 100, split_time: 35.0 }],
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // 再ロードで元の全体距離・通算タイムに戻る (D4: leg 相対値 + legStart)
    expect(reloaded.map((s) => s.distance).sort((a, b) => a - b)).toEqual([100, 200, 300, 400]);
    expect(reloaded).toContainEqual({ distance: 100, splitTime: 57.0 });
    expect(reloaded).toContainEqual({ distance: 200, splitTime: 115.5 });
    expect(reloaded).toContainEqual({ distance: 300, splitTime: 173.3 });
    expect(reloaded).toContainEqual({ distance: 400, splitTime: 230.0 });
  });

  it("leg 中間の split (25m刻み) も distance・通算タイムとも round-trip で保持される", () => {
    // 各 leg 内に 50m 地点を追加: 全体 50,100 / 150,200 / 250,300 / 350,400
    const original: SplitTimeEntry[] = [
      { id: "a", distance: 50, splitTime: 27.0, displayValue: "" },
      { id: "b", distance: 100, splitTime: 57.0, displayValue: "" },
      { id: "c", distance: 150, splitTime: 86.0, displayValue: "" },
      { id: "d", distance: 200, splitTime: 115.5, displayValue: "" },
      { id: "e", distance: 250, splitTime: 144.0, displayValue: "" },
      { id: "f", distance: 300, splitTime: 173.3, displayValue: "" },
      { id: "g", distance: 350, splitTime: 201.0, displayValue: "" },
      { id: "h", distance: 400, splitTime: 230.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original, LEG_TIMES);
    // leg1 (legStart=63): distance 150→50, 200→100 / splitTime 86.0-63=23.0, 115.5-63=52.5
    expect(saved[1]).toEqual([
      { distance: 50, split_time: 23.0 },
      { distance: 100, split_time: 52.5 },
    ]);
    // leg2 (legStart=131): distance 250→50, 300→100 / splitTime 144.0-131=13.0, 173.3-131=42.3
    expect(saved[2]).toEqual([
      { distance: 50, split_time: 13.0 },
      { distance: 100, split_time: 42.3 },
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    expect(reloaded.map((s) => s.distance).sort((a, b) => a - b)).toEqual([
      50, 100, 150, 200, 250, 300, 350, 400,
    ]);
    // 取り違え検出: 各全体距離に正しい通算タイムが紐づく (D4 の逆変換で復元)
    expect(reloaded).toContainEqual({ distance: 150, splitTime: 86.0 });
    expect(reloaded).toContainEqual({ distance: 250, splitTime: 144.0 });
    expect(reloaded).toContainEqual({ distance: 350, splitTime: 201.0 });
  });

  it("[境界] leg 境界の distance はちょうど 1 つの leg に属する (二重計上なし)、通算タイムも正しく復元される", () => {
    // distance=200 は leg1 の (100,200] に属し、leg2 の (200,300] には属さない
    const original: SplitTimeEntry[] = [
      { id: "x", distance: 200, splitTime: 115.5, displayValue: "" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original, LEG_TIMES);
    const occurrences = saved.flat();
    expect(occurrences).toHaveLength(1); // どこかの leg に 1 回だけ
    // leg1 (legStart=63) に -100 で格納。splitTime も 115.5-63=52.5 (leg 相対値)
    expect(saved[1]).toEqual([{ distance: 100, split_time: 52.5 }]);
    expect(saved[2]).toEqual([]); // leg2 には入らない

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // 全体距離 200 はちょうど 1 件、元の通算タイムのまま復元される
    expect(reloaded.filter((s) => s.distance === 200)).toEqual([
      { distance: 200, splitTime: 115.5 },
    ]);
  });
});

// =============================================================================
// 上の saveSplitsPerLeg は「leg 内距離・leg 相対タイムへの変換」だけを再現しており、
// 実際の保存処理にある validSplitTimes フィルタ (種目距離と同じ distance の split は
// 保存しない) を含んでいない。実データではこのフィルタにより leg 境界スプリットが
// 全て捨てられるため、round-trip は上のテストが示すほど無損失ではない。ここでは
// 保存側をフィルタ込みで再現し、失われた leg 境界が leg タイムから復元されることを検証する。
// =============================================================================
describe("[T-2b] 実際の保存フィルタ込みの round-trip", () => {
  // reloadGlobalDistances が組み立てる leg タイムは LEG_TIMES=[63,68,64,60]
  // (累計 = [63,131,195,255] → legStart = [0,63,131,195])
  const RACE_DISTANCE = 100; // leg の種目 = 100m 自由形

  function saveSplitsPerLegWithGoalFilter(
    relayEventId: RelayEventId,
    legCount: number,
    relaySplits: SplitTimeEntry[],
    legTimes: number[],
  ): Array<{ distance: number; split_time: number }[]> {
    return saveSplitsPerLeg(relayEventId, legCount, relaySplits, legTimes).map((legSplits) =>
      legSplits.filter(
        (st) => st.distance > 0 && st.split_time > 0 && st.distance !== RACE_DISTANCE,
      ),
    );
  }

  it("leg 境界スプリットは DB に残らないが、再ロード時に leg タイムから通算タイムとして復元される", () => {
    const original: SplitTimeEntry[] = [
      { id: "1", distance: 100, splitTime: 57.0, displayValue: "" },
      { id: "2", distance: 200, splitTime: 115.0, displayValue: "" },
      { id: "3", distance: 300, splitTime: 172.0, displayValue: "" },
      { id: "4", distance: 400, splitTime: 228.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLegWithGoalFilter("relay_4x100_free", 4, original, LEG_TIMES);
    // 変換後の leg 内距離が全て 100 (= RACE_DISTANCE) になるため、
    // 「ゴールタイム = split ではない」フィルタで全 leg が捨てられ、DB は空になる
    expect(saved).toEqual([[], [], [], []]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // leg タイム [63,68,64,60] の累計 = [63,131,195,255] として元の値が復元される
    expect(reloaded).toEqual([
      { distance: 100, splitTime: 63 },
      { distance: 200, splitTime: 131 },
      { distance: 300, splitTime: 195 },
      { distance: 400, splitTime: 255 },
    ]);
  });

  it("leg 内中間スプリットは leg 相対値として DB に残り、境界の復元と共存する", () => {
    const original: SplitTimeEntry[] = [
      { id: "a", distance: 50, splitTime: 27.0, displayValue: "" },
      { id: "b", distance: 100, splitTime: 57.0, displayValue: "" },
      { id: "c", distance: 250, splitTime: 144.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLegWithGoalFilter("relay_4x100_free", 4, original, LEG_TIMES);
    // leg0 (legStart=0) の 50m: splitTime 無変換のまま 27.0
    // leg2 (legStart=131) の 250m→leg内50m: splitTime = 144.0-131=13.0 (leg 相対値。
    // 旧バグでは通算値 144.0 のまま DB に書かれていた)
    expect(saved).toEqual([
      [{ distance: 50, split_time: 27.0 }],
      [],
      [{ distance: 50, split_time: 13.0 }],
      [],
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    expect(reloaded.map((s) => s.distance)).toEqual([50, 100, 200, 250, 300, 400]);
    expect(reloaded).toContainEqual({ distance: 50, splitTime: 27.0 });
    // D4 の逆変換 (13.0 + legStart(131) = 144.0) で元の通算タイムに戻る
    expect(reloaded).toContainEqual({ distance: 250, splitTime: 144.0 });
  });
});

// =============================================================================
// [Round-trip invariant] 汎用不変条件: 「保存で通算→leg相対に正規化 → 再読込で
// 逆正規化 → 元の通算値と一致」を、具体的な入力に依存しない形で検証する。
//
// toLegRelativeSplitTime と toCumulativeSplitTime は数学的に厳密な逆変換
// (legStart の加減算のみ、丸めは小数第2位) なので、save と reload で
// 同一の legTimes から算出した legStart を使えば、入力値に関わらず
// 元の通算値へ戻るはず。この不変条件が崩れる典型的なリグレッションは:
//   - legStart の符号を間違える (加算すべきところで減算する等)
//   - save では legStart(leg) を使うが reload では legStart(leg-1) を使う等の
//     オフバイワン
//   - 丸め処理を save/reload の片方だけに入れる
// =============================================================================
describe("[Round-trip invariant] 通算値 → leg相対値 (保存) → 通算値 (再読込) の往復不変条件", () => {
  it.each([
    { label: "全 leg 均等ペース", legTimes: [30.0, 30.0, 30.0, 30.0] },
    { label: "leg ごとにペースが異なる", legTimes: [27.5, 31.2, 24.8, 33.0] },
    { label: "S1 実データ相当 (後続テストの legTimes と同一)", legTimes: [130.0, 134.0, 135.86, 136.54] },
  ])(
    "$label: 各 leg の 50m 地点 (通算値) が保存→再読込で ±0.01 秒以内に復元される",
    ({ legTimes }) => {
      const cumulatives = calcCumulativeTimes(legTimes);
      const legBoundaries = getRelayLegBoundaries("relay_4x200_free");
      // 各 leg の「開始から50m地点」の通算タイムを、leg 自身のタイムから机上計算で作る
      // (leg の平均ペースの 1/4 を 50m 地点の目安タイムとする簡易フィクスチャ)
      const original: SplitTimeEntry[] = legTimes.map((t, idx) => {
        const legStart = idx === 0 ? 0 : cumulatives[idx - 1]!; // cumulatives は legTimes と同じ長さなので idx>=1 の範囲では必ず存在
        const cumulativeAt50m = Math.round((legStart + t / 4) * 100) / 100;
        return {
          id: `leg${idx}-50m`,
          distance: (idx === 0 ? 0 : legBoundaries[idx - 1]!) + 50, // legBoundaries は legCount(4)分の境界を持つ設計なので同上
          splitTime: cumulativeAt50m,
          displayValue: "",
        };
      });

      const saved = saveSplitsPerLeg("relay_4x200_free", 4, original, legTimes);

      // 中間値 (DB 相当) が「通算値のまま」漏れていないことを明示的に確認する。
      // 旧バグでは splitTime が無変換だったため、leg1〜3 の DB 値は元の通算値と一致していた。
      for (let legIdx = 1; legIdx < 4; legIdx++) {
        const legStart = cumulatives[legIdx - 1]!; // cumulatives/original は共に legTimes(4要素) と同じ長さなので legIdx 1..3 の範囲は必ず存在
        const dbEntry = saved[legIdx]![0]; // saved は legCount(4)分の要素を持つ設計なので外側の添字は必ず存在。内側[0]の存在は直後の toBeDefined で検証
        expect(dbEntry).toBeDefined();
        // DB に書かれる値は leg 相対値 (通算値 - legStart) であり、通算値そのものとは異なる
        expect(dbEntry!.split_time).toBeCloseTo(original[legIdx]!.splitTime - legStart, 2);
        if (legStart > 0.01) {
          expect(dbEntry!.split_time).not.toBeCloseTo(original[legIdx]!.splitTime, 2);
        }
      }

      const reloaded = reloadGlobalDistances("relay_4x200_free", saved, legTimes);
      for (const orig of original) {
        const restored = reloaded.find((r) => r.distance === orig.distance);
        expect(restored, `distance=${orig.distance} が再読込結果に見つからない`).toBeDefined();
        expect(restored!.splitTime).toBeCloseTo(orig.splitTime, 2);
      }
    },
  );
});

// =============================================================================
// [S1] スクショ実データ相当の回帰テスト (Sprint Contract Success Criteria S1)
//
// 4x200m フリーリレー・第4泳者 (legIdx=3)。先行3泳者の合計 (legStart) は
// Contract 記載の「leg境界=536.40 (通算) - record.time(136.54) = 399.86」から逆算した。
// legTimes = [130.00, 134.00, 135.86, 136.54] とすると
//   cumulatives = [130.00, 264.00, 399.86, 536.40]
// で legStart(leg3) = cumulatives[2] = 399.86、cumulatives[3] = 536.40 = legStart + record.time
// となり Contract の数値と正確に一致する。
//
// 入力 (通算 split, リレー開始からの通算距離・通算タイム):
//   leg3 の 50m地点(全体650m)=459.86 / 100m地点(全体700m)=493.98 / 150m地点(全体750m)=530.28
// record.time = 136.54 (2:16.54)
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
    // leg3 (legIdx=3) の DB 値: 通算値 - legStart(399.86)
    expect(saved[3]).toEqual([
      { distance: 50, split_time: 60.0 }, // 459.86 - 399.86
      { distance: 100, split_time: 94.12 }, // 493.98 - 399.86
      { distance: 150, split_time: 130.42 }, // 530.28 - 399.86
    ]);
    // 通算値 (459.86等) がそのまま DB に漏れていないことを明示的に確認する
    for (const st of saved[3]!) {  // saved は legCount(4)要素の配列なので index3 は必ず存在
      expect(st.split_time).toBeLessThan(140);
    }
  });

  it("先頭 50m lap は通算値 (459.86 = 7:39.86) ではなくなり、100m/150m lap は現状どおり維持され、" +
    "最終 200m lap は 0.00 でない正の値になり、4 区間の lap 合計が record.time (2:16.54) と ±0.01 秒で一致する " +
    "(apps/web/utils/lapTimeCalculator.ts の calculateRaceLapTimesTable と等価な手計算で検証。" +
    "mobile 側に同名ユーティリティが無いため、DB 復元後の値を使った素朴な差分計算で再現する)",
    () => {
      const saved = saveSplitsPerLeg("relay_4x200_free", 4, originalCumulativeSplits, LEG_TIMES_S1);
      const leg3Splits = saved[3]!; // saved は legCount(4)要素の配列なので index3 は必ず存在

      // 表示側 (RecordSplitTimes.tsx 相当) は raceDistance(200) のゴール split を
      // record.time で補完する。DB の leg 相対値 + ゴール補完値でラップ表を作る。
      const displaySplits = [...leg3Splits, { distance: 200, split_time: RECORD_TIME_LEG3 }].sort(
        (a, b) => a.distance - b.distance,
      );

      // leg3Splits(3件) + ゴール補完1件 = 常に4件の配列なので添字0-3は必ず存在
      const lap50 = displaySplits[0]!.split_time; // 0→50m
      const lap100 = displaySplits[1]!.split_time - displaySplits[0]!.split_time; // 50→100m
      const lap150 = displaySplits[2]!.split_time - displaySplits[1]!.split_time; // 100→150m
      const lap200 = displaySplits[3]!.split_time - displaySplits[2]!.split_time; // 150→200m

      // 先頭ラップは通算値 459.86 ではない (旧バグはここが 459.86 になっていた)
      expect(lap50).not.toBeCloseTo(459.86, 1);
      expect(lap50).toBeCloseTo(60.0, 2);
      // 中間ラップは (Contract記載どおり) 現状の値を維持
      expect(lap100).toBeCloseTo(34.12, 2);
      expect(lap150).toBeCloseTo(36.3, 2);
      // 最終ラップは 0.00 でない正の値
      expect(lap200).toBeGreaterThan(0);
      expect(lap200).toBeCloseTo(6.12, 2);

      // 4 区間の合計が record.time と ±0.01 秒で一致する (テレスコーピングにより
      // legStart の値に関わらず常に成立するが、実装が正しく変換していることの検証として残す)
      const total = lap50 + lap100 + lap150 + lap200;
      expect(Math.abs(total - RECORD_TIME_LEG3)).toBeLessThanOrEqual(0.01);
    });

  it("保存 → 再読込で元の通算 split (650=459.86 / 700=493.98 / 750=530.28) が復元される", () => {
    const saved = saveSplitsPerLeg("relay_4x200_free", 4, originalCumulativeSplits, LEG_TIMES_S1);
    // 他 leg には split が無いので空のまま保存される
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
    // legStart(leg0) は常に 0 なので、leg 相対値 = 通算値そのもの
    expect(saved[0]).toEqual([
      { distance: 50, split_time: 32.5 },
      { distance: 100, split_time: 65.0 },
    ]);
  });
});
