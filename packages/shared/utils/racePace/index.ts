// =============================================================================
// racePace - 目標タイムから理想LAPを算出する共有ドメインロジック
// =============================================================================
// web / mobile / result-of-swimming パイプラインが共用する。
// ここには I/O を置かない (純粋関数のみ)。
// =============================================================================
export * from "./types";
export * from "./time";
export * from "./laps";
export * from "./validation";
export * from "./stats";
export * from "./ratios";
export * from "./buckets";
export * from "./targetLaps";
export * from "./resolve";
