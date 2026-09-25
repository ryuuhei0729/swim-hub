// =============================================================================
// slideUpModalSheetBottomInset.test.ts
// =============================================================================
//
// `components/ui/SlideUpModal.tsx` は下端に貼り付くボトムシート
// (overlay は justifyContent:"flex-end") を描画するが、シートの下端余白は
// **一切面倒を見ない** (sheet スタイルは width:"100%" のみ)。
//
// 一方 Android は Expo SDK 55 / `android/gradle.properties` の
// `edgeToEdgeEnabled=true` により Edge-to-Edge が強制され、RN の
// `ReactModalHostView.kt` のカスタム getter
// (`navigationBarTranslucent: get() = field || isEdgeToEdgeFeatureFlagOn`) 経由で
// **RN Modal の Dialog ウィンドウも edge-to-edge になる (自動回避しない)**。
// つまりシート下端はシステムナビゲーションバー (3ボタン = 48dp) の裏に潜る。
//
// したがって各呼び出し側が自分で bottom inset を消費しなければならず、
// 実績のある書き方は次の2つだけ:
//
//   パターンA: シート内のフッターを `<SafeAreaView edges={["bottom"]}>` で包む
//   パターンB: `getSafeFooterPadding(base, insets.bottom)` を
//              sheetStyle / 内側スクロール要素の余白に加算する
//
// **`paddingBottom: 16` のような固定値だけのシートは両方とも満たさない。**
// これは grep では「余白がある」ように見えるため静かに見逃される
// (実際 `TeamEntryBulkFormScreen` の種目選択シートは 2026-08-12 から
// 固定 16 のままで、2026-09-08 の Edge-to-Edge 一斉棚卸しも取りこぼした。
// あの棚卸しは「フッター固定」と「ScrollView 最下段」の2バケツで探したが、
// フッターを持たずシート自身に paddingBottom を直書きするシートは
// どちらのバケツにも入らなかった)。
//
// このテストは `<SlideUpModal ...>` 〜 `</SlideUpModal>` の**インスタンス単位**で
// ソースを読み、パターンA / パターンB のいずれかが領域内に現れることを検証する。
//
// ミューテーション確認方法: 任意のインスタンスの sheetStyle から
// `getSafeFooterPadding(...)` を外す (= 固定値スタイル単体に戻す) と、
// そのインスタンスが offender として報告され赤になる。

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "../..");

/** 走査対象。SlideUpModal を使いうる JSX ディレクトリ。 */
const SCAN_DIRS = ["screens", "components"];

const EXCLUDED_DIR_NAMES = new Set(["__tests__", "__mocks__", "node_modules"]);

/** SlideUpModal の定義元自身は検査対象外 (下端余白は呼び出し側の責務)。 */
const DEFINITION_FILE = path.join("components", "ui", "SlideUpModal.tsx");

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      results.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.tsx$/.test(entry) && !/\.(test|spec)\.tsx$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * `<SlideUpModal` 〜 対応する `</SlideUpModal>` までの領域を切り出す。
 *
 * 開始タグの照合に `[\s>]` を要求するのは、`React.FC<SlideUpModalProps>` の
 * `<SlideUpModalProps` を誤検出しないため (定義元ファイルを除外していても、
 * 型を re-export する別ファイルが現れたときに静かに誤検出しうる)。
 * 現状ネストした SlideUpModal は存在しないため、最も近い閉じタグで足りる。
 */
function extractSlideUpModalRegions(source: string): { line: number; body: string }[] {
  const regions: { line: number; body: string }[] = [];
  const openRe = /<SlideUpModal[\s>]/g;
  for (const match of source.matchAll(openRe)) {
    const start = match.index ?? 0;
    const closeAt = source.indexOf("</SlideUpModal>", start);
    // 閉じタグが無い = 自己閉じ or 構文崩れ。検査できないので「余白なし」と同義に扱わず、
    // 領域をファイル末尾までとして保守的に判定する。
    const end = closeAt === -1 ? source.length : closeAt;
    regions.push({
      line: source.slice(0, start).split("\n").length,
      body: source.slice(start, end),
    });
  }
  return regions;
}

/** パターンA (SafeAreaView edges bottom) またはパターンB (getSafeFooterPadding)。 */
function consumesBottomInset(regionBody: string): boolean {
  if (regionBody.includes("getSafeFooterPadding")) return true;
  return /edges=\{\[[^\]]*["']bottom["'][^\]]*\]\}/.test(regionBody);
}

describe("Edge-to-Edge: SlideUpModal シートの下端インセット", () => {
  const files = SCAN_DIRS.flatMap((d) => collectSourceFiles(path.join(APP_ROOT, d)));

  const instances = files.flatMap((file) => {
    const relative = path.relative(APP_ROOT, file);
    if (relative === DEFINITION_FILE) return [];
    return extractSlideUpModalRegions(readFileSync(file, "utf8")).map((region) => ({
      location: `${relative}:${region.line}`,
      body: region.body,
    }));
  });

  it("SlideUpModal のインスタンスが実際に見つかっている (空走査で緑になるのを防ぐ)", () => {
    // 2026-09-25 時点で13インスタンス。将来の増減に耐えるよう下限だけを固定する
    // (0件や1件しか拾えていない = 正規表現が壊れた、を検出するのが目的)。
    expect(instances.length).toBeGreaterThanOrEqual(10);
  });

  it("すべての SlideUpModal が SafeAreaView(bottom) か getSafeFooterPadding で下端インセットを消費している", () => {
    const offenders = instances
      .filter((instance) => !consumesBottomInset(instance.body))
      .map((instance) => instance.location);

    expect(
      offenders,
      "Android edge-to-edge では RN Modal も自動回避しないため、シートの固定 " +
        "paddingBottom だけではシステムナビゲーションバーに埋没する。" +
        'sheetStyle に `getSafeFooterPadding(base, insets.bottom)` を重ねるか、' +
        'シート内フッターを `<SafeAreaView edges={["bottom"]}>` で包むこと:\n' +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
