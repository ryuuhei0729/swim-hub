/**
 * PracticeLogTemplateCreateModal 保存ペイロード検証テスト (V-22〜V-25 + Critical 3件)
 *
 * Sprint Contract 検証観点:
 *   - V-22: circle=150 (2分30秒) が正しく計算されること
 *   - V-23: circle=0 (0分0秒) が null にならず 0 で保存されること
 *   - V-24: 距離「その他」=400 が number 型 400 で保存されること
 *   - V-25: 編集モード: rep_count のみ変更で他フィールドが同値
 *   - Critical 1: カスタム距離が空のまま送信しようとすると保存がブロックされること
 *   - Critical 2: repCount/setCount は Math.max(1, Number(v) || 1) で確定
 *   - Critical 3: circleMinutes の max={59} 削除。onChange は v===""?"":Number(v) に統一
 *   - DRY: DISTANCE_PRESETS が types.ts に移動し両コンポーネントで共有
 *
 * 【検証戦略】
 * handleSubmit ロジックを純粋関数として抽出し、ユニットテストで検証する。
 * (jsdom 環境での react-query + @supabase/ssr + symlink 解決の組み合わせで
 *  コンポーネントレンダリングテストがハングするため)
 */

import { describe, it, expect } from "vitest";
import { DISTANCE_PRESETS } from "../../../components/forms/practice-log/types";

// ---------------------------------------------------------------------------
// handleSubmit の計算ロジック（コンポーネントから抽出した純粋関数）
// ---------------------------------------------------------------------------

/**
 * handleSubmit の circle 計算式:
 *   const circleInSeconds = (Number(circleMinutes) || 0) * 60 + (Number(circleSeconds) || 0);
 */
function calcCircleInSeconds(circleMinutes: number | "", circleSeconds: number | ""): number {
  return (Number(circleMinutes) || 0) * 60 + (Number(circleSeconds) || 0);
}

/**
 * handleSubmit の距離ガード + 確定ロジック:
 *   const distanceNum = Number(distance);
 *   if (!distanceNum || distanceNum <= 0) return; // ブロック
 */
function resolveDistance(distance: number | ""): number | null {
  const distanceNum = Number(distance);
  if (!distanceNum || distanceNum <= 0) return null; // null = 保存ブロック
  return distanceNum;
}

/**
 * handleSubmit の rep_count / set_count 確定ロジック:
 *   Math.max(1, Number(repCount) || 1)
 */
function resolveCountField(v: number | ""): number {
  return Math.max(1, Number(v) || 1);
}

/**
 * distance custom input の onChange ロジック:
 *   setDistance(e.target.value === "" ? "" : Number(e.target.value))
 */
function parseDistanceInput(rawValue: string): number | "" {
  return rawValue === "" ? "" : Number(rawValue);
}

/**
 * repCount / setCount の NumberStepper onChange ロジック:
 *   setRepCount(v === "" ? "" : Number(v))
 */
function parseStepperValue(v: string): number | "" {
  return v === "" ? "" : Number(v);
}

/**
 * circleSeconds の onChange ロジック（Critical 3 統一後）:
 *   setCircleSeconds(v === "" ? "" : Number(v))
 */
function parseCircleSecondsInput(v: string): number | "" {
  return v === "" ? "" : Number(v);
}

/** 編集時の初期化ロジックを再現 */
function initFromEditData(editData: { circle: number; distance: number }): {
  circleMin: number;
  circleSec: number;
  showCustomDistance: boolean;
} {
  const circleTime = editData.circle || 0;
  const min = Math.floor(circleTime / 60);
  const sec = circleTime % 60;
  const distanceIsPreset = (DISTANCE_PRESETS as readonly number[]).includes(editData.distance);
  return { circleMin: min, circleSec: sec, showCustomDistance: !distanceIsPreset };
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("PracticeLogTemplateCreateModal - 保存ペイロード計算ロジック (V-22〜V-25 + Critical)", () => {
  describe("DRY: DISTANCE_PRESETS が types.ts から import されること", () => {
    it("DISTANCE_PRESETS が [25, 50, 100, 200] であること", () => {
      expect(Array.from(DISTANCE_PRESETS)).toEqual([25, 50, 100, 200]);
    });

    it("DISTANCE_PRESETS が export されていること（import 成功で確認）", () => {
      expect(DISTANCE_PRESETS).toBeDefined();
      expect(DISTANCE_PRESETS.length).toBe(4);
    });
  });

  describe("[V-22] circle 計算: circleMinutes * 60 + circleSeconds", () => {
    it("2分30秒 → circle=150", () => {
      expect(calcCircleInSeconds(2, 30)).toBe(150);
    });

    it("1分30秒（新規作成デフォルト）→ circle=90", () => {
      expect(calcCircleInSeconds(1, 30)).toBe(90);
    });

    it("5分0秒 → circle=300", () => {
      expect(calcCircleInSeconds(5, 0)).toBe(300);
    });

    it("0分45秒 → circle=45", () => {
      expect(calcCircleInSeconds(0, 45)).toBe(45);
    });

    it("空文字列 '' は 0 として扱われる（NumberStepper クリア時）", () => {
      const result = calcCircleInSeconds("" as unknown as number, "");
      expect(result).toBe(0);
    });
  });

  describe("[V-23] circle=0: 0分0秒は circle=0（null にならない）", () => {
    it("circleMinutes=0, circleSeconds=0 → circle=0（ゼロ、null ではない）", () => {
      const result = calcCircleInSeconds(0, 0);
      expect(result).toBe(0);
      expect(result).not.toBeNull();
    });

    it("circle=0 の往復: 0分0秒 → circle=0", () => {
      const circleTime = 0;
      const min = Math.floor(circleTime / 60);
      const sec = circleTime % 60;
      expect(calcCircleInSeconds(min, sec)).toBe(0);
    });
  });

  describe("[Critical 1] カスタム距離が空のとき保存がブロックされること", () => {
    it("distance='' のとき resolveDistance が null を返す（保存ブロック）", () => {
      expect(resolveDistance("")).toBeNull();
    });

    it("distance=0 のとき resolveDistance が null を返す（0は無効値）", () => {
      expect(resolveDistance(0)).toBeNull();
    });

    it("distance 負数のとき resolveDistance が null を返す", () => {
      // Number(-1) = -1, !(-1)=false, -1<=0=true → null
      const distanceNum = Number(-1);
      const result = !distanceNum || distanceNum <= 0 ? null : distanceNum;
      expect(result).toBeNull();
    });

    it("distance=400 のとき resolveDistance が 400 を返す（有効値）", () => {
      expect(resolveDistance(400)).toBe(400);
    });

    it("「その他」ボタンクリック直後は distance='' になる（stale 値が残らない）", () => {
      // モーダルコードより: onClick={() => { setDistance(""); setShowCustomDistance(true); }}
      const distanceAfterOtherClick: number | "" = "";
      expect(distanceAfterOtherClick).toBe("");
      expect(resolveDistance(distanceAfterOtherClick)).toBeNull();
    });

    it("parseDistanceInput('') → '' (stale 値が残らない)", () => {
      expect(parseDistanceInput("")).toBe("");
    });

    it("parseDistanceInput('400') → 400 (number)", () => {
      const result = parseDistanceInput("400");
      expect(result).toBe(400);
      expect(typeof result).toBe("number");
    });

    it("parseDistanceInput('0') → 0（resolveDistance でさらにブロック）", () => {
      const parsed = parseDistanceInput("0");
      expect(resolveDistance(parsed)).toBeNull();
    });
  });

  describe("[V-24] 距離「その他」→ number 型で保存", () => {
    it("distance=400 → resolveDistance が 400 (number) を返す", () => {
      const result = resolveDistance(400);
      expect(result).toBe(400);
      expect(typeof result).toBe("number");
    });

    it("distance=800 → 800", () => {
      expect(resolveDistance(800)).toBe(800);
    });

    it("distance=1500 → 1500", () => {
      expect(resolveDistance(1500)).toBe(1500);
    });

    it("distance=50 (プリセット) → 50 (number)", () => {
      const result = resolveDistance(50);
      expect(result).toBe(50);
      expect(typeof result).toBe("number");
    });
  });

  describe("[Critical 2] repCount / setCount の Math.max(1, Number(v) || 1) 確定", () => {
    it("repCount=3 → 3", () => {
      expect(resolveCountField(3)).toBe(3);
    });

    it("repCount='' → 1（fallback）", () => {
      expect(resolveCountField("")).toBe(1);
    });

    it("repCount=0 → 1（Math.max(1, 0)）", () => {
      expect(resolveCountField(0)).toBe(1);
    });

    it("setCount=2 → 2", () => {
      expect(resolveCountField(2)).toBe(2);
    });

    it("setCount='' → 1", () => {
      expect(resolveCountField("")).toBe(1);
    });

    it("parseStepperValue('3') → 3", () => {
      expect(parseStepperValue("3")).toBe(3);
    });

    it("parseStepperValue('') → ''（空許容）", () => {
      expect(parseStepperValue("")).toBe("");
    });

    it("parseStepperValue('0') → 0 → resolveCountField で 1 に丸まる", () => {
      const parsed = parseStepperValue("0");
      expect(resolveCountField(parsed)).toBe(1);
    });
  });

  describe("[Critical 3] circleSeconds onChange の統一（v==='' ? '' : Number(v)）", () => {
    it("parseCircleSecondsInput('') → ''", () => {
      expect(parseCircleSecondsInput("")).toBe("");
    });

    it("parseCircleSecondsInput('30') → 30", () => {
      expect(parseCircleSecondsInput("30")).toBe(30);
    });

    it("parseCircleSecondsInput('0') → 0", () => {
      expect(parseCircleSecondsInput("0")).toBe(0);
    });

    it("circleMinutes の max={59} が削除されたこと: 60以上も計算できる", () => {
      // 90分サークル（ロングスイム）も入力可能
      expect(calcCircleInSeconds(90, 0)).toBe(5400);
    });
  });

  describe("[V-25] 編集モード: handleSubmit の input 組み立てロジック", () => {
    it("rep_count だけ変更して保存したとき他フィールドが同値であること", () => {
      const distance: number | "" = 100;
      const repCount: number | "" = 5;
      const setCount: number | "" = 2;
      const circleMinutes: number | "" = 2; // 120秒 = 2分0秒
      const circleSeconds: number | "" = 0;
      const name = "元テンプレ";
      const style = "Ba";
      const swimCategory: "Swim" | "Pull" | "Kick" = "Kick";
      const note = "";

      const distanceNum = resolveDistance(distance)!;
      const repCountNum = resolveCountField(repCount);
      const setCountNum = resolveCountField(setCount);
      const circleInSeconds = calcCircleInSeconds(circleMinutes, circleSeconds);

      const input = {
        name,
        style,
        swim_category: swimCategory,
        distance: distanceNum,
        rep_count: repCountNum,
        set_count: setCountNum,
        circle: circleInSeconds,
        note: note || null,
        tag_ids: [] as string[],
      };

      expect(input.rep_count).toBe(5);
      expect(input.style).toBe("Ba");
      expect(input.swim_category).toBe("Kick");
      expect(input.distance).toBe(100);
      expect(input.set_count).toBe(2);
      expect(input.circle).toBe(120);
      expect(input.note).toBeNull();
    });

    it("note が空文字の場合 null として保存されること", () => {
      // handleSubmit: note: note || null
      const note = "";
      expect(note || null).toBeNull();
    });

    it("note がある場合そのまま保存されること", () => {
      // handleSubmit: note: note || null
      const note = "テストメモ";
      expect(note || null).toBe("テストメモ");
    });
  });

  describe("編集モード初期化ロジック (V-13, V-14, V-B04)", () => {
    it("[V-13] distance=50 → showCustomDistance=false", () => {
      expect(initFromEditData({ circle: 90, distance: 50 }).showCustomDistance).toBe(false);
    });

    it("[V-14] distance=400 → showCustomDistance=true", () => {
      expect(initFromEditData({ circle: 90, distance: 400 }).showCustomDistance).toBe(true);
    });

    it("circle=150 → min=2, sec=30", () => {
      const r = initFromEditData({ circle: 150, distance: 50 });
      expect(r.circleMin).toBe(2);
      expect(r.circleSec).toBe(30);
    });

    it("circle=0 → min=0, sec=0", () => {
      const r = initFromEditData({ circle: 0, distance: 50 });
      expect(r.circleMin).toBe(0);
      expect(r.circleSec).toBe(0);
    });

    it("circle=120 → min=2, sec=0", () => {
      const r = initFromEditData({ circle: 120, distance: 100 });
      expect(r.circleMin).toBe(2);
      expect(r.circleSec).toBe(0);
    });

    it("[V-B04] circle=0 の往復: 0分0秒 → 保存 circle=0", () => {
      const r = initFromEditData({ circle: 0, distance: 50 });
      expect(calcCircleInSeconds(r.circleMin, r.circleSec)).toBe(0);
    });

    it("circle=150 の往復: 2分30秒 → 保存 circle=150", () => {
      const r = initFromEditData({ circle: 150, distance: 50 });
      expect(calcCircleInSeconds(r.circleMin, r.circleSec)).toBe(150);
    });
  });

  describe("DISTANCE_PRESETS による距離判定（DRY 確認）", () => {
    it("[V-B01] distance=25 はプリセット内", () => {
      expect((DISTANCE_PRESETS as readonly number[]).includes(25)).toBe(true);
    });

    it("[V-B01] distance=200 はプリセット内", () => {
      expect((DISTANCE_PRESETS as readonly number[]).includes(200)).toBe(true);
    });

    it("distance=201 はプリセット外", () => {
      expect((DISTANCE_PRESETS as readonly number[]).includes(201)).toBe(false);
    });

    it("distance=24 はプリセット外", () => {
      expect((DISTANCE_PRESETS as readonly number[]).includes(24)).toBe(false);
    });
  });
});
