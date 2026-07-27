/**
 * recordFilter テスト (Sprint Contract Phase B)
 *
 * 対象: `utils/recordFilter.ts` (RecordsScreen の純フィルタ/ソートロジック)
 *
 * Sprint Contract 検証観点:
 *   [V-MC-01] 年度フィルタ(filterFiscalYear)に関するロジックが一切存在しない
 *   [V-MC-03/04] distance/style が独立2軸(グループ内OR・グループ間AND)
 *   [V-MC-05] relay フィルタが3状態(all/excludeRelay/onlyRelay)
 *   [V-MC-06/07] competitionName/place フィルタ(multi/OR、place は未設定センチネル対応)
 *   [V-MC-08] date/time の4プリセットソート
 *   [V-MC-13] record.style/competition が null でもクラッシュしない
 *
 * トートロジー防止メモ: filterRecords 内の条件式をそのまま踏襲せず、Sprint Contract の
 * 「グループ内OR・グループ間AND」という抽象的な要求から逆算したケース
 * (距離が一致しても種目が不一致なら除外される、等)を検証する。
 */

import { describe, expect, it } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import {
  filterRecords,
  sortRecords,
  countActiveRecordFilters,
  getParticipatedDistances,
  getParticipatedStyleCodes,
  getParticipatedCompetitionNames,
  getParticipatedPlaces,
  UNSET_PLACE_VALUE,
  type RecordFilterValues,
} from "../recordFilter";

function makeRecord(overrides: Partial<RecordWithDetails> & { id: string }): RecordWithDetails {
  return {
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 1,
    time: 30,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    competition: {
      id: "comp-1",
      user_id: "user-1",
      date: "2026-01-01",
      end_date: null,
      title: "テスト大会",
      place: "テストプール",
      pool_type: 0,
      team_id: null,
      note: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    style: { id: 1, name_jp: "50m自由形", name: "50 Free", style: "fr", distance: 50 },
    split_times: [],
    ...overrides,
  } as unknown as RecordWithDetails;
}

const noFilters: RecordFilterValues = {
  filterDistances: [],
  filterStyles: [],
  filterCompetitionNames: [],
  filterPlaces: [],
  filterPoolType: "",
  filterRelayMode: "all",
};

describe("filterRecords", () => {
  it("[V-MC-01 回帰] RecordFilterValues 型に filterFiscalYear が存在しない(コンパイル時に保証されるため、" +
    "ここでは noFilters が年度キーを持たないことのみ明示する)", () => {
    expect(noFilters).not.toHaveProperty("filterFiscalYear");
  });

  it("フィルタが全て未指定(既定値)の場合、全件を返す", () => {
    const records = [makeRecord({ id: "r1" }), makeRecord({ id: "r2" })];
    expect(filterRecords(records, noFilters)).toHaveLength(2);
  });

  describe("[V-MC-03/04] distance/style 独立2軸(グループ内OR・グループ間AND)", () => {
    const r50fr = makeRecord({ id: "r-50fr", style: { id: 1, name_jp: "50m自由形", name: "50 Free", style: "fr", distance: 50 } });
    const r100fr = makeRecord({ id: "r-100fr", style: { id: 2, name_jp: "100m自由形", name: "100 Free", style: "fr", distance: 100 } });
    const r50br = makeRecord({ id: "r-50br", style: { id: 3, name_jp: "50m平泳ぎ", name: "50 Breast", style: "br", distance: 50 } });

    it("distance=[50] のみ指定すると、距離が一致する記録のみ返る(種目は問わない)", () => {
      const result = filterRecords([r50fr, r100fr, r50br], { ...noFilters, filterDistances: ["50"] });
      expect(result.map((r) => r.id).sort()).toEqual(["r-50br", "r-50fr"]);
    });

    it("style=[fr] のみ指定すると、種目が一致する記録のみ返る(距離は問わない)", () => {
      const result = filterRecords([r50fr, r100fr, r50br], { ...noFilters, filterStyles: ["fr"] });
      expect(result.map((r) => r.id).sort()).toEqual(["r-100fr", "r-50fr"]);
    });

    it("distance=[50] AND style=[fr] を指定すると、両方を満たす記録のみ返る(距離だけ一致するr-50brは除外)", () => {
      const result = filterRecords([r50fr, r100fr, r50br], {
        ...noFilters,
        filterDistances: ["50"],
        filterStyles: ["fr"],
      });
      expect(result.map((r) => r.id)).toEqual(["r-50fr"]);
    });

    it("distance=[50,100] のグループ内は OR (どちらかに一致すれば通過)", () => {
      const result = filterRecords([r50fr, r100fr, r50br], { ...noFilters, filterDistances: ["50", "100"] });
      expect(result).toHaveLength(3);
    });
  });

  describe("[V-MC-13] record.style/competition が null のデータ不整合耐性", () => {
    it("record.style が null の場合、distance/styleフィルタ適用時にクラッシュせず除外される", () => {
      const noStyleRecord = makeRecord({ id: "r-nostyle", style: null as unknown as RecordWithDetails["style"] });
      expect(() =>
        filterRecords([noStyleRecord], { ...noFilters, filterDistances: ["50"] }),
      ).not.toThrow();
      expect(filterRecords([noStyleRecord], { ...noFilters, filterDistances: ["50"] })).toHaveLength(0);
    });

    it("record.style が null でも distance/style フィルタ未指定なら通過する", () => {
      const noStyleRecord = makeRecord({ id: "r-nostyle", style: null as unknown as RecordWithDetails["style"] });
      expect(filterRecords([noStyleRecord], noFilters)).toHaveLength(1);
    });

    it("record.competition が null の場合、competitionName/place フィルタでクラッシュせず除外される", () => {
      const noCompRecord = makeRecord({ id: "r-nocomp", competition: null as unknown as RecordWithDetails["competition"] });
      expect(() =>
        filterRecords([noCompRecord], { ...noFilters, filterCompetitionNames: ["テスト大会"] }),
      ).not.toThrow();
      expect(
        filterRecords([noCompRecord], { ...noFilters, filterCompetitionNames: ["テスト大会"] }),
      ).toHaveLength(0);
    });
  });

  describe("[V-MC-05] relay 3状態フィルタ", () => {
    const relayRecord = makeRecord({ id: "r-relay", is_relaying: true });
    const soloRecord = makeRecord({ id: "r-solo", is_relaying: false });

    it("relayMode='all'(既定)は両方を返す", () => {
      expect(filterRecords([relayRecord, soloRecord], noFilters)).toHaveLength(2);
    });

    it("relayMode='excludeRelay' はリレー記録を除外する", () => {
      const result = filterRecords([relayRecord, soloRecord], { ...noFilters, filterRelayMode: "excludeRelay" });
      expect(result.map((r) => r.id)).toEqual(["r-solo"]);
    });

    it("relayMode='onlyRelay' はリレー記録のみ返す", () => {
      const result = filterRecords([relayRecord, soloRecord], { ...noFilters, filterRelayMode: "onlyRelay" });
      expect(result.map((r) => r.id)).toEqual(["r-relay"]);
    });
  });

  describe("[V-MC-06/07] competitionName/place フィルタ(multi/OR、未設定センチネル対応)", () => {
    it("competitionName フィルタは複数選択でOR一致する", () => {
      const rA = makeRecord({
        id: "r-a",
        competition: { ...makeRecord({ id: "x" }).competition!, title: "春季記録会" },
      });
      const rB = makeRecord({
        id: "r-b",
        competition: { ...makeRecord({ id: "x" }).competition!, title: "夏季記録会" },
      });
      const result = filterRecords([rA, rB], {
        ...noFilters,
        filterCompetitionNames: ["春季記録会", "夏季記録会"],
      });
      expect(result).toHaveLength(2);
    });

    it("place の未設定センチネル(UNSET_PLACE_VALUE)は place=null の記録に一致する", () => {
      const unsetPlaceRecord = makeRecord({
        id: "r-unset",
        competition: { ...makeRecord({ id: "x" }).competition!, place: null },
      });
      const setPlaceRecord = makeRecord({ id: "r-set" });

      const result = filterRecords([unsetPlaceRecord, setPlaceRecord], {
        ...noFilters,
        filterPlaces: [UNSET_PLACE_VALUE],
      });
      expect(result.map((r) => r.id)).toEqual(["r-unset"]);
    });
  });

  describe("プールフィルタ", () => {
    it("filterPoolType='short' は pool_type=0 のみ返す", () => {
      const shortRecord = makeRecord({ id: "r-short", pool_type: 0 });
      const longRecord = makeRecord({ id: "r-long", pool_type: 1 });
      const result = filterRecords([shortRecord, longRecord], { ...noFilters, filterPoolType: "short" });
      expect(result.map((r) => r.id)).toEqual(["r-short"]);
    });
  });
});

describe("sortRecords ([V-MC-08] date/time の4プリセット)", () => {
  it("sortBy='date', order='desc' は大会日の新しい順(既定)", () => {
    const older = makeRecord({ id: "older", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-01-01" } });
    const newer = makeRecord({ id: "newer", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-02-01" } });
    const result = sortRecords([older, newer], "date", "desc");
    expect(result.map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("sortBy='date', order='asc' は大会日の古い順", () => {
    const older = makeRecord({ id: "older", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-01-01" } });
    const newer = makeRecord({ id: "newer", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-02-01" } });
    const result = sortRecords([older, newer], "date", "asc");
    expect(result.map((r) => r.id)).toEqual(["older", "newer"]);
  });

  it("sortBy='time', order='asc' は数値としての秒数比較で速い記録が先(文字列比較ではない)", () => {
    const slow = makeRecord({ id: "slow", time: 83.45 });
    const fast = makeRecord({ id: "fast", time: 9.99 });
    const result = sortRecords([slow, fast], "time", "asc");
    expect(result.map((r) => r.id)).toEqual(["fast", "slow"]);
  });

  it("sortBy='time', order='desc' は遅い記録が先", () => {
    const slow = makeRecord({ id: "slow", time: 83.45 });
    const fast = makeRecord({ id: "fast", time: 9.99 });
    const result = sortRecords([slow, fast], "time", "desc");
    expect(result.map((r) => r.id)).toEqual(["slow", "fast"]);
  });

  describe("[V-SH-03 修正確認] time=0(falsy)は null 扱いとして asc/desc いずれでも末尾固定される", () => {
    // record.time は型上 number だが、web getCompetitionSortValue の `record.time || null`
    // という防御的実装(未登録行の 0 秒を "-" 表示するための falsy 判定)と同じ挙動を
    // mobile 側でも再現している。0 は正当な記録タイムではなく「未登録」を表すため、
    // 昇順で先頭(数値として最小)に来てしまう回帰を防ぐ。
    it("time=0 の記録は昇順でも末尾に固定される(0 が最小値として先頭に来ない)", () => {
      const zeroTime = makeRecord({ id: "zero", time: 0 });
      const normalTime = makeRecord({ id: "normal", time: 45.0 });
      const result = sortRecords([zeroTime, normalTime], "time", "asc");
      expect(result.map((r) => r.id)).toEqual(["normal", "zero"]);
    });

    it("time=0 の記録は降順でも末尾に固定される(sortOrder反転で先頭に来ない)", () => {
      const zeroTime = makeRecord({ id: "zero", time: 0 });
      const normalTime = makeRecord({ id: "normal", time: 45.0 });
      const result = sortRecords([normalTime, zeroTime], "time", "desc");
      expect(result.map((r) => r.id)).toEqual(["normal", "zero"]);
    });
  });

  describe("[V-SH-03 修正確認] 大会日・作成日時とも欠損している記録は asc/desc いずれでも末尾固定される", () => {
    it("competition が無く created_at も空文字の記録は、日付昇順でも末尾に固定される", () => {
      const noDateRecord = makeRecord({
        id: "no-date",
        competition: null as unknown as RecordWithDetails["competition"],
        created_at: "",
      });
      const datedRecord = makeRecord({ id: "dated", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-01-01" } });
      const result = sortRecords([noDateRecord, datedRecord], "date", "asc");
      expect(result.map((r) => r.id)).toEqual(["dated", "no-date"]);
    });

    it("competition が無く created_at も空文字の記録は、日付降順でも末尾に固定される", () => {
      const noDateRecord = makeRecord({
        id: "no-date",
        competition: null as unknown as RecordWithDetails["competition"],
        created_at: "",
      });
      const datedRecord = makeRecord({ id: "dated", competition: { ...makeRecord({ id: "x" }).competition!, date: "2026-01-01" } });
      const result = sortRecords([datedRecord, noDateRecord], "date", "desc");
      expect(result.map((r) => r.id)).toEqual(["dated", "no-date"]);
    });
  });
});

describe("countActiveRecordFilters", () => {
  it("全フィルタ未指定(既定値)は0を返す", () => {
    expect(countActiveRecordFilters(noFilters)).toBe(0);
  });

  it("distance/style/competitionName/place のいずれか1件でも選択されていればグループごとに1カウントする", () => {
    expect(
      countActiveRecordFilters({ ...noFilters, filterDistances: ["50"], filterStyles: ["fr"] }),
    ).toBe(2);
  });

  it("filterRelayMode が 'all' 以外ならカウントされる", () => {
    expect(countActiveRecordFilters({ ...noFilters, filterRelayMode: "excludeRelay" })).toBe(1);
  });
});

describe("選択肢生成関数(distinct)", () => {
  it("getParticipatedDistances は distinct・昇順で返し、style が無い記録はスキップする", () => {
    const r1 = makeRecord({ id: "r1", style: { id: 1, name_jp: "100m自由形", name: "100 Free", style: "fr", distance: 100 } });
    const r2 = makeRecord({ id: "r2", style: { id: 2, name_jp: "50m自由形", name: "50 Free", style: "fr", distance: 50 } });
    const r3 = makeRecord({ id: "r3", style: null as unknown as RecordWithDetails["style"] });
    expect(getParticipatedDistances([r1, r2, r3])).toEqual([50, 100]);
  });

  it("getParticipatedStyleCodes は STYLES 定義順(自由形→平泳ぎ→...)で distinct を返す", () => {
    const rBr = makeRecord({ id: "r-br", style: { id: 1, name_jp: "100m平泳ぎ", name: "100 Breast", style: "br", distance: 100 } });
    const rFr = makeRecord({ id: "r-fr", style: { id: 2, name_jp: "50m自由形", name: "50 Free", style: "fr", distance: 50 } });
    expect(getParticipatedStyleCodes([rBr, rFr])).toEqual(["fr", "br"]);
  });

  it("getParticipatedCompetitionNames は distinct・ロケール順で返す", () => {
    const r1 = makeRecord({ id: "r1", competition: { ...makeRecord({ id: "x" }).competition!, title: "夏季大会" } });
    const r2 = makeRecord({ id: "r2", competition: { ...makeRecord({ id: "x" }).competition!, title: "春季大会" } });
    const names = getParticipatedCompetitionNames([r1, r2], "ja");
    expect(names).toHaveLength(2);
    expect(new Set(names)).toEqual(new Set(["夏季大会", "春季大会"]));
  });

  it("getParticipatedPlaces は place=null 行がある場合 hasUnsetPlace=true を返す", () => {
    const r1 = makeRecord({ id: "r1", competition: { ...makeRecord({ id: "x" }).competition!, place: null } });
    const { places, hasUnsetPlace } = getParticipatedPlaces([r1], "ja");
    expect(places).toEqual([]);
    expect(hasUnsetPlace).toBe(true);
  });
});
