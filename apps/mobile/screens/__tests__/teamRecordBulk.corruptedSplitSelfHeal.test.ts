/**
 * リレー split_times の通算タイム混入バグ修正 — R1-1 破損データガードの回帰テスト (mobile 移植版)
 * (Sprint Contract 追補 R2 / R2-1: Reviewer がミューテーションで実証した無保護状態への対応)
 *
 * Web 正準 (apps/web/__tests__/records/relayCorruptedSplitSelfHeal.test.ts) と同一の
 * 数値・シナリオで mobile 移植 (buildStyleEntries.ts) を検証する。
 *
 * S10: 旧形式の破損レコード (split_time が通算値のまま = split_time >= record.time) を
 *      buildStyleEntriesFromExisting に食わせたとき、+legStart の第三の誤値が現れず、
 *      restoreRelayBoundarySplits が record.time から再生成した境界 split のみが残ること。
 * S11: S10 の状態から保存経路 (leg 分配 + leg 相対化 + ゴール distance フィルタ) を通すと、
 *      DB に書かれる split_times が正しい leg 相対値になり (この場合は空になる)、
 *      再読込しても破損判定に掛からないこと (自己修復)。
 */
import { describe, it, expect } from "vitest";
import {
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
  toCumulativeSplitTime,
  calcCumulativeTimes,
} from "../teamRecordBulk/relayEvents";
import { buildStyleEntriesFromExisting, ExistingRecord } from "../teamRecordBulk/buildStyleEntries";

const STYLES_200 = [{ id: 4, name_jp: "200m 自由形" }];

describe("[mobile][S10] 旧形式破損データ (split_time が通算値のまま) の読み取りガード", () => {
  it(
    "PM 提示の具体例 (DB split_time=493.98, legStart=137.00) で、legStart を加算した" +
      "第三の誤値 630.98 が relaySplitTimes に一切現れない",
    () => {
      const legTimes = [137.0, 134.0, 135.0, 136.0];
      const cumulatives = calcCumulativeTimes(legTimes);
      expect(getLegStartCumulative(cumulatives, 1)).toBe(137.0);

      const records: ExistingRecord[] = legTimes.map((time, idx) => ({
        id: `r-${idx}`,
        user_id: `u-${idx}`,
        style_id: 4,
        time,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times:
          idx === 1 ? [{ id: "corrupted-1", distance: 50, split_time: 493.98 }] : [],
        users: { id: `u-${idx}`, name: `S${idx}` },
      }));

      const entry = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
      const splits = entry.relaySplitTimes ?? [];

      const thirdBogusValue = toCumulativeSplitTime(493.98, 137.0);
      expect(thirdBogusValue).toBe(630.98);
      expect(splits.some((s) => s.splitTime === 630.98)).toBe(false);
      expect(splits.every((s) => s.splitTime !== 630.98)).toBe(true);

      const legBoundaries = getRelayLegBoundaries("relay_4x200_free");
      expect(legBoundaries[1]).toBe(400);
      expect(splits.find((s) => s.distance === 250)).toBeUndefined();
      const boundarySplit = splits.find((s) => s.distance === 400);
      expect(boundarySplit).toBeDefined();
      expect(boundarySplit!.splitTime).toBe(271.0);
    },
  );

  it("破損していない leg (distance<legDist の split がすべて record.time 未満) は正常に leg 相対変換される", () => {
    const legTimes = [137.0, 134.0, 135.0, 136.0];
    const records: ExistingRecord[] = legTimes.map((time, idx) => ({
      id: `r-${idx}`,
      user_id: `u-${idx}`,
      style_id: 4,
      time,
      is_relaying: idx !== 0,
      reaction_time: null,
      note: null,
      split_times: idx === 1 ? [{ id: "ok-1", distance: 50, split_time: 30.0 }] : [],
      users: { id: `u-${idx}`, name: `S${idx}` },
    }));
    const entry = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
    const splits = entry.relaySplitTimes ?? [];
    expect(splits.find((s) => s.distance === 250)).toEqual(
      expect.objectContaining({ distance: 250, splitTime: 167.0 }),
    );
  });

  it("破損した leg の record.time (ゴールタイム自体) は影響を受けない — S4相当の副作用なしの確認", () => {
    const legTimes = [137.0, 134.0, 135.0, 136.0];
    const cumulatives = calcCumulativeTimes(legTimes);
    const records: ExistingRecord[] = legTimes.map((time, idx) => ({
      id: `r-${idx}`,
      user_id: `u-${idx}`,
      style_id: 4,
      time,
      is_relaying: idx !== 0,
      reaction_time: null,
      note: null,
      split_times: idx === 1 ? [{ id: "corrupted-1", distance: 50, split_time: 493.98 }] : [],
      users: { id: `u-${idx}`, name: `S${idx}` },
    }));
    const entry = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
    expect(entry.memberRecords[1].cumulativeTimeSeconds).toBe(cumulatives[1]);
    expect(entry.memberRecords[1].time).toBe(134.0);
  });
});

describe("[mobile][S11] 破損レコードは保存経路を通すと自己修復し、以後破損判定から外れる", () => {
  it(
    "S10 の破損状態の relaySplitTimes を保存経路 (leg 分配 + leg 相対化 + ゴール distance " +
      "フィルタ) に通すと、DB へ書かれる split_times が leg 相対値になり、再読込後は" +
      "isRecordSplitTimesCorrupted の対象(distance<legDist)が空になる",
    () => {
      const legTimes = [137.0, 134.0, 135.0, 136.0];
      const cumulatives = calcCumulativeTimes(legTimes);
      const records: ExistingRecord[] = legTimes.map((time, idx) => ({
        id: `r-${idx}`,
        user_id: `u-${idx}`,
        style_id: 4,
        time,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times: idx === 1 ? [{ id: "corrupted-1", distance: 50, split_time: 493.98 }] : [],
        users: { id: `u-${idx}`, name: `S${idx}` },
      }));

      const loaded = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
      const relaySplitTimes = loaded.relaySplitTimes ?? [];
      expect(relaySplitTimes.map((s) => s.distance)).toEqual([200, 400, 600, 800]);
      expect(relaySplitTimes.find((s) => s.distance === 250)).toBeUndefined();
      expect(relaySplitTimes.find((s) => s.distance === 400)).toEqual(
        expect.objectContaining({ distance: 400, splitTime: 271.0 }),
      );

      // 保存経路の最小再現 (TeamRecordBulkFormScreen.handleSubmit の leg 分配 + D3 の
      // ゴール distance フィルタ `!(raceDistance && st.distance === raceDistance)` と同じ判定)。
      const legBoundaries = getRelayLegBoundaries("relay_4x200_free");
      const RACE_DISTANCE = 200; // leg1 の種目 (200m 自由形) の距離
      const legIdx = 1;
      const legLow = legBoundaries[legIdx - 1]; // 200
      const legHigh = legBoundaries[legIdx]; // 400
      const legStart = getLegStartCumulative(cumulatives, legIdx);
      const savedForLeg1 = relaySplitTimes
        .filter((st) => st.distance > legLow && st.distance <= legHigh)
        .map((st) => ({
          distance: st.distance - legLow,
          split_time: toLegRelativeSplitTime(st.splitTime, legStart),
        }))
        .filter((st) => st.distance !== RACE_DISTANCE && st.distance > 0 && st.split_time > 0);

      expect(savedForLeg1).toEqual([]);

      const healedRecords: ExistingRecord[] = legTimes.map((time, idx) => ({
        id: `r-${idx}`,
        user_id: `u-${idx}`,
        style_id: 4,
        time,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times:
          idx === legIdx
            ? savedForLeg1.map((s, j) => ({ id: `h-${j}`, distance: s.distance, split_time: s.split_time }))
            : [],
        users: { id: `u-${idx}`, name: `S${idx}` },
      }));
      const reloaded = buildStyleEntriesFromExisting(healedRecords, STYLES_200).find((e) => e.relayEventId)!;
      const reloadedSplits = reloaded.relaySplitTimes ?? [];
      expect(reloadedSplits.map((s) => s.distance)).toEqual([200, 400, 600, 800]);
      expect(reloadedSplits.find((s) => s.distance === 400)).toEqual(
        expect.objectContaining({ distance: 400, splitTime: 271.0 }),
      );
      expect(reloadedSplits.every((s) => s.splitTime !== 630.98)).toBe(true);
    },
  );
});
