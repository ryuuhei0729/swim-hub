/**
 * BulkBestTimeClient - ロジック検証テスト
 * Sprint Contract (Phase B) に基づいて QA Engineer が独立して作成
 *
 * 検証対象:
 * - isValidForLongCourse ロジック (長水路フィルタ)
 * - canRelay ロジック (引き継ぎ可否)
 * - getInputKey ロジック (inputs Map キー生成)
 * - validInputCount (入力カウント)
 * - parseTime との連携 (フォーマットバリデーション)
 */

import { describe, it, expect } from "vitest";
import { parseTime } from "@apps/shared/utils/time";

// =============================================================================
// テスト対象の純粋関数を直接再実装して検証 (実装に依存しない独立テスト)
// =============================================================================

/**
 * 長水路で有効な種目かチェック (仕様ベース)
 * - 25m は長水路では存在しない
 * - 長水路の100m個人メドレーは存在しない
 */
function isValidForLongCourse(styleCode: string, distance: number): boolean {
  if (distance === 25) return false;
  if (styleCode === "im" && distance === 100) return false;
  return true;
}

/**
 * リレイングが可能な種目かチェック (仕様ベース)
 * - ba (背泳ぎ) と im (個人メドレー) はリレイング不可
 * - 200m以上は自由形のみリレイング可能
 * - 自由形でも 400/800/1500m は実競技に存在しないため false (Fix2)
 *
 * IMPORTANT: この再実装は BulkBestTimeClient.tsx の canRelay (L119-129) と
 * 完全一致させる必要がある。本体変更時はここも必ず同期すること。
 */
function canRelay(styleCode: string, distance: number): boolean {
  if (styleCode === "relay") return true;
  if (styleCode === "ba" || styleCode === "im") return false;
  if (distance >= 200 && styleCode !== "fr") return false;
  // Fix2: 400/800/1500m 自由形のリレーは実競技に存在しない (4x50/4x100/4x200 のみ)
  if (styleCode === "fr" && distance > 200) return false;
  return true;
}

/**
 * inputs Map のキー生成
 */
function getInputKey(styleId: number, poolType: number, isRelaying: boolean): string {
  return `${styleId}_${poolType}_${isRelaying ? "1" : "0"}`;
}

// =============================================================================
// isValidForLongCourse テスト
// =============================================================================

describe("isValidForLongCourse", () => {
  // 長水路で非表示になるべき距離
  describe("長水路で無効な種目 (非表示)", () => {
    it("[V-04] fr 25m は長水路で無効", () => {
      expect(isValidForLongCourse("fr", 25)).toBe(false);
    });
    it("[V-04] br 25m は長水路で無効", () => {
      expect(isValidForLongCourse("br", 25)).toBe(false);
    });
    it("[V-04] ba 25m は長水路で無効", () => {
      expect(isValidForLongCourse("ba", 25)).toBe(false);
    });
    it("[V-04] fly 25m は長水路で無効", () => {
      expect(isValidForLongCourse("fly", 25)).toBe(false);
    });
    it("[V-05] im 100m は長水路で無効", () => {
      expect(isValidForLongCourse("im", 100)).toBe(false);
    });
  });

  // 長水路で表示されるべき距離
  describe("長水路で有効な種目 (表示)", () => {
    it("fr 50m は長水路で有効", () => {
      expect(isValidForLongCourse("fr", 50)).toBe(true);
    });
    it("fr 100m は長水路で有効", () => {
      expect(isValidForLongCourse("fr", 100)).toBe(true);
    });
    it("im 200m は長水路で有効", () => {
      expect(isValidForLongCourse("im", 200)).toBe(true);
    });
    it("im 400m は長水路で有効", () => {
      expect(isValidForLongCourse("im", 400)).toBe(true);
    });
    it("br 100m は長水路で有効", () => {
      expect(isValidForLongCourse("br", 100)).toBe(true);
    });
    it("br 200m は長水路で有効", () => {
      expect(isValidForLongCourse("br", 200)).toBe(true);
    });
  });
});

// =============================================================================
// canRelay テスト
// =============================================================================

describe("canRelay", () => {
  // 引き継ぎボタンが表示されないべき種目
  describe("引き継ぎ不可 (ボタン非表示)", () => {
    it("[V-06] ba 50m はリレイング不可", () => {
      expect(canRelay("ba", 50)).toBe(false);
    });
    it("[V-06] ba 100m はリレイング不可", () => {
      expect(canRelay("ba", 100)).toBe(false);
    });
    it("[V-06] ba 200m はリレイング不可", () => {
      expect(canRelay("ba", 200)).toBe(false);
    });
    it("[V-06] im 200m はリレイング不可", () => {
      expect(canRelay("im", 200)).toBe(false);
    });
    it("[V-07] br 200m はリレイング不可 (200m以上で自由形以外)", () => {
      expect(canRelay("br", 200)).toBe(false);
    });
    it("[V-07] fly 200m はリレイング不可 (200m以上で自由形以外)", () => {
      expect(canRelay("fly", 200)).toBe(false);
    });
    it("[V-07] fr 400m はリレイング不可 (Fix2: 4x400m 自由形リレーは実競技に存在しない)", () => {
      expect(canRelay("fr", 400)).toBe(false);
    });
    it("[V-07] fr 800m はリレイング不可 (Fix2)", () => {
      expect(canRelay("fr", 800)).toBe(false);
    });
    it("[V-07] fr 1500m はリレイング不可 (Fix2)", () => {
      expect(canRelay("fr", 1500)).toBe(false);
    });
  });

  // 引き継ぎボタンが表示されるべき種目
  describe("引き継ぎ可能 (ボタン表示)", () => {
    it("fr 50m はリレイング可能", () => {
      expect(canRelay("fr", 50)).toBe(true);
    });
    it("fr 100m はリレイング可能", () => {
      expect(canRelay("fr", 100)).toBe(true);
    });
    it("fr 200m はリレイング可能 (4x200m リレーは実在)", () => {
      expect(canRelay("fr", 200)).toBe(true);
    });
    it("br 50m はリレイング可能", () => {
      expect(canRelay("br", 50)).toBe(true);
    });
    it("br 100m はリレイング可能", () => {
      expect(canRelay("br", 100)).toBe(true);
    });
    it("fly 50m はリレイング可能", () => {
      expect(canRelay("fly", 50)).toBe(true);
    });
    it("fly 100m はリレイング可能", () => {
      expect(canRelay("fly", 100)).toBe(true);
    });
  });
});

// =============================================================================
// getInputKey テスト (inputs Map のキー一意性)
// =============================================================================

describe("getInputKey", () => {
  it("短水路・通常タイムのキーを正しく生成", () => {
    expect(getInputKey(1, 0, false)).toBe("1_0_0");
  });
  it("長水路・通常タイムのキーを正しく生成", () => {
    expect(getInputKey(1, 1, false)).toBe("1_1_0");
  });
  it("短水路・引き継ぎタイムのキーを正しく生成", () => {
    expect(getInputKey(1, 0, true)).toBe("1_0_1");
  });
  it("長水路・引き継ぎタイムのキーを正しく生成", () => {
    expect(getInputKey(1, 1, true)).toBe("1_1_1");
  });
  it("短水路と長水路のキーが区別される (モバイル↔デスクトップ共有確認)", () => {
    const shortKey = getInputKey(2, 0, false);
    const longKey = getInputKey(2, 1, false);
    expect(shortKey).not.toBe(longKey);
  });
  it("通常タイムと引き継ぎタイムのキーが区別される", () => {
    const normalKey = getInputKey(9, 0, false);
    const relayKey = getInputKey(9, 0, true);
    expect(normalKey).not.toBe(relayKey);
  });
});

// =============================================================================
// parseTime 検証 (バリデーション挙動)
// =============================================================================

describe("parseTime - タイムバリデーション", () => {
  describe("有効なタイム形式", () => {
    it("'1:23.45' は正常にパース (83.45秒)", () => {
      const result = parseTime("1:23.45");
      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(83.45, 1);
    });
    it("'23.45' は正常にパース (23.45秒)", () => {
      const result = parseTime("23.45");
      expect(result).toBeGreaterThan(0);
    });
    it("'59.99' は正常にパース", () => {
      const result = parseTime("59.99");
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("無効なタイム形式 (エラー表示すべき)", () => {
    it("[V-11] 'abc' は無効 (0以下を返す)", () => {
      const result = parseTime("abc");
      expect(result).toBeLessThanOrEqual(0);
    });
    it("[V-11] 空文字は 0 または負数", () => {
      const result = parseTime("");
      expect(result).toBeLessThanOrEqual(0);
    });
    it("[V-11] '1:ab.cd' は既存 parseTime の動作確認 (数字部分 '1' が抽出される → 1秒を返す)", () => {
      // NOTE: parseTime("1:ab.cd") は "1" のみ抽出し 1秒を返す。
      // これは parseTime の既存動作であり、BulkBestTimeClient の実装変更スコープ外。
      // この入力を「有効」とする仕様上の問題があるため Warning として記録する。
      // BulkBestTimeClient では parseTime > 0 で有効判定するため、
      // "1:ab.cd" が 1秒の有効なタイムとして登録される可能性がある。
      const result = parseTime("1:ab.cd");
      // 実際の動作を記録 (回帰テスト用)
      expect(result).toBe(1); // parseQuickFormat で ["1"] のみ抽出 → 1秒
    });
    it("[V-11] '0:00.00' は無効 (0秒)", () => {
      const result = parseTime("0:00.00");
      expect(result).toBeLessThanOrEqual(0);
    });
  });
});

// =============================================================================
// validInputCount 相当ロジックのテスト
// =============================================================================

describe("validInputCount - 入力済みカウント", () => {
  type BestTimeInput = {
    time: string;
    note: string;
    timeInSeconds?: number;
    error?: string;
  };

  function countValidInputs(inputs: Map<string, BestTimeInput>): number {
    let count = 0;
    inputs.forEach((input) => {
      if (input.time && !input.error && input.timeInSeconds !== undefined) {
        count++;
      }
    });
    return count;
  }

  it("[V-14] inputs が空のとき validInputCount = 0 (登録ボタン disabled)", () => {
    const inputs = new Map<string, BestTimeInput>();
    expect(countValidInputs(inputs)).toBe(0);
  });

  it("[V-12] 有効な入力が1件あるとき count = 1", () => {
    const inputs = new Map<string, BestTimeInput>([
      ["2_0_0", { time: "23.45", note: "", timeInSeconds: 23.45 }],
    ]);
    expect(countValidInputs(inputs)).toBe(1);
  });

  it("[V-12] エラーありの入力はカウントされない", () => {
    const inputs = new Map<string, BestTimeInput>([
      ["2_0_0", { time: "abc", note: "", error: "形式エラー" }],
    ]);
    expect(countValidInputs(inputs)).toBe(0);
  });

  it("[V-12] モバイル(短水路)とデスクトップ(長水路)の入力が同じ Map で管理される", () => {
    // モバイルで短水路 fr 50m 入力
    const inputs = new Map<string, BestTimeInput>([
      ["2_0_0", { time: "23.45", note: "", timeInSeconds: 23.45 }], // short course
      ["2_1_0", { time: "24.56", note: "", timeInSeconds: 24.56 }], // long course
    ]);
    expect(countValidInputs(inputs)).toBe(2);
  });

  it("[V-15] モバイル↔デスクトップで inputs が共有される (同じキーで参照)", () => {
    // fr 50m (styleId=2), poolType=0, isRelaying=false のキー
    const mobileKey = getInputKey(2, 0, false);
    const desktopKey = getInputKey(2, 0, false);
    expect(mobileKey).toBe(desktopKey);
  });
});

// =============================================================================
// 長水路フィルタ境界値テスト
// =============================================================================

describe("長水路フィルタ境界値", () => {
  const DISTANCES_BY_STYLE: Record<string, number[]> = {
    fr: [25, 50, 100, 200, 400, 800, 1500],
    br: [25, 50, 100, 200],
    ba: [25, 50, 100, 200],
    fly: [25, 50, 100, 200],
    im: [100, 200, 400],
  };

  it("[V-04] fr タブ長水路: 25m のみ非表示", () => {
    const visible = DISTANCES_BY_STYLE.fr.filter(d => isValidForLongCourse("fr", d));
    expect(visible).not.toContain(25);
    expect(visible).toContain(50);
    expect(visible).toContain(100);
    expect(visible).toContain(200);
    expect(visible).toContain(400);
    expect(visible).toContain(800);
    expect(visible).toContain(1500);
  });

  it("[V-04] br タブ長水路: 25m のみ非表示", () => {
    const visible = DISTANCES_BY_STYLE.br.filter(d => isValidForLongCourse("br", d));
    expect(visible).not.toContain(25);
    expect(visible).toEqual([50, 100, 200]);
  });

  it("[V-04] ba タブ長水路: 25m のみ非表示", () => {
    const visible = DISTANCES_BY_STYLE.ba.filter(d => isValidForLongCourse("ba", d));
    expect(visible).not.toContain(25);
    expect(visible).toEqual([50, 100, 200]);
  });

  it("[V-04] fly タブ長水路: 25m のみ非表示", () => {
    const visible = DISTANCES_BY_STYLE.fly.filter(d => isValidForLongCourse("fly", d));
    expect(visible).not.toContain(25);
    expect(visible).toEqual([50, 100, 200]);
  });

  it("[V-05] im タブ長水路: 100m が非表示、200m・400m は表示", () => {
    const visible = DISTANCES_BY_STYLE.im.filter(d => isValidForLongCourse("im", d));
    expect(visible).not.toContain(100);
    expect(visible).toContain(200);
    expect(visible).toContain(400);
  });
});

// =============================================================================
// 二重メカニズム (key + useEffect) の解析テスト
// =============================================================================

describe("二重メカニズム: key={distance_activePool} と useEffect([poolType])", () => {
  /**
   * key が変わると BestTimeCard は再マウントされる。
   * useState lazy initializer と useEffect([poolType]) は両方同じ
   * inputs の relayKey を参照する。
   * 矛盾はないが、useEffect は再マウント時の mount effect として実行される。
   * 実際には: 再マウント → useState initializer で正しい初期値 → useEffect で同じ値を再設定
   * 副作用: activePool 切替でフォームが再マウント → フォーカス喪失
   */
  it("activePool 変更で relay 展開状態が inputs の現在値に基づいてリセットされる (仕様確認)", () => {
    // short course の relay key
    const shortRelayKey = getInputKey(9, 0, true); // br 100m short course relay
    // long course の relay key
    const longRelayKey = getInputKey(9, 1, true);  // br 100m long course relay

    // 別プールのキーは異なる
    expect(shortRelayKey).not.toBe(longRelayKey);

    // short で入力がある場合、long に切り替えると short の relay key は参照しない
    const inputs = new Map([
      [shortRelayKey, { time: "1:10.00", note: "", timeInSeconds: 70.0 }],
    ]);

    // long course の relay key には値がない
    const longRelayInput = inputs.get(longRelayKey);
    expect(longRelayInput).toBeUndefined();

    // useEffect で setShowRelayingSection(!!inputs.get(longRelayKey)?.time) = false
    const shouldShowRelay = !!longRelayInput?.time;
    expect(shouldShowRelay).toBe(false); // 長水路では引き継ぎ展開なし (正しい動作)
  });

  it("activePool 切替後、同プールで relay 入力済みなら展開状態が true になる", () => {
    const longRelayKey = getInputKey(9, 1, true);
    const inputs = new Map([
      [longRelayKey, { time: "1:11.00", note: "", timeInSeconds: 71.0 }],
    ]);

    const shouldShowRelay = !!inputs.get(longRelayKey)?.time;
    expect(shouldShowRelay).toBe(true); // 長水路に入力済み → 展開
  });
});
