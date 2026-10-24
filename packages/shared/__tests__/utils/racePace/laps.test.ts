// =============================================================================
// laps.test.ts - 累積split -> lap 変換 と レース検証 (クレンジング)
// =============================================================================
// Phase 0 実測: lap_distance は長水路・短水路とも常に 50 の倍数 (25m splitは存在しない)。
//   100m -> 2本 / 200m -> 4本 / 400m -> 8本 / 1500m -> 30本
//   DSQ (reason_code=2) でも lap_detail が入っている => タイムがあっても除外が必要
// 検証観点:
//   [V-L1] 累積split から lap を ms 誤差なしで差分計算する
//   [V-L2] 入力が距離順でなくてもソートして正しく扱う
//   [V-L3] lap の合計が最終タイムと一致する
//   [V-L4] DSQ/DNS は lap があっても disqualified として除外される
//   [V-L5] LAP欠損・LAP数不一致・負のLAP・合計不一致をそれぞれ別ステータスで検出する
//   [V-L6] valid なレースだけが集計に流れる
// =============================================================================

import { describe, expect, it } from "vitest";
import { splitsToLaps } from "../../../utils/racePace/laps";
import { expectedLapCount, validateRace } from "../../../utils/racePace/validation";

const splits = (pairs: [number, number][]) =>
  pairs.map(([distance, cumulativeTimeMs]) => ({ distance, cumulativeTimeMs }));

describe("splitsToLaps", () => {
  it("[V-L1] 累積 -> lap を差分で計算する", () => {
    // 仕様例: 11.20 / 23.50 / 36.10 / 49.00 -> 11.20 / 12.30 / 12.60 / 12.90
    const laps = splitsToLaps(splits([[25, 11200], [50, 23500], [75, 36100], [100, 49000]]));
    expect(laps.map((l) => l.lapTimeMs)).toEqual([11200, 12300, 12600, 12900]);
    expect(laps.map((l) => l.distance)).toEqual([25, 50, 75, 100]);
    expect(laps.map((l) => l.cumulativeTimeMs)).toEqual([11200, 23500, 36100, 49000]);
  });

  it("[V-L1] Phase 0 実測の長水路100mを再現する", () => {
    const laps = splitsToLaps(splits([[50, 23740], [100, 49520]]));
    expect(laps.map((l) => l.lapTimeMs)).toEqual([23740, 25780]);
  });

  it("[V-L2] 距離順でない入力もソートして扱う", () => {
    const laps = splitsToLaps(splits([[100, 49520], [50, 23740]]));
    expect(laps.map((l) => l.distance)).toEqual([50, 100]);
    expect(laps.map((l) => l.lapTimeMs)).toEqual([23740, 25780]);
  });

  it("[V-L3] lap 合計が最終累積タイムと一致する", () => {
    const laps = splitsToLaps(splits([[50, 26200], [100, 54990], [150, 84370], [200, 114020]]));
    const sum = laps.reduce((a, l) => a + l.lapTimeMs, 0);
    expect(sum).toBe(114020);
  });

  it("空入力は空配列", () => {
    expect(splitsToLaps([])).toEqual([]);
  });
});

describe("expectedLapCount", () => {
  it("splitInterval=50 前提で距離から本数を出す", () => {
    expect(expectedLapCount(100)).toBe(2);
    expect(expectedLapCount(200)).toBe(4);
    expect(expectedLapCount(400)).toBe(8);
    expect(expectedLapCount(1500)).toBe(30);
    expect(expectedLapCount(50)).toBe(1);
  });
});

describe("validateRace", () => {
  const valid = {
    distance: 100,
    finalTimeMs: 49520,
    splits: splits([[50, 23740], [100, 49520]]),
    reasonCode: 0,
  };

  it("[V-L6] 正常レースは valid", () => {
    expect(validateRace(valid).status).toBe("valid");
  });

  it("[V-L4] DSQ は lap が揃っていても disqualified", () => {
    // Phase 0 実測: reason_code=2 (失格) は result_time="" だが lap_detail は4本入っている
    const dsq = {
      distance: 200,
      finalTimeMs: null,
      splits: splits([[50, 29000], [100, 62000], [150, 96000], [200, 130000]]),
      reasonCode: 2,
    };
    expect(validateRace(dsq).status).toBe("disqualified");
  });

  it("[V-L4] DNS/棄権 も disqualified 扱いで除外する", () => {
    expect(validateRace({ ...valid, finalTimeMs: null, reasonCode: 1 }).status).toBe("disqualified");
  });

  it("[V-L5] 最終タイム欠損は invalid_time", () => {
    expect(validateRace({ ...valid, finalTimeMs: null }).status).toBe("invalid_time");
    expect(validateRace({ ...valid, finalTimeMs: 0 }).status).toBe("invalid_time");
  });

  it("[V-L5] LAP が空なら missing_split", () => {
    expect(validateRace({ ...valid, splits: [] }).status).toBe("missing_split");
  });

  it("[V-L5] 距離に対して LAP 数が足りなければ lap_count_mismatch", () => {
    const short = { ...valid, distance: 200, finalTimeMs: 114020, splits: splits([[50, 26200], [100, 54990]]) };
    expect(validateRace(short).status).toBe("lap_count_mismatch");
  });

  it("[V-L5] 負のLAP は negative_lap", () => {
    const back = { ...valid, splits: splits([[50, 26000], [100, 25000]]), finalTimeMs: 25000 };
    expect(validateRace(back).status).toBe("negative_lap");
  });

  it("[V-L5] lap合計と最終タイムが乖離すれば lap_mismatch", () => {
    // 最終 49.52 に対して最終splitが 52.00 (許容差を超える)
    const off = { ...valid, splits: splits([[50, 23740], [100, 52000]]) };
    expect(validateRace(off).status).toBe("lap_mismatch");
  });

  it("[V-L5] 計時誤差レベルのズレ (<=0.05s) は valid のまま許容する", () => {
    const jitter = { ...valid, splits: splits([[50, 23740], [100, 49550]]) };
    expect(validateRace(jitter).status).toBe("valid");
  });

  it("除外理由が確認できるよう reason を返す", () => {
    const r = validateRace({ ...valid, splits: [] });
    expect(r.status).toBe("missing_split");
    expect(r.reason).toBeTruthy();
  });
});

describe("validateRace - 欠測の通過タイムは 0 で返ってくる", () => {
  // 実測 (2026-08-19, 400m個メ): 150m の cumulative が 0 で返り、
  // 150m のラップが -68760ms、200m が +169340ms と2本まとめて壊れる。
  const splits = (pairs: [number, number][]) =>
    pairs.map(([distance, cumulativeTimeMs]) => ({ distance, cumulativeTimeMs }));

  const race400imWithGap = {
    distance: 400,
    finalTimeMs: 350160,
    splits: splits([
      [50, 30640],
      [100, 68760],
      [150, 0], // 欠測
      [200, 169340],
      [250, 218770],
      [300, 269160],
      [350, 309640],
      [400, 350160],
    ]),
    reasonCode: 0,
  };

  it("0 の通過タイムは negative_lap ではなく missing_split と分類する", () => {
    const r = validateRace(race400imWithGap);
    expect(r.status).toBe("missing_split");
    expect(r.reason).toContain("150m");
    expect(r.reason).toContain("欠測");
  });

  it("欠測を含むレースは集計に流れない", () => {
    expect(validateRace(race400imWithGap).status).not.toBe("valid");
  });

  it("本物の負のLAP (欠測ではない逆行) は negative_lap のまま", () => {
    const backwards = {
      distance: 100,
      finalTimeMs: 49520,
      splits: splits([
        [50, 26000],
        [100, 25000],
      ]),
      reasonCode: 0,
    };
    expect(validateRace(backwards).status).toBe("negative_lap");
  });
});
