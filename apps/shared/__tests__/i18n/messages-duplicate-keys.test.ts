/**
 * shared/messages 重複キー検出テスト
 *
 * `JSON.parse` は同一オブジェクト内の重複キーを「後勝ち」で黙って上書きするため、
 * import 済み JSON を検証する既存テスト (messages-coverage.test.ts 等) では
 * 重複キーを検出できない。実際に forms.tag.searchPlaceholder の二重定義が
 * 全ゲートを素通りし、web 用の翻訳が消えるリグレッションが発生した。
 *
 * 本テストは生の JSON 文字列を走査し、各オブジェクトスコープ内の
 * キー重複を検出する。5言語すべての messages ファイルを対象とする。
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.resolve(__dirname, "../../messages");
const LOCALES = ["ja", "en", "ko", "zh", "de"] as const;

interface DuplicateKey {
  /** 重複キーのドット区切りパス (例: "forms.tag.searchPlaceholder") */
  path: string;
  /** 2回目の定義が現れた行番号 (1始まり) */
  line: number;
}

/**
 * 生の JSON 文字列を走査し、同一オブジェクト内で重複定義されたキーを返す。
 * 文字列リテラル (エスケープ含む) を正しくスキップし、オブジェクトのネストを
 * スタックで追跡する。
 */
function findDuplicateKeys(rawJson: string): DuplicateKey[] {
  const duplicates: DuplicateKey[] = [];

  interface Frame {
    type: "object" | "array";
    keys: Set<string>;
    /** このフレーム内で最後に読んだキー (子フレームのパス構築用) */
    currentKey: string | null;
    /** 次に現れる文字列がキーかどうか (object フレームのみ) */
    expectKey: boolean;
  }

  const stack: Frame[] = [];
  let line = 1;
  let i = 0;

  while (i < rawJson.length) {
    const ch = rawJson[i];

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    if (ch === '"') {
      // 文字列リテラルを読み切る (エスケープ対応)
      let j = i + 1;
      let str = "";
      while (j < rawJson.length) {
        const c = rawJson[j];
        if (c === "\\") {
          str += rawJson[j] + (rawJson[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (c === '"') break;
        if (c === "\n") line++;
        str += c;
        j++;
      }
      const top = stack[stack.length - 1];
      if (top && top.type === "object" && top.expectKey) {
        if (top.keys.has(str)) {
          // 親パス = 自フレームを除く各フレームの currentKey
          const parentPath = stack
            .slice(0, -1)
            .map((f) => f.currentKey)
            .filter((k): k is string => k !== null)
            .join(".");
          duplicates.push({
            path: parentPath ? `${parentPath}.${str}` : str,
            line,
          });
        }
        top.keys.add(str);
        top.currentKey = str;
        top.expectKey = false;
      }
      i = j + 1;
      continue;
    }

    if (ch === "{") {
      stack.push({ type: "object", keys: new Set(), currentKey: null, expectKey: true });
      i++;
      continue;
    }
    if (ch === "[") {
      stack.push({ type: "array", keys: new Set(), currentKey: null, expectKey: false });
      i++;
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      i++;
      continue;
    }
    if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top && top.type === "object") {
        top.expectKey = true;
      }
      i++;
      continue;
    }

    i++;
  }

  return duplicates;
}

describe("shared/messages duplicate key detection", () => {
  // 検出器自体の妥当性チェック (トートロジー防止):
  // 既知の重複を含むフィクスチャで必ず検出できること
  describe("findDuplicateKeys detector sanity", () => {
    it("同一オブジェクト内の重複キーを検出する", () => {
      const fixture = `{
        "forms": {
          "tag": {
            "searchPlaceholder": "a",
            "other": "b",
            "searchPlaceholder": "c"
          }
        }
      }`;
      const result = findDuplicateKeys(fixture);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("forms.tag.searchPlaceholder");
    });

    it("異なるオブジェクトスコープの同名キーは重複としない", () => {
      const fixture = `{
        "a": { "searchPlaceholder": "x" },
        "b": { "searchPlaceholder": "y" }
      }`;
      expect(findDuplicateKeys(fixture)).toEqual([]);
    });

    it("エスケープ文字を含む文字列値を誤ってキー扱いしない", () => {
      const fixture = `{
        "a": "quote \\" and colon : inside",
        "b": { "c": "line1\\nline2", "c2": "{brace}" }
      }`;
      expect(findDuplicateKeys(fixture)).toEqual([]);
    });

    it("配列内のオブジェクトの重複キーも検出する", () => {
      const fixture = `{ "list": [ { "k": 1, "k": 2 } ] }`;
      const result = findDuplicateKeys(fixture);
      expect(result).toHaveLength(1);
    });
  });

  it.each(LOCALES)("%s.json has no duplicate keys within any object scope", (locale) => {
    const raw = fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf-8");
    const duplicates = findDuplicateKeys(raw);
    expect(
      duplicates,
      `${locale}.json contains duplicate keys (later definition silently wins on JSON.parse):\n${duplicates
        .map((d) => `  ${d.path} (line ${d.line})`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
