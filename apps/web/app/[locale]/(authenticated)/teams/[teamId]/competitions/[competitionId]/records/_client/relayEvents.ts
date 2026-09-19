// =============================================================================
// リレー種目定義 — @apps/shared/utils/relayEvents への re-export バリア
// =============================================================================
//
// 実装は `apps/shared/utils/relayEvents.ts` に移設した (唯一の定義元)。
// 以前はこのファイル (263行) と `apps/mobile/screens/teamRecordBulk/relayEvents.ts`
// (214行) が同じ実装を全複製しており、片方だけ更新されて静かに壊れる状態だった。
//
// このファイルを削除せず re-export として残す理由:
//   このパスは `./buildStyleEntries.ts` と `./RecordClient.tsx` からの相対 import
//   経路であり、記録入力画面の内部モジュール境界として既に定着している。
//   実装が1箇所になった以上、パスの数は二重管理ではない。
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

// 再 export するのは **この画面 (`./RecordClient.tsx` / `./buildStyleEntries.ts`) が
// 実際に import しているシンボルだけ**にする。
// `RELAY_KIND_VALUES` / `getRelayKind` / `getRelayLegDistances` / `fromRelayEventId`
// は web からの参照が 0 件なので載せない (`fromRelayEventId` の消費者は
// リレー保存を `TeamRelayRecordsAPI` に集約した時点で shared 側へ移った。
// ランキング軸は `relayRankingAxis.ts` が shared を直接 import している)。
// バリアに未使用エントリを残すと「ここを見れば web が使う API が分かる」という
// このファイルの唯一の価値が失われる。必要になったら足すこと。
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
