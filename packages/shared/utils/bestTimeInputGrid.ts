// =============================================================================
// ベストタイム表の入力モード (一括入力) - Web / Mobile 共通の純粋関数
// =============================================================================
//
// 2026-11-10 にベストタイム一括入力画面をやめ、ホームのベストタイム表がそのまま入力モードに
// 切り替わる形にした (mobile が先行。Web は 2026-11-11)。表の行・入力できるマス・マスのキー・
// 登録用レコードへの変換をここにまとめる。
// 種目マスターの id は styles テーブルの id と一致させること。

import { parseTimeFlexible } from "./time";

export type InputGridStyleKey = "Fr" | "Br" | "Ba" | "Fly" | "IM";

export interface InputGridStyle {
  /** styles テーブルの id */
  id: number;
  distance: number;
  styleKey: InputGridStyleKey;
}

/** 種目マスター (styles テーブルと同期) */
export const INPUT_GRID_STYLES: readonly InputGridStyle[] = [
  { id: 1, distance: 25, styleKey: "Fr" },
  { id: 2, distance: 50, styleKey: "Fr" },
  { id: 3, distance: 100, styleKey: "Fr" },
  { id: 4, distance: 200, styleKey: "Fr" },
  { id: 5, distance: 400, styleKey: "Fr" },
  { id: 6, distance: 800, styleKey: "Fr" },
  { id: 7, distance: 1500, styleKey: "Fr" },
  { id: 8, distance: 25, styleKey: "Br" },
  { id: 9, distance: 50, styleKey: "Br" },
  { id: 10, distance: 100, styleKey: "Br" },
  { id: 11, distance: 200, styleKey: "Br" },
  { id: 12, distance: 25, styleKey: "Ba" },
  { id: 13, distance: 50, styleKey: "Ba" },
  { id: 14, distance: 100, styleKey: "Ba" },
  { id: 15, distance: 200, styleKey: "Ba" },
  { id: 16, distance: 25, styleKey: "Fly" },
  { id: 17, distance: 50, styleKey: "Fly" },
  { id: 18, distance: 100, styleKey: "Fly" },
  { id: 19, distance: 200, styleKey: "Fly" },
  { id: 20, distance: 100, styleKey: "IM" },
  { id: 21, distance: 200, styleKey: "IM" },
  { id: 22, distance: 400, styleKey: "IM" },
];

/** 入力モードの行 (表示時の 50〜800m に、一括入力で登録できる 25m・1500m を足す) */
export const INPUT_GRID_DISTANCES = [25, 50, 100, 200, 400, 800, 1500] as const;

/** 表の列順 (ホームのベストタイム表と同じ) */
export const INPUT_GRID_STYLE_KEYS: readonly InputGridStyleKey[] = ["Fr", "Br", "Ba", "Fly", "IM"];

export function findInputGridStyle(
  styleKey: InputGridStyleKey,
  distance: number,
): InputGridStyle | undefined {
  return INPUT_GRID_STYLES.find((s) => s.styleKey === styleKey && s.distance === distance);
}

export function getInputGridStyleById(styleId: number): InputGridStyle | undefined {
  return INPUT_GRID_STYLES.find((s) => s.id === styleId);
}

/** 長水路で行う種目か (25m と 100m 個人メドレーは長水路では行わない) */
export function isValidForLongCourse(style: InputGridStyle): boolean {
  if (style.distance === 25) return false;
  if (style.styleKey === "IM" && style.distance === 100) return false;
  return true;
}

/**
 * 引き継ぎ (リレー) タイムがある種目か。
 * 背泳ぎ・個人メドレーは無し。200m 以上は自由形だけ。400/800/1500m 自由形のリレーは無い
 */
export function canRelay(style: InputGridStyle): boolean {
  if (style.styleKey === "Ba" || style.styleKey === "IM") return false;
  if (style.distance >= 200 && style.styleKey !== "Fr") return false;
  if (style.styleKey === "Fr" && style.distance > 200) return false;
  return true;
}

/** そのマスに入力できるか */
export function isEnterableCell(
  style: InputGridStyle | undefined,
  poolType: 0 | 1,
  isRelaying: boolean,
): style is InputGridStyle {
  if (!style) return false;
  if (poolType === 1 && !isValidForLongCourse(style)) return false;
  if (isRelaying && !canRelay(style)) return false;
  return true;
}

/** マスのキー (`styleId_poolType_relay`) */
export function getCellKey(styleId: number, poolType: 0 | 1, isRelaying: boolean): string {
  return `${styleId}_${poolType}_${isRelaying ? "1" : "0"}`;
}

export interface CellInput {
  time: string;
  note: string;
}

/** マスのキー → 入力値 */
export type BestTimeInputMap = Record<string, CellInput>;

export interface BestTimeRecordDraft {
  styleId: number;
  poolType: 0 | 1;
  isRelaying: boolean;
  time: number;
  note: string | null;
}

/** 入力から登録用レコードを作る (形式が正しくない・空のマスは除く) */
export function computeMatrixRecords(inputs: BestTimeInputMap): BestTimeRecordDraft[] {
  const records: BestTimeRecordDraft[] = [];
  for (const [key, input] of Object.entries(inputs)) {
    const seconds = parseTimeFlexible(input.time);
    if (seconds === null) continue;
    const [styleIdStr, poolTypeStr, relayStr] = key.split("_");
    records.push({
      styleId: Number(styleIdStr),
      poolType: Number(poolTypeStr) === 1 ? 1 : 0,
      isRelaying: relayStr === "1",
      time: seconds,
      note: input.note.trim() || null,
    });
  }
  return records;
}

/** 何か入力されているが、タイムとして読めない */
export function isEnteredButInvalid(raw: string): boolean {
  return raw.trim() !== "" && parseTimeFlexible(raw) === null;
}

/** ベストタイム表のデータのうち、今のベストを引くのに要る項目 */
export interface CurrentBestSource {
  time: number;
  pool_type: number;
  is_relaying: boolean;
  style_id?: number;
  style: { name_jp: string; distance: number };
  relayingTime?: { time: number } | null;
}

const STYLE_NAME_JP: Record<InputGridStyleKey, string> = {
  Fr: "自由形",
  Br: "平泳ぎ",
  Ba: "背泳ぎ",
  Fly: "バタフライ",
  IM: "個人メドレー",
};

/** style_id が無いデータ (Web の旧型) は name_jp ("100m自由形") から種目マスターを引く */
function resolveStyleId(bt: CurrentBestSource): number | undefined {
  if (typeof bt.style_id === "number") return bt.style_id;
  return INPUT_GRID_STYLES.find(
    (s) => `${s.distance}m${STYLE_NAME_JP[s.styleKey]}` === bt.style.name_jp,
  )?.id;
}

/** マスのキー → 今のベスト (秒)。通常タイムと引き継ぎタイムは別のマスとして持つ */
export function buildCurrentBestMap(bestTimes: readonly CurrentBestSource[]): Map<string, number> {
  const map = new Map<string, number>();
  const put = (styleId: number, poolType: number, isRelaying: boolean, time: number) => {
    const key = getCellKey(styleId, poolType === 1 ? 1 : 0, isRelaying);
    const prev = map.get(key);
    if (prev === undefined || time < prev) map.set(key, time);
  };
  for (const bt of bestTimes) {
    const styleId = resolveStyleId(bt);
    if (styleId === undefined) continue;
    put(styleId, bt.pool_type, bt.is_relaying, bt.time);
    if (!bt.is_relaying && bt.relayingTime) {
      put(styleId, bt.pool_type, true, bt.relayingTime.time);
    }
  }
  return map;
}
