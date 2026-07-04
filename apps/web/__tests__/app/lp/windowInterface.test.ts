/**
 * LP v4.2 — Window インターフェース型テスト
 *
 * Sprint Contract 検証観点:
 *   [V-06] `window.__stopStopwatch` が型レベルで定義されていること
 *          （global.d.ts に `Window.__stopStopwatch?: () => void` が追加されている）
 *
 * 検証手段: [type-check] — ファイル存在確認 + 型アノテーション文字列検証
 *
 * Developer への要求:
 *   `types/global.d.ts`（または `types/lp.d.ts` 等の任意パス）に以下を追加すること:
 *
 *   ```ts
 *   declare global {
 *     interface Window {
 *       __stopStopwatch?: () => void;
 *     }
 *   }
 *   ```
 *
 *   NOTE: TypeScript の型チェックは `pnpm -C swim-hub/apps/web exec tsc --noEmit` で
 *         確認するため、このテストはファイル内容の文字列確認に留める。
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const TYPES_DIR = path.resolve(__dirname, "../../../types");
const WEB_ROOT = path.resolve(__dirname, "../../..");

describe("Window.__stopStopwatch 型定義", () => {
  it("types/ 配下またはプロジェクトルートに __stopStopwatch の型定義がある", () => {
    // types/ ディレクトリ内の全 .d.ts / .ts ファイルを走査
    const candidateFiles = [
      ...fs.readdirSync(TYPES_DIR).map((f) => path.join(TYPES_DIR, f)),
      path.join(WEB_ROOT, "global.d.ts"),
    ].filter((f) => f.endsWith(".d.ts") || f.endsWith(".ts"));

    const found = candidateFiles.some((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        return content.includes("__stopStopwatch");
      } catch {
        return false;
      }
    });

    expect(
      found,
      "types/ 内または global.d.ts に __stopStopwatch の型定義が見つかりません"
    ).toBe(true);
  });
});
