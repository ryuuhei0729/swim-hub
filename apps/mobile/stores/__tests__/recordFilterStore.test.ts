// =============================================================================
// recordFilterStore.test.ts - 大会記録フィルターストアのユニットテスト
// =============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { useRecordStore } from "../recordStore";

describe("recordFilterStore", () => {
  beforeEach(() => {
    // 各テスト前にストアをリセット
    useRecordStore.getState().reset();
  });

  it("初期状態が正しい", () => {
    const state = useRecordStore.getState();

    expect(state.filterStyleId).toBeNull();
    expect(state.filterFiscalYear).toBe("");
    expect(state.filterPoolType).toBeNull();
    expect(state.sortBy).toBe("date");
    expect(state.sortOrder).toBe("desc");
  });

  it("setFilterStyleIdで種目IDを設定できる", () => {
    const { setFilterStyleId } = useRecordStore.getState();

    setFilterStyleId(1);
    expect(useRecordStore.getState().filterStyleId).toBe(1);

    setFilterStyleId(null);
    expect(useRecordStore.getState().filterStyleId).toBeNull();
  });

  it("setFilterFiscalYearで年度を設定できる", () => {
    const { setFilterFiscalYear } = useRecordStore.getState();

    setFilterFiscalYear("2024");
    expect(useRecordStore.getState().filterFiscalYear).toBe("2024");

    setFilterFiscalYear("");
    expect(useRecordStore.getState().filterFiscalYear).toBe("");
  });

  it("setFilterPoolTypeでプールタイプを設定できる", () => {
    const { setFilterPoolType } = useRecordStore.getState();

    setFilterPoolType(0);
    expect(useRecordStore.getState().filterPoolType).toBe(0);

    setFilterPoolType(1);
    expect(useRecordStore.getState().filterPoolType).toBe(1);

    setFilterPoolType(null);
    expect(useRecordStore.getState().filterPoolType).toBeNull();
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
      setFilterStyleId,
      setFilterFiscalYear,
      setFilterPoolType,
      setSortBy,
      setSortOrder,
      reset,
    } = useRecordStore.getState();

    setFilterStyleId(1);
    setFilterFiscalYear("2024");
    setFilterPoolType(0);
    setSortBy("time");
    setSortOrder("asc");

    reset();

    const state = useRecordStore.getState();
    expect(state.filterStyleId).toBeNull();
    expect(state.filterFiscalYear).toBe("");
    expect(state.filterPoolType).toBeNull();
    expect(state.sortBy).toBe("date");
    expect(state.sortOrder).toBe("desc");
  });
});
