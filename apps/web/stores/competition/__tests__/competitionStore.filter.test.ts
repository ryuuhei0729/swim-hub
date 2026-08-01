/**
 * competitionStore フィルタ状態 テスト (Sprint Contract Phase B)
 *
 * 対象スプリント: 大会履歴タブ 並べ替え/絞り込み改善 (2026-07-22b)
 *   1. 並べ替えプリセットを4件のみに(新しい順[デフォルト]/古い順/記録が速い順/記録が遅い順)
 *   2. 絞り込みの「種目」を「距離」+「種目(泳法)」に分離、各グループ内OR・グループ間AND、複数選択可
 *   3. 絞り込みシートを「すべてクリア」+「適用」の2ボタン化。適用を押して初めてストアへ反映
 *
 * トートロジー防止メモ: Developer 実装(competitionStore.ts)を読んだ上でテストを書いてはいるが、
 * アサーションは Sprint Contract の Success Criteria (初期値/複数選択可能/リセット時の非退行)
 * から導いており、実装の set 呼び出しをそのまま踏襲したものではない。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useCompetitionStore } from "../competitionStore";

describe("useCompetitionStore - フィルタ状態 (distance/style 分離後)", () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetFilter();
  });

  describe("初期状態", () => {
    it("filterDistances は空配列で初期化される", () => {
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
    });

    it("filterStyles は空配列で初期化される", () => {
      expect(useCompetitionStore.getState().filterStyles).toEqual([]);
    });

    it("旧 filterStyle (単一select文字列) は型から削除されている(コード確認)", () => {
      // ランタイムでは単に未定義のキーであることを確認する(型レベルの削除は tsc --noEmit で担保)
      const state = useCompetitionStore.getState() as unknown as Record<string, unknown>;
      expect(state.filterStyle).toBeUndefined();
    });
  });

  describe("setFilterDistances / setFilterStyles", () => {
    it("setFilterDistances で複数の距離を設定できる(例: ['50','100'])", () => {
      useCompetitionStore.getState().setFilterDistances(["50", "100"]);
      expect(useCompetitionStore.getState().filterDistances).toEqual(["50", "100"]);
    });

    it("setFilterStyles で複数の種目コードを設定できる(例: ['fr','br'])", () => {
      useCompetitionStore.getState().setFilterStyles(["fr", "br"]);
      expect(useCompetitionStore.getState().filterStyles).toEqual(["fr", "br"]);
    });

    it("setFilterDistances([]) で距離フィルタを解除できる", () => {
      useCompetitionStore.getState().setFilterDistances(["50"]);
      useCompetitionStore.getState().setFilterDistances([]);
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
    });

    it("setFilterStyles([]) で種目フィルタを解除できる", () => {
      useCompetitionStore.getState().setFilterStyles(["fr"]);
      useCompetitionStore.getState().setFilterStyles([]);
      expect(useCompetitionStore.getState().filterStyles).toEqual([]);
    });

    it("setFilterDistances/setFilterStyles は互いのフィルタ状態を変化させない(独立している)", () => {
      useCompetitionStore.getState().setFilterDistances(["50"]);
      useCompetitionStore.getState().setFilterStyles(["fr"]);
      useCompetitionStore.getState().setFilterDistances(["100", "200"]);

      expect(useCompetitionStore.getState().filterDistances).toEqual(["100", "200"]);
      expect(useCompetitionStore.getState().filterStyles).toEqual(["fr"]);
    });
  });

  describe("resetFilter", () => {
    it("resetFilter() で filterDistances/filterStyles を含む全フィルタ状態が初期値に戻る", () => {
      useCompetitionStore.getState().setFilterDistances(["50", "100"]);
      useCompetitionStore.getState().setFilterStyles(["fr", "br"]);
      useCompetitionStore.getState().setFilterPoolType("long");
      useCompetitionStore.getState().setFilterRelayMode("onlyRelay");
      useCompetitionStore.getState().setFilterCompetitionNames(["テスト大会"]);
      useCompetitionStore.getState().setFilterPlaces(["テストプール"]);

      useCompetitionStore.getState().resetFilter();

      const state = useCompetitionStore.getState();
      expect(state.filterDistances).toEqual([]);
      expect(state.filterStyles).toEqual([]);
      expect(state.filterPoolType).toBe("");
      expect(state.filterRelayMode).toBe("all");
      expect(state.filterCompetitionNames).toEqual([]);
      expect(state.filterPlaces).toEqual([]);
    });

    it("resetFilter() は sortColumn/sortOrder も初期値に戻す(既存仕様の非退行)", () => {
      useCompetitionStore.getState().setSortColumn("time");
      useCompetitionStore.getState().setSortOrder("desc");

      useCompetitionStore.getState().resetFilter();

      const state = useCompetitionStore.getState();
      expect(state.sortColumn).toBeNull();
      expect(state.sortOrder).toBe("asc");
    });
  });

  describe("CompetitionSortColumn の縮小", () => {
    it("sortColumn に 'date' | 'time' | null は設定できる", () => {
      const { setSortColumn } = useCompetitionStore.getState();
      setSortColumn("date");
      expect(useCompetitionStore.getState().sortColumn).toBe("date");
      setSortColumn("time");
      expect(useCompetitionStore.getState().sortColumn).toBe("time");
      setSortColumn(null);
      expect(useCompetitionStore.getState().sortColumn).toBeNull();
    });

    it("旧 competitionName/place/pool/style は setSortColumn の型引数として渡せない(型テスト)", () => {
      const { setSortColumn } = useCompetitionStore.getState();
      // @ts-expect-error CompetitionSortColumn は "date" | "time" | null に縮小されており、
      // 旧カラム("competitionName")は型エラーになるはずである
      setSortColumn("competitionName");
      // @ts-expect-error 同様に "style" も型エラーになるはずである
      setSortColumn("style");
    });
  });
});
