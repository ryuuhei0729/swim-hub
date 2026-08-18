// QA Phase B (T-2): リレー split 距離の round-trip 検証。
// 編集モードでの「ロード(全体距離) → 保存(leg内距離へ変換) → 再ロード(全体距離へ復元)」で
// 距離がずれない (off-by-one / 取り違えが無い) ことを保証する。
//
// 2 つの変換が互いに逆であることを検証する:
//   保存側 (TeamRecordBulkFormScreen handleSubmit): relaySplitTimes(全体距離) を
//     filter(legLow<distance<=legHigh) + (legIdx===0 ? distance : distance-legLow) で leg 内へ。
//   ロード側 (buildStyleEntriesFromExisting Phase2/4): leg 内 split を
//     (distance > legDist ? distance : legOffset + distance) で全体距離へ。
//
// トートロジー回避: 実装をコピーせず、保存側はここで最小再現し、ロード側は本物の
// buildStyleEntriesFromExisting を通す。期待値 (再ロード後の全体距離) は元の入力と一致するはず。
import { describe, it, expect } from "vitest";
import {
  getRelayLegBoundaries,
  RelayEventId,
} from "../teamRecordBulk/relayEvents";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
  SplitTimeEntry,
} from "../teamRecordBulk/buildStyleEntries";

const STYLES = [{ id: 3, name_jp: "100m 自由形" }];

// 保存側変換 (画面 handleSubmit の split 変換ロジックの最小再現)。
// 各 leg に属する split のみを抽出し、leg 内距離へ変換する。
function saveSplitsPerLeg(
  relayEventId: RelayEventId,
  legCount: number,
  relaySplits: SplitTimeEntry[],
): Array<{ distance: number; split_time: number }[]> {
  const legBoundaries = getRelayLegBoundaries(relayEventId);
  const out: Array<{ distance: number; split_time: number }[]> = [];
  for (let legIdx = 0; legIdx < legCount; legIdx++) {
    const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
    const legHigh = legBoundaries[legIdx];
    out.push(
      relaySplits
        .filter((st) => st.distance > legLow && st.distance <= legHigh)
        .map((st) => ({
          distance: legIdx === 0 ? st.distance : st.distance - legLow,
          split_time: st.splitTime,
        })),
    );
  }
  return out;
}

// 保存された leg 内 split から「再ロード用 ExistingRecord 配列」を組み立て、
// buildStyleEntriesFromExisting に通して全体距離へ復元する。
function reloadGlobalDistances(
  relayEventId: RelayEventId,
  savedPerLeg: Array<{ distance: number; split_time: number }[]>,
): { distance: number; splitTime: number }[] {
  // relay_4x100_free の leg style はすべて id=3
  const records: ExistingRecord[] = savedPerLeg.map((legSplits, idx) => ({
    id: `r-${idx}`,
    user_id: `u-${idx}`,
    style_id: 3,
    time: [57, 58, 57, 56][idx],
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

describe("[T-2] リレー split 距離 round-trip (relay_4x100_free)", () => {
  it("全 leg 終端距離 (100,200,300,400) が保存→再ロードで保持される", () => {
    const original: SplitTimeEntry[] = [
      { id: "1", distance: 100, splitTime: 57.0, displayValue: "57.00" },
      { id: "2", distance: 200, splitTime: 115.5, displayValue: "1:55.50" },
      { id: "3", distance: 300, splitTime: 173.3, displayValue: "2:53.30" },
      { id: "4", distance: 400, splitTime: 230.0, displayValue: "3:50.00" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original);
    // 保存値の手計算: leg0=[{100,57}], leg1=[{100,115.5}], leg2=[{100,173.3}], leg3=[{100,230}]
    expect(saved).toEqual([
      [{ distance: 100, split_time: 57.0 }],
      [{ distance: 100, split_time: 115.5 }],
      [{ distance: 100, split_time: 173.3 }],
      [{ distance: 100, split_time: 230.0 }],
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // 再ロードで元の全体距離に戻る
    expect(reloaded.map((s) => s.distance).sort((a, b) => a - b)).toEqual([100, 200, 300, 400]);
    // distance↔time の対応がずれていないこと
    expect(reloaded).toContainEqual({ distance: 100, splitTime: 57.0 });
    expect(reloaded).toContainEqual({ distance: 200, splitTime: 115.5 });
    expect(reloaded).toContainEqual({ distance: 300, splitTime: 173.3 });
    expect(reloaded).toContainEqual({ distance: 400, splitTime: 230.0 });
  });

  it("leg 中間の split (25m刻み) も round-trip で保持される", () => {
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
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original);
    // 手計算: leg0=[50,100], leg1=[50(=150-100),100(=200-100)], leg2=[50,100], leg3=[50,100]
    expect(saved[1]).toEqual([
      { distance: 50, split_time: 86.0 },
      { distance: 100, split_time: 115.5 },
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    expect(reloaded.map((s) => s.distance).sort((a, b) => a - b)).toEqual([
      50, 100, 150, 200, 250, 300, 350, 400,
    ]);
    // 取り違え検出: 各全体距離に正しい time が紐づく
    expect(reloaded).toContainEqual({ distance: 150, splitTime: 86.0 });
    expect(reloaded).toContainEqual({ distance: 250, splitTime: 144.0 });
    expect(reloaded).toContainEqual({ distance: 350, splitTime: 201.0 });
  });

  it("[境界] leg 境界の distance はちょうど 1 つの leg に属する (二重計上なし)", () => {
    // distance=200 は leg1 の (100,200] に属し、leg2 の (200,300] には属さない
    const original: SplitTimeEntry[] = [
      { id: "x", distance: 200, splitTime: 115.5, displayValue: "" },
    ];
    const saved = saveSplitsPerLeg("relay_4x100_free", 4, original);
    const occurrences = saved.flat();
    expect(occurrences).toHaveLength(1); // どこかの leg に 1 回だけ
    expect(saved[1]).toEqual([{ distance: 100, split_time: 115.5 }]); // leg1 に -100 で格納
    expect(saved[2]).toEqual([]); // leg2 には入らない

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // 全体距離 200 はちょうど 1 件、元のタイムのまま復元される
    // (他の距離には leg タイムから復元された leg 境界スプリットが入る)
    expect(reloaded.filter((s) => s.distance === 200)).toEqual([
      { distance: 200, splitTime: 115.5 },
    ]);
  });
});

// =============================================================================
// 上の saveSplitsPerLeg は「leg 内距離への変換」だけを再現しており、実際の保存処理にある
// validSplitTimes フィルタ (種目距離と同じ distance の split は保存しない) を含んでいない。
// 実データではこのフィルタにより leg 境界スプリットが全て捨てられるため、round-trip は
// 上のテストが示すほど無損失ではない。ここでは保存側をフィルタ込みで再現し、
// 失われた leg 境界が leg タイムから復元されることを検証する。
// =============================================================================
describe("[T-2b] 実際の保存フィルタ込みの round-trip", () => {
  // reloadGlobalDistances が組み立てる leg タイムは [57, 58, 57, 56] (累計 = [57,115,172,228])
  const RACE_DISTANCE = 100; // leg の種目 = 100m 自由形

  function saveSplitsPerLegWithGoalFilter(
    relayEventId: RelayEventId,
    legCount: number,
    relaySplits: SplitTimeEntry[],
  ): Array<{ distance: number; split_time: number }[]> {
    return saveSplitsPerLeg(relayEventId, legCount, relaySplits).map((legSplits) =>
      legSplits.filter(
        (st) => st.distance > 0 && st.split_time > 0 && st.distance !== RACE_DISTANCE,
      ),
    );
  }

  it("leg 境界スプリットは DB に残らないが、再ロード時に leg タイムから復元される", () => {
    const original: SplitTimeEntry[] = [
      { id: "1", distance: 100, splitTime: 57.0, displayValue: "" },
      { id: "2", distance: 200, splitTime: 115.0, displayValue: "" },
      { id: "3", distance: 300, splitTime: 172.0, displayValue: "" },
      { id: "4", distance: 400, splitTime: 228.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLegWithGoalFilter("relay_4x100_free", 4, original);
    // 全 leg 境界が「ゴールタイム = split ではない」フィルタで捨てられ、DB は空になる
    expect(saved).toEqual([[], [], [], []]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    // leg タイム [57,58,57,56] の累計 = [57,115,172,228] として元の値が復元される
    expect(reloaded).toEqual([
      { distance: 100, splitTime: 57 },
      { distance: 200, splitTime: 115 },
      { distance: 300, splitTime: 172 },
      { distance: 400, splitTime: 228 },
    ]);
  });

  it("leg 内中間スプリットは DB に残り、境界の復元と共存する", () => {
    const original: SplitTimeEntry[] = [
      { id: "a", distance: 50, splitTime: 27.0, displayValue: "" },
      { id: "b", distance: 100, splitTime: 57.0, displayValue: "" },
      { id: "c", distance: 250, splitTime: 144.0, displayValue: "" },
    ];
    const saved = saveSplitsPerLegWithGoalFilter("relay_4x100_free", 4, original);
    // leg0 の 50m と leg2 の 250m(→50m) だけが残る
    expect(saved).toEqual([
      [{ distance: 50, split_time: 27.0 }],
      [],
      [{ distance: 50, split_time: 144.0 }],
      [],
    ]);

    const reloaded = reloadGlobalDistances("relay_4x100_free", saved);
    expect(reloaded.map((s) => s.distance)).toEqual([50, 100, 200, 250, 300, 400]);
    expect(reloaded).toContainEqual({ distance: 50, splitTime: 27.0 });
    expect(reloaded).toContainEqual({ distance: 250, splitTime: 144.0 });
  });
});
