// =============================================================================
// 練習タイムのクイック入力(マスク入力) - Web / Mobile 共通
//
// 2本目以降のセルは、入力欄にフォーカスした時点で前の本の十の位 (60秒以上なら「分.十の位」) を
// 「シード」として先に入れておき、数字キーだけで続きを打てるようにする。
// 十の位+一の位の2桁が揃った直後に "." を自動で入れる (例: シード "3" + "25" → "32.5")。
// =============================================================================

import type { QuickTimeContext } from "./quickTimeParser";

/** シード文字列を「分」部分と「十の位」部分に分解する ("1.2"→{minutePart:"1",tensDigitPart:"2"}, "3"→{minutePart:"",tensDigitPart:"3"}) */
export function splitQuickSeed(seed: string): { minutePart: string; tensDigitPart: string } {
  const dotIndex = seed.lastIndexOf(".");
  if (dotIndex === -1) return { minutePart: "", tensDigitPart: seed };
  return { minutePart: seed.slice(0, dotIndex), tensDigitPart: seed.slice(dotIndex + 1) };
}

/**
 * シード + 追加入力 → 表示文字列。
 * 「シードの十の位を含めて2桁目」の直後に "." を自動挿入する (十の位+一の位 の次が小数第1位)。
 */
export function formatQuickBuffer(seed: string, typed: string): string {
  const seedDigitCount = quickSeedDigitCount(seed);
  let result = seed;
  for (let i = 0; i < typed.length; i++) {
    result += typed[i];
    // この文字を追加した直後の合計桁数が2 (十の位+一の位) になったら "." を続ける
    const totalDigitsSoFar = seedDigitCount + i + 1;
    if (totalDigitsSoFar === 2) {
      result += ".";
    }
  }
  return result;
}

/** シード + 追加入力 → 秒数 (一の位まで揃っていない場合は0=未確定) */
export function quickBufferToSeconds(seed: string, typed: string): number {
  const { minutePart, tensDigitPart } = splitQuickSeed(seed);
  const secondsDigits = tensDigitPart + typed; // 十の位・一の位・小数第1位を最大3桁でつなげる
  if (secondsDigits.length < 2) return 0;
  const tens = Number(secondsDigits[0]);
  const ones = Number(secondsDigits[1]);
  const tenths = secondsDigits.length >= 3 ? Number(secondsDigits[2]) : 0;
  const minutes = minutePart ? Number(minutePart) : 0;
  return minutes * 60 + tens * 10 + ones + tenths / 10;
}

/** シード時点で埋まっている「十の位までの桁数」(0 or 1)。追加入力の残り枠数の計算に使う */
export function quickSeedDigitCount(seed: string): number {
  return splitQuickSeed(seed).tensDigitPart ? 1 : 0;
}

/** シードに続けて打てる数字の最大桁数 (十の位・一の位・小数第1位の3桁からシード分を引いた数) */
export function quickTypedCapacity(seed: string): number {
  return 3 - quickSeedDigitCount(seed);
}

/** 確定済みタイム (秒) → 次のセルへ引き継ぐシード ("3" または、分がある場合は "1.2") */
export function seedFromSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const secsRemainder = whole % 60;
  const tensDigit = Math.floor(secsRemainder / 10) % 10;
  return minutes > 0 ? `${minutes}.${tensDigit}` : `${tensDigit}`;
}

/**
 * 確定済みタイム (秒) → 「2-3」形式のクイック入力 (parseQuickTime) で引き継ぐコンテキスト。
 * 直前の本のタイムから分と十の位を取り出す
 */
export function quickTimeContextFromSeconds(seconds: number): QuickTimeContext {
  const whole = Math.floor(seconds);
  return {
    minutes: Math.floor(whole / 60),
    tensDigit: Math.floor((whole % 60) / 10),
  };
}
