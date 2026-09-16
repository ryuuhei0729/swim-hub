// =============================================================================
// ベストタイム参照バッジ — @apps/shared/utils/bestTimeForEntry への re-export バリア
// =============================================================================
//
// 実装は `apps/shared/utils/bestTimeForEntry.ts` に移した (唯一の定義元)。
// 以前は web / mobile / RecordLogEntry.tsx の3箇所に同じ優先順位表があった。
//
// このファイルを残す理由: `@/utils/bestTimeForEntry` という import 経路が
// web 側のフォーム群に定着しているため。実装が1箇所になった以上、パスは二重管理ではない。
// =============================================================================

export type {
  BestTimeCandidate,
  BestTimeLabelKey,
  BestTimeResult,
} from "@apps/shared/utils/bestTimeForEntry";
export { getBestTimeForEntry } from "@apps/shared/utils/bestTimeForEntry";
