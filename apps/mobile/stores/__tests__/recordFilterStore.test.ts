// =============================================================================
// recordFilterStore.test.ts - 大会記録フィルターストアのユニットテスト
// =============================================================================
// 2026-07-23: 大会記録一覧のソート/フィルターをボトムシートUIに刷新するスプリント契約に
// 伴い、filterStyleId/filterFiscalYear/filterPoolType(number)/includeRelay を廃止し
// filterDistances/filterStyles/filterCompetitionNames/filterPlaces/filterPoolType(string)/
// filterRelayMode に置き換えたため、テスト対象のフィールド名をストアの新API に追随させた
// (振る舞いの意図=初期状態/setter/resetの検証は変更していない)。
//
// QA 追記(Phase B): App Developer によるリライトは新API のsetter/初期値/resetのみを
// 検証しており、「V-MC-01: 年度フィルタ(filterFiscalYear)が完全に削除されている」という
// Sprint Contract の削除要件そのものを直接検証するテストが無かった(新フィールドが
// 存在することの確認だけでは、旧フィールドが実行時に残存していても緑になってしまう)。
// 型定義上は tsc が担保するが、ランタイムでも明示的に「廃止フィールドが state 上に
// 存在しない」ことをアサートする describe を追加する。

import { beforeEach, describe, expect, it } from "vitest";
import { useRecordStore } from "../recordStore";

describe("recordFilterStore", () => {
  beforeEach(() => {
    // 各テスト前にストアをリセット
    useRecordStore.getState().reset();
  });

  describe("[V-MC-01 回帰] 廃止フィールドがランタイムにも存在しない", () => {
    it("state に filterFiscalYear が存在しない(年度フィルタ完全削除)", () => {
      const state = useRecordStore.getState();
      expect(state).not.toHaveProperty("filterFiscalYear");
    });

    it("state に filterStyleId(旧・単一select種目フィルタ)が存在しない", () => {
      const state = useRecordStore.getState();
      expect(state).not.toHaveProperty("filterStyleId");
    });

    it("state に includeRelay(旧・2値トグル)が存在しない", () => {
      const state = useRecordStore.getState();
      expect(state).not.toHaveProperty("includeRelay");
    });

    it("state に setFilterFiscalYear/setFilterStyleId/setIncludeRelay アクションが存在しない", () => {
      const state = useRecordStore.getState() as unknown as Record<string, unknown>;
      expect(state.setFilterFiscalYear).toBeUndefined();
      expect(state.setFilterStyleId).toBeUndefined();
      expect(state.setIncludeRelay).toBeUndefined();
    });
  });

  it("初期状態が正しい", () => {
    const state = useRecordStore.getState();

    expect(state.filterDistances).toEqual([]);
    expect(state.filterStyles).toEqual([]);
    expect(state.filterCompetitionNames).toEqual([]);
    expect(state.filterPlaces).toEqual([]);
    expect(state.filterPoolType).toBe("");
    expect(state.filterRelayMode).toBe("all");
    expect(state.sortBy).toBe("date");
    expect(state.sortOrder).toBe("desc");
  });

  it("setFilterDistancesで距離フィルタを設定できる", () => {
    const { setFilterDistances } = useRecordStore.getState();

    setFilterDistances(["50", "100"]);
    expect(useRecordStore.getState().filterDistances).toEqual(["50", "100"]);

    setFilterDistances([]);
    expect(useRecordStore.getState().filterDistances).toEqual([]);
  });

  it("setFilterStylesで種目(泳法)フィルタを設定できる", () => {
    const { setFilterStyles } = useRecordStore.getState();

    setFilterStyles(["fr", "br"]);
    expect(useRecordStore.getState().filterStyles).toEqual(["fr", "br"]);

    setFilterStyles([]);
    expect(useRecordStore.getState().filterStyles).toEqual([]);
  });

  it("setFilterCompetitionNamesで大会名フィルタを設定できる", () => {
    const { setFilterCompetitionNames } = useRecordStore.getState();

    setFilterCompetitionNames(["春季記録会"]);
    expect(useRecordStore.getState().filterCompetitionNames).toEqual(["春季記録会"]);

    setFilterCompetitionNames([]);
    expect(useRecordStore.getState().filterCompetitionNames).toEqual([]);
  });

  it("setFilterPlacesで場所フィルタを設定できる(未設定センチネル\"\"を含む)", () => {
    const { setFilterPlaces } = useRecordStore.getState();

    setFilterPlaces(["", "東京辰巳国際水泳場"]);
    expect(useRecordStore.getState().filterPlaces).toEqual(["", "東京辰巳国際水泳場"]);

    setFilterPlaces([]);
    expect(useRecordStore.getState().filterPlaces).toEqual([]);
  });

  it("setFilterPoolTypeでプールタイプを設定できる", () => {
    const { setFilterPoolType } = useRecordStore.getState();

    setFilterPoolType("short");
    expect(useRecordStore.getState().filterPoolType).toBe("short");

    setFilterPoolType("long");
    expect(useRecordStore.getState().filterPoolType).toBe("long");

    setFilterPoolType("");
    expect(useRecordStore.getState().filterPoolType).toBe("");
  });

  it("setFilterRelayModeでリレーフィルタを設定できる", () => {
    const { setFilterRelayMode } = useRecordStore.getState();

    setFilterRelayMode("excludeRelay");
    expect(useRecordStore.getState().filterRelayMode).toBe("excludeRelay");

    setFilterRelayMode("onlyRelay");
    expect(useRecordStore.getState().filterRelayMode).toBe("onlyRelay");

    setFilterRelayMode("all");
    expect(useRecordStore.getState().filterRelayMode).toBe("all");
  });

  it("setSortByでソート基準を設定できる", () => {
    const { setSortBy } = useRecordStore.getState();

    setSortBy("date");
    expect(useRecordStore.getState().sortBy).toBe("date");

    setSortBy("time");
    expect(useRecordStore.getState().sortBy).toBe("time");
  });

  it("setSortOrderでソート順を設定できる", () => {
    const { setSortOrder } = useRecordStore.getState();

    setSortOrder("asc");
    expect(useRecordStore.getState().sortOrder).toBe("asc");

    setSortOrder("desc");
    expect(useRecordStore.getState().sortOrder).toBe("desc");
  });

  it("resetでストアをリセットできる", () => {
    const {
      setFilterDistances,
      setFilterStyles,
      setFilterCompetitionNames,
      setFilterPlaces,
      setFilterPoolType,
      setFilterRelayMode,
      setSortBy,
      setSortOrder,
      reset,
    } = useRecordStore.getState();

    setFilterDistances(["50"]);
    setFilterStyles(["fr"]);
    setFilterCompetitionNames(["春季記録会"]);
    setFilterPlaces(["東京辰巳国際水泳場"]);
    setFilterPoolType("short");
    setFilterRelayMode("excludeRelay");
    setSortBy("time");
    setSortOrder("asc");

    reset();

    const state = useRecordStore.getState();
    expect(state.filterDistances).toEqual([]);
    expect(state.filterStyles).toEqual([]);
    expect(state.filterCompetitionNames).toEqual([]);
    expect(state.filterPlaces).toEqual([]);
    expect(state.filterPoolType).toBe("");
    expect(state.filterRelayMode).toBe("all");
    expect(state.sortBy).toBe("date");
    expect(state.sortOrder).toBe("desc");
  });
});
