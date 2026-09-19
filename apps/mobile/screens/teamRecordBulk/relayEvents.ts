// =============================================================================
// リレー種目定義 — @apps/shared/utils/relayEvents への re-export バリア
// =============================================================================
//
// 実装は `apps/shared/utils/relayEvents.ts` に移設した (唯一の定義元)。
// 以前はこのファイル (214行) と
// `apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/relayEvents.ts`
// (263行) が同じ実装を全複製しており、片方だけ更新されて静かに壊れる状態だった。
// (2ファイルの差はコメント文言と `isMedley` ヘルパーの有無だけで、
//  `getRelayKind()` に置き換えても評価結果は同一だった)
//
// このファイルを削除せず re-export として残す理由:
//   このパスは `./buildStyleEntries.ts` / `../TeamRecordStyleDetailScreen.tsx` と
//   既存テスト5本 (`../__tests__/teamRecordBulk.*`, `../__tests__/teamBulk.saveLogic.test.ts`)
//   からの相対 import 経路であり、記録入力画面の内部モジュール境界として
//   既に定着している。実装が1箇所になった以上、パスの数は二重管理ではない。
//   web も同じ理由で同じ形にしている。
//
// ⚠️ **このバリアは記録入力画面 (とそのテスト) が実際に使うシンボルだけを通す。**
//   `RELAY_KIND_VALUES` / `getRelayKind` / `getRelayLegDistances` /
//   `fromRelayEventId` は消費者が0件なので通していない
//   (種類・距離の分解は `TeamRelayRecordsAPI` と `relayRankingAxis.ts` が
//    shared を直接 import する)。使うものが増えたらそのとき足すこと。
//   全部を機械的に並べると「バリア経由でも取れる」第2の経路が増えるだけで、
//   どのシンボルがこの画面の境界なのかが読めなくなる。
// =============================================================================

export type {
  LabelledRelayEventDef,
  LabelledRelayLeg,
  RelayEventDef,
  RelayEventId,
  RelayLabels,
  RelayLeg,
  SwimStyleKey,
} from "@apps/shared/utils/relayEvents";

export {
  RELAY_EVENTS,
  buildRelayEvents,
  calcCumulativeTimes,
  calcLegTimesFromCumulative,
  detectRelayEventId,
  getLegStartCumulative,
  getRelayLegBoundaries,
  getRelayLegDistance,
  isRelayingForLeg,
  toCumulativeSplitTime,
  toLegRelativeSplitTime,
} from "@apps/shared/utils/relayEvents";
