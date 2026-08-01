// =============================================================================
// practiceFilterStore.test.ts - 練習フィルター/ソートストアのユニットテスト
// =============================================================================
// Sprint Contract 検証観点:
//   [V-MP-03/04/06] place/style/sortColumn/sortOrder が新設されている
//   [V-MP-07] draft/apply はスクリーン側の責務(このストア自体は「適用済み」の値のみ保持する
//     ため、ここでは初期値/setter/reset の非退行のみを検証する)

import { beforeEach, describe, expect, it } from "vitest";
import { usePracticeFilterStore } from "../practiceFilterStore";

describe("practiceFilterStore", () => {
  beforeEach(() => {
    usePracticeFilterStore.getState().reset();
  });

  it("初期状態が正しい(selectedTagIds/filterPlaces=空配列、filterStyle=空文字、sortColumn=null、sortOrder='desc')", () => {
    const state = usePracticeFilterStore.getState();
    expect(state.selectedTagIds).toEqual([]);
    expect(state.filterPlaces).toEqual([]);
    expect(state.filterStyle).toBe("");
    expect(state.sortColumn).toBeNull();
    expect(state.sortOrder).toBe("desc");
  });

  it("setSelectedTagsでタグID配列を設定できる", () => {
    usePracticeFilterStore.getState().setSelectedTags(["tag-a", "tag-b"]);
    expect(usePracticeFilterStore.getState().selectedTagIds).toEqual(["tag-a", "tag-b"]);
  });

  it("[V-MP-03] setFilterPlacesで場所フィルタ(複数)を設定できる", () => {
    usePracticeFilterStore.getState().setFilterPlaces(["プールA", "プールB"]);
    expect(usePracticeFilterStore.getState().filterPlaces).toEqual(["プールA", "プールB"]);

    usePracticeFilterStore.getState().setFilterPlaces([]);
    expect(usePracticeFilterStore.getState().filterPlaces).toEqual([]);
  });

  it("[V-MP-04] setFilterStyleで種目(単一)フィルタを設定できる", () => {
    usePracticeFilterStore.getState().setFilterStyle("fr");
    expect(usePracticeFilterStore.getState().filterStyle).toBe("fr");

    usePracticeFilterStore.getState().setFilterStyle("");
    expect(usePracticeFilterStore.getState().filterStyle).toBe("");
  });

  it("[V-MP-06] setSortColumn/setSortOrderでソート状態を設定できる", () => {
    usePracticeFilterStore.getState().setSortColumn("place");
    usePracticeFilterStore.getState().setSortOrder("asc");
    expect(usePracticeFilterStore.getState().sortColumn).toBe("place");
    expect(usePracticeFilterStore.getState().sortOrder).toBe("asc");

    usePracticeFilterStore.getState().setSortColumn(null);
    expect(usePracticeFilterStore.getState().sortColumn).toBeNull();
  });

  it("resetで全項目(タグ/場所/種目/ソート)が初期値に戻る", () => {
    const store = usePracticeFilterStore.getState();
    store.setSelectedTags(["tag-a"]);
    store.setFilterPlaces(["プールA"]);
    store.setFilterStyle("fr");
    store.setSortColumn("date");
    store.setSortOrder("asc");

    usePracticeFilterStore.getState().reset();

    const state = usePracticeFilterStore.getState();
    expect(state.selectedTagIds).toEqual([]);
    expect(state.filterPlaces).toEqual([]);
    expect(state.filterStyle).toBe("");
    expect(state.sortColumn).toBeNull();
    expect(state.sortOrder).toBe("desc");
  });
});
