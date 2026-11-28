/**
 * RecordClient (大会の記録入力) のテスト共通: 既存記録から「開く種目」を決める。
 *
 * 記録入力は「種目一覧 → 種目を選んで入力 → 種目ごとに保存」の組み立てで、
 * RecordClient は selection (URL の ?style= / ?relay=) で入力画面を出す。
 * 1種目ぶんの記録で入力画面を検証するテストは、本物の buildStyleEntriesFromExisting
 * (リレー検出を含む) で既存記録をまとめ、最初の種目を開く。
 * 既存記録が無いときは styles の先頭 (個人種目) を開く。
 */
import {
  buildStyleEntriesFromExisting,
  type ExistingRecord,
  type StyleLookup,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";
import type { RecordEventSelection } from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/recordEventSelection";

export function selectionOfFirstEvent(
  existingRecords: ExistingRecord[],
  styles: StyleLookup[],
): RecordEventSelection {
  const first = buildStyleEntriesFromExisting(existingRecords, styles).find(
    (entry) => entry.styleId !== "",
  );
  if (!first || first.styleId === "") {
    const firstStyle = styles[0];
    if (!firstStyle) throw new Error("styles が空です (テストの前提違反)");
    return { kind: "individual", styleId: firstStyle.id };
  }
  return first.relayEventId
    ? { kind: "relay", relayEventId: first.relayEventId }
    : { kind: "individual", styleId: first.styleId };
}
