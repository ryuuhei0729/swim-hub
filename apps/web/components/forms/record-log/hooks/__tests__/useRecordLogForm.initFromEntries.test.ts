/**
 * useRecordLogForm — entryDataList からの自動初期化フロー テスト
 *
 * エントリータイム誤表示バグの回帰検証の一環。
 * 新規レコード作成時、editData が無く entryDataList がある場合、
 * formDataList[i].styleId は entryDataList[i].styleId と同一種目で生成される
 * (= RecordLogEntry の entryMatchesCurrentStyle ガードが自動生成直後は
 * 常に true になり、従来通りバッジが表示されるための前提条件)。
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { StyleOption } from "@/components/forms/record-log/types";
import { useRecordLogForm } from "@/components/forms/record-log/hooks/useRecordLogForm";

const styles: StyleOption[] = [
  { id: 2, nameJp: "50m自由形", distance: 50 },
  { id: 21, nameJp: "200m個人メドレー", distance: 200 },
];

// NOTE: `formDataList[N]!` を多用する。各テストは直前に `toHaveLength(...)` で件数を確認済み。
describe("useRecordLogForm — entryDataList からの初期化", () => {
  it("[自動生成フロー] entryDataList が複数件あるとき、formDataList[i].styleId は entryDataList[i].styleId と一致する", () => {
    const entryDataList: EntryInfo[] = [
      { styleId: 2, styleName: "50m自由形", entryTime: 30.5 },
      { styleId: 21, styleName: "200m個人メドレー", entryTime: 142.2 },
    ];

    const { result } = renderHook(() =>
      useRecordLogForm({ isOpen: true, editData: null, entryDataList, styles }),
    );

    expect(result.current.formDataList).toHaveLength(2);
    expect(result.current.formDataList[0]!.styleId).toBe("2");
    expect(result.current.formDataList[1]!.styleId).toBe("21");
  });

  it("entryDataList が空の場合はデフォルト種目 (50m自由形) 1件で初期化される", () => {
    const { result } = renderHook(() =>
      useRecordLogForm({ isOpen: true, editData: null, entryDataList: [], styles }),
    );

    expect(result.current.formDataList).toHaveLength(1);
    expect(result.current.formDataList[0]!.styleId).toBe("2");
  });

  it("editData が指定されている場合は entryDataList より editData の styleId が優先される", () => {
    const entryDataList: EntryInfo[] = [{ styleId: 21, styleName: "200m個人メドレー", entryTime: 142.2 }];

    const { result } = renderHook(() =>
      useRecordLogForm({
        isOpen: true,
        editData: { id: "record-1", styleId: 2, time: 30.5 },
        entryDataList,
        styles,
      }),
    );

    expect(result.current.formDataList).toHaveLength(1);
    expect(result.current.formDataList[0]!.styleId).toBe("2");
  });
});
