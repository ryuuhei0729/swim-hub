import i18next from "i18next";
import { parseTime } from "@apps/shared/utils/time";

// =============================================================================
// 型定義
// =============================================================================

export type StyleKey = "Fr" | "Br" | "Ba" | "Fly" | "IM";

export interface StyleOption {
  /** バックエンド (DB) 上の styleId */
  id: number;
  /** 距離 (メートル) */
  distance: number;
  /** `practice.styles.*` の i18n キー */
  styleKey: StyleKey;
}

/**
 * 一括入力の1エントリー (= 1種目 × 1水路 × 通常/引き継ぎ区分)。
 * isRelaying を ON にすると、その time は引き継ぎ (リレー) タイムとして登録される。
 * オンボーディングでは time のみ使用する (note/isRelaying は常に既定値)。
 */
export interface BestTimeEntry {
  key: string;
  styleId: number;
  poolType: 0 | 1; // 0: 短水路, 1: 長水路
  time: string;
  note: string; // 備考 (大会名など)
  isRelaying: boolean; // ON で引き継ぎ (リレー) タイムとして登録
}

/** 保存用レコード下書き (BestTimeEntry を展開したもの) */
export interface BestTimeRecordDraft {
  styleId: number;
  poolType: 0 | 1;
  isRelaying: boolean;
  time: number;
  note: string | null;
}

// =============================================================================
// 種目マスター (styles テーブルと同期 / Web 版 BulkBestTimeClient と一致)
// =============================================================================
// id は DB 上の styleId。表示は `${distance}m ${t("practice.styles." + styleKey)}`。

export const STYLES: StyleOption[] = [
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

export function getStyleOption(styleId: number): StyleOption | undefined {
  return STYLES.find((s) => s.id === styleId);
}

/**
 * `StyleOption` を locale-aware な表示文字列に変換。
 * Web 版 buildSwimStyleLabel と同じく、ja のみスペースなし。
 * 例: ja → "50m自由形", en → "50m Freestyle"
 *
 * @param locale 省略時は i18next の現在言語を使う
 */
export function formatStyleDisplay(
  style: StyleOption,
  t: (key: string) => string,
  locale?: string,
): string {
  const lang = (locale ?? i18next.language ?? "").toLowerCase();
  const separator = lang.startsWith("ja") ? "" : " ";
  return `${style.distance}m${separator}${t(`practice.styles.${style.styleKey}`)}`;
}

export function genKey(): string {
  return `bt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * 長水路 (50mプール) で有効な種目かどうか。
 * 25m 種目と 100m 個人メドレーは長水路では実施されない。
 */
export function isValidForLongCourse(style: StyleOption): boolean {
  if (style.distance === 25) return false;
  if (style.styleKey === "IM" && style.distance === 100) return false;
  return true;
}

/**
 * 引き継ぎ (リレー) タイムを入力できる種目かどうか (Web 版 canRelay と同一)。
 * 背泳ぎ・個人メドレーは不可。200m 以上は自由形のみ可。
 * 400/800/1500m 自由形のリレーは実競技に存在しない (4x50/4x100/4x200 のみ)。
 */
export function canRelay(style: StyleOption): boolean {
  if (style.styleKey === "Ba" || style.styleKey === "IM") return false;
  if (style.distance >= 200 && style.styleKey !== "Fr") return false;
  if (style.styleKey === "Fr" && style.distance > 200) return false;
  return true;
}

// =============================================================================
// 一括入力マトリクス (Web 版 BulkBestTimeClient の 種目タブ × 距離 × 水路 と同期)
// =============================================================================

/** 種目タブ ID。i18n キーは `bulkBestTime.tabs.${id}` */
export type StyleTabId = "fr" | "br" | "ba" | "fly" | "im";

export const STYLE_TAB_IDS: StyleTabId[] = ["fr", "br", "ba", "fly", "im"];

const TAB_TO_STYLE_KEY: Record<StyleTabId, StyleKey> = {
  fr: "Fr",
  br: "Br",
  ba: "Ba",
  fly: "Fly",
  im: "IM",
};

/** タブに属する種目 (STYLES の定義順 = 距離昇順) */
export function getStylesForTab(tab: StyleTabId): StyleOption[] {
  const key = TAB_TO_STYLE_KEY[tab];
  return STYLES.filter((s) => s.styleKey === key);
}

/** マトリクスのセルキー (Web 版 getInputKey と同一形式: `styleId_poolType_relay`) */
export function getCellKey(styleId: number, poolType: 0 | 1, isRelaying: boolean): string {
  return `${styleId}_${poolType}_${isRelaying ? "1" : "0"}`;
}

/** マトリクスの1セル入力値 (タイム + 備考) */
export interface CellInput {
  time: string;
  note: string;
}

/** セルキー → 入力値 のマップ。キーが構造を一意に決めるため重複は起こり得ない */
export type BestTimeInputMap = Record<string, CellInput>;

/** 入力マップから保存用レコード配列を計算する (Web 版と同じく不正・空セルは除外) */
export function computeMatrixRecords(inputs: BestTimeInputMap): BestTimeRecordDraft[] {
  const records: BestTimeRecordDraft[] = [];
  for (const [key, input] of Object.entries(inputs)) {
    const seconds = parseTimeStrict(input.time);
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

// =============================================================================
// タイム形式バリデーション (Web 版 BulkBestTimeClient と同一)
// =============================================================================

/**
 * タイム入力の許容形式 (Web 版 BulkBestTimeClient.handleInputChange と同じ正規表現):
 *  従来形式  \d+(:\d+)?(\.\d+)?  → "1:23.45" "1:30" "23.45" "30"
 *  クイック式 \d+(-\d+){1,2}     → "31-2" "1-05-3"
 * 末尾 s は許容。多重ドット ("1.23.45")・多重コロン ("1:2:3")・連続区切り・英字を構造的に弾く。
 */
export const TIME_FORMAT_REGEX = /^(\d+(:\d+)?(\.\d+)?|\d+(-\d+){1,2})s?$/i;

/**
 * 構造チェック (TIME_FORMAT_REGEX) + parseTime > 0 を通過した秒数を返す。
 * 不正な形式・空文字は null。"1.23.45" のような typo が parseFloat で
 * 1.23 秒として誤保存されるのを防ぐ。
 */
export function parseTimeStrict(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!TIME_FORMAT_REGEX.test(trimmed)) return null;
  const seconds = parseTime(trimmed);
  return seconds > 0 ? seconds : null;
}

// =============================================================================
// バリデーションロジック (オンボーディング: 通常タイムのみ)
// =============================================================================

/** 同一 種目 × 水路 の重複があるか */
export function hasDuplicates(entries: BestTimeEntry[]): boolean {
  const seen = new Set<string>();
  for (const e of entries) {
    const composite = `${e.styleId}-${e.poolType}`;
    if (seen.has(composite)) return true;
    seen.add(composite);
  }
  return false;
}

/** 重複しているエントリーの key 集合を返す (画面ハイライト用) */
export function getDuplicateKeys(entries: BestTimeEntry[]): Set<string> {
  const keys = new Set<string>();
  const seen = new Map<string, string>();
  for (const e of entries) {
    const composite = `${e.styleId}-${e.poolType}`;
    const existing = seen.get(composite);
    if (existing) {
      keys.add(existing);
      keys.add(e.key);
    } else {
      seen.set(composite, e.key);
    }
  }
  return keys;
}

/** 保存可能か (オンボーディング): 1件以上 / 重複なし / 全タイムが妥当 (形式チェック込み) */
export function canSave(entries: BestTimeEntry[]): boolean {
  if (entries.length === 0) return false;
  if (hasDuplicates(entries)) return false;
  return entries.every((e) => parseTimeStrict(e.time) !== null);
}

// =============================================================================
// バリデーションロジック (一括入力: 通常 + 引き継ぎ)
// =============================================================================

/** 入力値が「入力済みだが不正」か (空は不正扱いしない / 形式チェック込み) */
export function isEnteredButInvalid(raw: string): boolean {
  return raw.trim() !== "" && parseTimeStrict(raw) === null;
}

export interface BulkBestTimeState {
  /** 保存対象のレコード下書き (有効なタイムのみ) */
  records: BestTimeRecordDraft[];
  /** 重複しているエントリーの key 集合 */
  duplicateKeys: Set<string>;
  /** 入力済みだが不正なタイムが存在するか (保存自体はブロックしない) */
  hasInvalidTime: boolean;
  /** 保存ボタンを活性化してよいか */
  canSave: boolean;
  /** 有効なタイム入力件数 */
  validCount: number;
}

/**
 * 一括入力エントリーを保存用レコードへ変換し、保存可否・重複・件数を計算する。
 * 各エントリーは1レコード (isRelaying で通常/引き継ぎを区別)。
 * 重複判定は 種目 × 水路 × 引き継ぎ区分 で行う。
 * Web 版と同じく、不正なタイムは保存対象から除外するだけで保存はブロックしない
 * (有効な入力が1件以上 + 重複なし で保存可)。
 */
export function computeBulkState(entries: BestTimeEntry[]): BulkBestTimeState {
  const records: BestTimeRecordDraft[] = [];
  const duplicateKeys = new Set<string>();
  const seen = new Map<string, string>();
  let hasInvalidTime = false;

  for (const e of entries) {
    const trimmed = e.time.trim();
    if (!trimmed) continue;
    const seconds = parseTimeStrict(trimmed);
    if (seconds === null) {
      hasInvalidTime = true;
      continue;
    }
    records.push({
      styleId: e.styleId,
      poolType: e.poolType,
      isRelaying: e.isRelaying,
      time: seconds,
      note: e.note.trim() || null,
    });
    const composite = `${e.styleId}-${e.poolType}-${e.isRelaying ? 1 : 0}`;
    const existing = seen.get(composite);
    if (existing) {
      duplicateKeys.add(existing);
      duplicateKeys.add(e.key);
    } else {
      seen.set(composite, e.key);
    }
  }

  const validCount = records.length;
  // Web 版セマンティクス: 不正セルは除外するだけで、有効1件以上 + 重複なし なら保存可
  const canSave = validCount >= 1 && duplicateKeys.size === 0;
  return { records, duplicateKeys, hasInvalidTime, canSave, validCount };
}
