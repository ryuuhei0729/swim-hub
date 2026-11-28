// =============================================================================
// 大会記録の代理入力 - 「どの種目を開いているか」の表現
// =============================================================================
//
// mobile は種目カードの一覧 (TeamRecordStyleListScreen) から種目詳細画面
// (TeamRecordStyleDetailScreen) へ styleId / relayEventId を渡して遷移する。
// web は同じ情報をクエリパラメータで持つ:
//   - 一覧:       /teams/{teamId}/competitions/{competitionId}/records
//   - 個人種目:   ...records?style={styles.id}
//   - リレー種目: ...records?relay={RelayEventId}
// URL で持つので、ブラウザの戻る操作・再読み込み・直リンクでも同じ種目が開く。
// ページ (Server Component) で解釈してから props で渡すため、このファイルには
// 'use client' を付けない (サーバーとクライアントの両方から import される)。

import { RELAY_EVENTS, type RelayEventId } from "./relayEvents";
import type { StyleEntry } from "./buildStyleEntries";

export type RecordEventSelection =
  | { kind: "individual"; styleId: number }
  | { kind: "relay"; relayEventId: RelayEventId };

export interface RecordEventSearchParams {
  style?: string | string[];
  relay?: string | string[];
}

const RELAY_EVENT_IDS: ReadonlySet<string> = new Set(RELAY_EVENTS.map((r) => r.id));

function isRelayEventId(value: string): value is RelayEventId {
  return RELAY_EVENT_IDS.has(value);
}

/**
 * クエリパラメータを種目の選択に変換する。解釈できない値 (配列での多重指定・
 * 数値でない style・未知のリレー種目) は「未選択 = 種目一覧」として扱う。
 * styles マスターに存在するかどうかは呼び出し側 (RecordClient) が確認する。
 */
export function parseRecordEventSelection(
  params: RecordEventSearchParams,
): RecordEventSelection | null {
  const { style, relay } = params;
  if (typeof relay === "string" && relay !== "") {
    return isRelayEventId(relay) ? { kind: "relay", relayEventId: relay } : null;
  }
  if (typeof style === "string" && /^\d+$/.test(style)) {
    const styleId = Number(style);
    return styleId > 0 ? { kind: "individual", styleId } : null;
  }
  return null;
}

/** 種目一覧の URL */
export function buildRecordListPath(teamId: string, competitionId: string): string {
  return `/teams/${teamId}/competitions/${competitionId}/records`;
}

/** 種目を開いた状態の URL */
export function buildRecordEventPath(
  teamId: string,
  competitionId: string,
  selection: RecordEventSelection,
): string {
  const base = buildRecordListPath(teamId, competitionId);
  return selection.kind === "relay"
    ? `${base}?relay=${encodeURIComponent(selection.relayEventId)}`
    : `${base}?style=${selection.styleId}`;
}

/**
 * StyleEntry (1つの「組」) が選択中の種目に属するか。
 * リレーのレグは個人種目と同じ style_id を使うため、個人種目側は
 * relayEventId を持たないものに限る (mobile の詳細画面と同じ判定)。
 */
export function isEntryOfSelection(entry: StyleEntry, selection: RecordEventSelection): boolean {
  if (selection.kind === "relay") return entry.relayEventId === selection.relayEventId;
  return !entry.relayEventId && entry.styleId === selection.styleId;
}
