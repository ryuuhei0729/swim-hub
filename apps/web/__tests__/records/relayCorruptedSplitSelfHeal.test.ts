/**
 * リレー split_times の通算タイム混入バグ修正 — R1-1 破損データガードの回帰テスト
 * (Sprint Contract 追補 R2 / R2-1: Reviewer がミューテーションで実証した無保護状態への対応)
 *
 * Reviewer 実測: `isRecordSplitTimesCorrupted` を `return false;` に書き換えてガードを
 * 完全に無効化しても web 134 files / 6066 tests が全 green のままだった。つまり
 * このスプリントで最も重要な Critical 修正 (旧破損データの自己修復ロジック) の回帰検知が
 * CI 上ゼロだった。本ファイルは S10/S11 を実装してこの穴を塞ぐ。
 *
 * S10: 旧形式の破損レコード (split_time が通算値のまま = split_time >= record.time) を
 *      buildStyleEntriesFromExisting に食わせたとき、
 *      - toCumulativeSplitTime による +legStart の「第三の誤値」が relaySplitTimes に
 *        現れないこと (厳密一致で assert)
 *      - 当該 leg の破損 split は破棄され、restoreRelayBoundarySplits が record.time から
 *        再生成した境界 split のみが残ること
 * S11: S10 の状態から保存経路 (leg 相対化 + ゴール distance フィルタ) を通すと、DB に
 *      書かれる split_times が正しい leg 相対値になり、再読込しても破損判定に掛からない
 *      (= 自己修復が安定する)。
 *
 * トートロジー回避: buildStyleEntriesFromExisting は実物を呼ぶ。保存側は
 * RecordClient.handleSubmit の分配ロジック (distance フィルタ + leg 相対変換) を
 * 最小再現するが、実装をコピーせず既存の relaySplitLegRelative.roundtrip.test.ts と
 * 同じ「distance 範囲フィルタ + toLegRelativeSplitTime」の組み合わせのみ使う。
 */
import { describe, it, expect } from "vitest";
import {
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
  toCumulativeSplitTime,
  calcCumulativeTimes,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/relayEvents";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";

const STYLES_200 = [{ id: 4, name_jp: "200m 自由形", distance: 200 }];

// NOTE: `memberRecords[1]!` / `legBoundaries[legIdx±1]!` を多用する。4×200リレー固定のテストで
// 4件の memberRecords / legBoundaries を前提にしている。
describe("[S10] 旧形式破損データ (split_time が通算値のまま) の読み取りガード", () => {
  it(
    "PM 提示の具体例 (DB split_time=493.98, legStart=137.00) で、legStart を加算した" +
      "第三の誤値 630.98 が relaySplitTimes に一切現れない",
    () => {
      // legTimes[0]=137.00 → cumulatives[0]=137.00 = legStart(leg1)。
      // leg1 の record.time=134.00 とし、distance<legDist(200) の破損 split
      // (493.98 は 134.00 以上なので破損判定に掛かる) を仕込む。
      const legTimes = [137.0, 134.0, 135.0, 136.0];
      const cumulatives = calcCumulativeTimes(legTimes);
      expect(getLegStartCumulative(cumulatives, 1)).toBe(137.0); // PM 提示の legStart と一致

      const records: ExistingRecord[] = legTimes.map((time, idx) => ({
        id: `r-${idx}`,
        user_id: `u-${idx}`,
        style_id: 4,
        time,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times:
          idx === 1
            ? [{ id: "corrupted-1", distance: 50, split_time: 493.98 }] // distance(50) < legDist(200)
            : [],
        users: { id: `u-${idx}`, name: `S${idx}` },
      }));

      const entry = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
      const splits = entry.relaySplitTimes ?? [];

      // 第三の誤値 (493.98 + 137.00 = 630.98) が一切現れないこと
      const thirdBogusValue = toCumulativeSplitTime(493.98, 137.0);
      expect(thirdBogusValue).toBe(630.98);
      expect(splits.some((s) => s.splitTime === 630.98)).toBe(false);
      expect(splits.every((s) => s.splitTime !== 630.98)).toBe(true);

      // 破損 split (leg1 offset200 + distance50 = 250) は破棄され、
      // 代わりに restoreRelayBoundarySplits が cumulatives[1]=271.00 から
      // 再生成した境界 split (leg1 自身の境界: legBoundaries[1]=400) だけが残る
      const legBoundaries = getRelayLegBoundaries("relay_4x200_free");
      expect(legBoundaries[1]).toBe(400);
      expect(splits.find((s) => s.distance === 250)).toBeUndefined(); // 破損 split は消える
      const boundarySplit = splits.find((s) => s.distance === 400);
      expect(boundarySplit).toBeDefined();
      expect(boundarySplit!.splitTime).toBe(271.0); // cumulatives[1] = 137.00+134.00
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
      split_times: idx === 1 ? [{ id: "ok-1", distance: 50, split_time: 30.0 }] : [], // 30.0 < 134.0 (正常)
      users: { id: `u-${idx}`, name: `S${idx}` },
    }));
    const entry = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
    const splits = entry.relaySplitTimes ?? [];
    // leg1 offset200 + distance50 = 250、splitTime = 30.0 + legStart(137.0) = 167.0
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
    // 破損ガードは relaySplitTimes のみに作用し、memberRecords[1].cumulativeTimeSeconds
    // (record.time ベースの累計) は変わらない
    expect(entry.memberRecords[1]!.cumulativeTimeSeconds).toBe(cumulatives[1]);
    expect(entry.memberRecords[1]!.time).toBe(134.0);
  });
});

describe("[S11] 破損レコードは保存経路を通すと自己修復し、以後破損判定から外れる", () => {
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

      // 1回目のロード (破損状態): 破損 split (250) は消え、4 leg 分の境界 split
      // (200/400/600/800、record.time の累計から再生成) だけが残る。leg1 自身の境界は 400。
      const loaded = buildStyleEntriesFromExisting(records, STYLES_200).find((e) => e.relayEventId)!;
      const relaySplitTimes = loaded.relaySplitTimes ?? [];
      expect(relaySplitTimes.map((s) => s.distance)).toEqual([200, 400, 600, 800]);
      expect(relaySplitTimes.find((s) => s.distance === 250)).toBeUndefined(); // 破損split消滅
      expect(relaySplitTimes.find((s) => s.distance === 400)).toEqual(
        expect.objectContaining({ distance: 400, splitTime: 271.0 }),
      );

      // 保存経路の最小再現 (RecordClient.handleSubmit の leg 分配 + D3 のゴール distance
      // フィルタ `!(raceDistance && st.distance === raceDistance)` と同じ判定)。
      const legBoundaries = getRelayLegBoundaries("relay_4x200_free");
      const RACE_DISTANCE = 200; // leg1 の種目 (200m 自由形) の距離
      const legIdx = 1;
      const legLow = legBoundaries[legIdx - 1]!; // 200
      const legHigh = legBoundaries[legIdx]!; // 400
      const legStart = getLegStartCumulative(cumulatives, legIdx);
      const savedForLeg1 = relaySplitTimes
        .filter((st) => st.distance > legLow && st.distance <= legHigh)
        .map((st) => ({
          distance: st.distance - legLow,
          split_time: toLegRelativeSplitTime(st.splitTime, legStart),
        }))
        // D3 のゴール distance フィルタ (distance === raceDistance の split は保存しない)
        .filter((st) => st.distance !== RACE_DISTANCE && st.distance > 0 && st.split_time > 0);

      // 唯一残っていた split (境界 400 → local 200 = legDist = raceDistance) はゴールフィルタで
      // 除去され、DB へ書かれる split_times は空になる (自己修復の結果、破損データも
      // 正常データも同じ空集合に収束する)
      expect(savedForLeg1).toEqual([]);

      // 再読込 (自己修復後): split_times が空なので isRecordSplitTimesCorrupted の
      // チェック対象 (distance<legDist の値の配列) も空 → 破損判定には絶対に掛からない
      const healedRecords: ExistingRecord[] = legTimes.map((time, idx) => ({
        id: `r-${idx}`,
        user_id: `u-${idx}`,
        style_id: 4,
        time,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times: idx === legIdx ? savedForLeg1.map((s, j) => ({ id: `h-${j}`, distance: s.distance, split_time: s.split_time })) : [],
        users: { id: `u-${idx}`, name: `S${idx}` },
      }));
      const reloaded = buildStyleEntriesFromExisting(healedRecords, STYLES_200).find((e) => e.relayEventId)!;
      const reloadedSplits = reloaded.relaySplitTimes ?? [];
      // 破損時と全く同じ4境界 (200/400/600/800) が復元され、leg1 自身の境界 (400→271.0) の
      // 値も不変 (安定した自己修復状態。以後保存し直しても同じ結果に収束する)
      expect(reloadedSplits.map((s) => s.distance)).toEqual([200, 400, 600, 800]);
      expect(reloadedSplits.find((s) => s.distance === 400)).toEqual(
        expect.objectContaining({ distance: 400, splitTime: 271.0 }),
      );
      // 630.98 のような誤値は当然存在しない
      expect(reloadedSplits.every((s) => s.splitTime !== 630.98)).toBe(true);
    },
  );
});
