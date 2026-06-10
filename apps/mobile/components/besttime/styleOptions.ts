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
 * 例: ja → "50m 自由形", en → "50m Freestyle"
 */
export function formatStyleDisplay(style: StyleOption, t: (key: string) => string): string {
  return `${style.distance}m ${t(`practice.styles.${style.styleKey}`)}`;
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
 * 引き継ぎ (リレー) タイムを入力できる種目かどうか。
 * 背泳ぎ・個人メドレーは不可。200m 以上は自由形のみ可。
 */
export function canRelay(style: StyleOption): boolean {
  if (style.styleKey === "Ba" || style.styleKey === "IM") return false;
  if (style.distance >= 200 && style.styleKey !== "Fr") return false;
  return true;
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

/** 保存可能か (オンボーディング): 1件以上 / 重複なし / 全タイムが妥当 */
export function canSave(entries: BestTimeEntry[]): boolean {
  if (entries.length === 0) return false;
  if (hasDuplicates(entries)) return false;
  return entries.every((e) => parseTime(e.time) > 0);
}

// =============================================================================
// バリデーションロジック (一括入力: 通常 + 引き継ぎ)
// =============================================================================

/** 入力値が「入力済みだが不正」か (空は不正扱いしない) */
export function isEnteredButInvalid(raw: string): boolean {
  return raw.trim() !== "" && parseTime(raw) <= 0;
}

export interface BulkBestTimeState {
  /** 保存対象のレコード下書き (有効なタイムのみ) */
  records: BestTimeRecordDraft[];
  /** 重複しているエントリーの key 集合 */
  duplicateKeys: Set<string>;
  /** 入力済みだが不正なタイムが存在するか */
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
 */
export function computeBulkState(entries: BestTimeEntry[]): BulkBestTimeState {
  const records: BestTimeRecordDraft[] = [];
  const duplicateKeys = new Set<string>();
  const seen = new Map<string, string>();
  let hasInvalidTime = false;

  for (const e of entries) {
    const trimmed = e.time.trim();
    if (!trimmed) continue;
    const seconds = parseTime(trimmed);
    if (seconds <= 0) {
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
  const canSave = validCount >= 1 && !hasInvalidTime && duplicateKeys.size === 0;
  return { records, duplicateKeys, hasInvalidTime, canSave, validCount };
}
