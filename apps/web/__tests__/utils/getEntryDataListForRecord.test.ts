/**
 * getEntryDataListForRecord テスト
 *
 * dashboard (FormModals) と /competition (CompetitionClient) の両方が
 * CompetitionTabModal の existingEntries に渡す EntryInfo[] を組み立てる純関数。
 * エントリータイム誤表示バグの回帰検証の一環:
 * editingData 由来の情報を優先し、editingData に何も無い場合のみ
 * createdEntries (複数画面で共有される store の一時値、stale な可能性がある) に
 * フォールバックすることを検証する。
 */

import { describe, expect, it } from "vitest";
import type { EntryWithStyle } from "@/stores/types";
import { getEntryDataListForRecord } from "@/utils/getEntryDataListForRecord";

const makeCreatedEntries = (): EntryWithStyle[] => [
  {
    id: "entry-stale-1",
    competitionId: "other-competition",
    userId: "user-1",
    styleId: 21,
    entryTime: 142.2,
    note: null,
    styleName: "200m個人メドレー",
  },
];

describe("getEntryDataListForRecord", () => {
  it("editingData.entryDataList があればそれを最優先で返す (createdEntries は無視)", () => {
    const editingData = {
      entryDataList: [{ styleId: 2, styleName: "50m自由形", entryTime: 30.5 }],
    };

    const result = getEntryDataListForRecord(editingData, makeCreatedEntries());

    expect(result).toEqual([{ styleId: 2, styleName: "50m自由形", entryTime: 30.5 }]);
  });

  it("editingData.editData.entries があればそれを使う (entryDataList が無い場合)", () => {
    const editingData = {
      editData: {
        entries: [{ styleId: "2", styleName: "50m自由形", entryTime: 30.5 }],
      },
    };

    const result = getEntryDataListForRecord(editingData, makeCreatedEntries());

    expect(result).toEqual([{ styleId: 2, styleName: "50m自由形", entryTime: 30.5 }]);
  });

  it("editingData.editData.entries の style.name_jp が優先して styleName に使われる", () => {
    const editingData = {
      editData: {
        entries: [
          {
            styleId: "2",
            styleName: "無視されるはずの値",
            style: { name_jp: "50m自由形" },
            entryTime: 30.5,
          },
        ],
      },
    };

    const result = getEntryDataListForRecord(editingData, []);

    expect(result).toEqual([{ styleId: 2, styleName: "50m自由形", entryTime: 30.5 }]);
  });

  it("editingData.entryData (単一) があればそれを1件配列で返す", () => {
    const editingData = {
      entryData: { styleId: 2, styleName: "50m自由形", entryTime: 30.5 },
    };

    const result = getEntryDataListForRecord(editingData, makeCreatedEntries());

    expect(result).toEqual([{ styleId: 2, styleName: "50m自由形", entryTime: 30.5 }]);
  });

  it("editingData に何も情報が無い場合のみ createdEntries にフォールバックする", () => {
    const result = getEntryDataListForRecord(null, makeCreatedEntries());

    expect(result).toEqual([
      { styleId: 21, styleName: "200m個人メドレー", entryTime: 142.2 },
    ]);
  });

  it("editingData が空オブジェクトの場合も createdEntries にフォールバックする", () => {
    const result = getEntryDataListForRecord({}, makeCreatedEntries());

    expect(result).toEqual([
      { styleId: 21, styleName: "200m個人メドレー", entryTime: 142.2 },
    ]);
  });

  it("editingData も createdEntries も空の場合は空配列を返す", () => {
    expect(getEntryDataListForRecord(null, [])).toEqual([]);
    expect(getEntryDataListForRecord(undefined, [])).toEqual([]);
    expect(getEntryDataListForRecord({}, [])).toEqual([]);
  });

  it("createdEntries の entryTime が null の場合は undefined に変換される", () => {
    const createdEntries: EntryWithStyle[] = [
      {
        id: "entry-1",
        competitionId: "comp-1",
        userId: "user-1",
        styleId: 2,
        entryTime: null,
        note: null,
        styleName: "50m自由形",
      },
    ];

    const result = getEntryDataListForRecord(null, createdEntries);

    expect(result).toEqual([{ styleId: 2, styleName: "50m自由形", entryTime: undefined }]);
  });
});
