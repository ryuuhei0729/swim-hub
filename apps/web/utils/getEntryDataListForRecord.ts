// =============================================================================
// レコードタブ用 EntryInfo 一覧取得ユーティリティ
// =============================================================================
// NOTE: dashboard (FormModals) と /competition (CompetitionClient) の両方から
// 利用される共通ロジック。dashboard の FormModals.tsx に元々あった
// `getEntryDataListForRecord` をそのまま切り出したもので、挙動は変更していない。
//
// editingData 由来の正しいエントリー一覧を優先し、editingData に情報が無い場合のみ
// createdEntries (Zustand ストアの一時的な値) にフォールバックする。
// createdEntries は複数画面で共有される store の値のため、editingData のガードを
// 通さずに直接使うと、別の大会/別日に登録した stale なエントリーを誤って
// 参照してしまう (無関係な種目のエントリータイムが表示される) 事故につながる。

import type { EntryInfo } from "@apps/shared/types/ui";
import type { EntryWithStyle } from "@/stores/types";

export function getEntryDataListForRecord(
  editingData: unknown,
  createdEntries: EntryWithStyle[],
): EntryInfo[] {
  if (
    editingData &&
    typeof editingData === "object" &&
    "entryDataList" in editingData &&
    Array.isArray((editingData as { entryDataList?: EntryInfo[] }).entryDataList)
  ) {
    return (editingData as { entryDataList: EntryInfo[] }).entryDataList;
  }

  if (
    editingData &&
    typeof editingData === "object" &&
    "editData" in editingData &&
    editingData.editData &&
    typeof editingData.editData === "object"
  ) {
    const editPayload = editingData.editData as { entries?: Array<Record<string, unknown>> };
    if (Array.isArray(editPayload.entries) && editPayload.entries.length > 0) {
      return editPayload.entries.map((entry) => {
        const style =
          entry.style && typeof entry.style === "object" && "name_jp" in entry.style
            ? (entry.style as { name_jp?: string })
            : null;
        return {
          styleId: Number(entry.styleId ?? entry.style_id),
          styleName: style?.name_jp ?? String(entry.styleName ?? ""),
          entryTime:
            typeof entry.entryTime === "number"
              ? entry.entryTime
              : typeof entry.entry_time === "number"
                ? entry.entry_time
                : undefined,
        };
      });
    }
  }

  if (
    editingData &&
    typeof editingData === "object" &&
    "entryData" in editingData &&
    editingData.entryData &&
    typeof editingData.entryData === "object"
  ) {
    const entryData = (editingData as { entryData: EntryInfo }).entryData;
    return [
      {
        styleId: Number(entryData.styleId),
        styleName: entryData.styleName,
        entryTime: entryData.entryTime,
      },
    ];
  }

  if (createdEntries.length > 0) {
    return createdEntries.map((entry) => ({
      styleId: entry.styleId,
      styleName: String(entry.styleName || ""),
      entryTime: entry.entryTime ?? undefined,
    }));
  }

  return [];
}

export default getEntryDataListForRecord;
