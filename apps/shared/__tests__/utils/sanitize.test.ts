import { describe, expect, it } from "vitest";

import { escapeHtml, sanitizeTextInput, validateMaxLength } from "../../utils/sanitize";

describe("sanitize", () => {
  describe("escapeHtml", () => {
    describe("正常系", () => {
      it("通常のテキストはそのまま返す", () => {
        expect(escapeHtml("Hello World")).toBe("Hello World");
        expect(escapeHtml("テスト文字列")).toBe("テスト文字列");
        expect(escapeHtml("123")).toBe("123");
      });

      it("空文字はそのまま返す", () => {
        expect(escapeHtml("")).toBe("");
      });
    });

    describe("HTML特殊文字のエスケープ", () => {
      it("&をエスケープする", () => {
        expect(escapeHtml("A & B")).toBe("A &amp; B");
        expect(escapeHtml("&&")).toBe("&amp;&amp;");
      });

      it("<をエスケープする", () => {
        expect(escapeHtml("a < b")).toBe("a &lt; b");
        expect(escapeHtml("<<")).toBe("&lt;&lt;");
      });

      it(">をエスケープする", () => {
        expect(escapeHtml("a > b")).toBe("a &gt; b");
        expect(escapeHtml(">>")).toBe("&gt;&gt;");
      });

      it("ダブルクォートをエスケープする", () => {
        expect(escapeHtml('"test"')).toBe("&quot;test&quot;");
      });

      it("シングルクォートをエスケープする", () => {
        expect(escapeHtml("'test'")).toBe("&#039;test&#039;");
      });

      it("複数の特殊文字を同時にエスケープする", () => {
        expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
          "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;",
        );
      });
    });

    describe("XSS攻撃パターンの防御", () => {
      it("scriptタグをエスケープする", () => {
        const malicious = '<script>alert("XSS")</script>';
        const escaped = escapeHtml(malicious);

        expect(escaped).not.toContain("<script>");
        expect(escaped).not.toContain("</script>");
        expect(escaped).toBe("&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;");
      });

      it("imgタグのonerrorをエスケープする", () => {
        const malicious = '<img src="x" onerror="alert(\'XSS\')">';
        const escaped = escapeHtml(malicious);

        expect(escaped).not.toContain("<img");
        expect(escaped).toBe(
          "&lt;img src=&quot;x&quot; onerror=&quot;alert(&#039;XSS&#039;)&quot;&gt;",
        );
      });

      it("JavaScriptプロトコルをエスケープする", () => {
        const malicious = "<a href=\"javascript:alert('XSS')\">Click</a>";
        const escaped = escapeHtml(malicious);

        expect(escaped).not.toContain("<a");
        expect(escaped).toContain("&lt;a");
      });

      it("イベントハンドラを含むタグをエスケープする", () => {
        const malicious = "<div onclick=\"alert('XSS')\">Click me</div>";
        const escaped = escapeHtml(malicious);

        // HTMLタグがエスケープされることを確認
        expect(escaped).not.toContain("<div");
        expect(escaped).toContain("&lt;div");
        // onclick属性は残るが、<div>タグがエスケープされているので実行されない
        expect(escaped).toBe(
          "&lt;div onclick=&quot;alert(&#039;XSS&#039;)&quot;&gt;Click me&lt;/div&gt;",
        );
      });
    });
  });

  describe("sanitizeTextInput", () => {
    describe("正常系", () => {
      it("通常のテキストは空白トリムとエスケープを行う", () => {
        expect(sanitizeTextInput("  Hello World  ")).toBe("Hello World");
        expect(sanitizeTextInput("\n\tTest\n\t")).toBe("Test");
      });

      it("空文字は空文字を返す", () => {
        expect(sanitizeTextInput("")).toBe("");
        expect(sanitizeTextInput("   ")).toBe("");
      });
    });

    describe("最大長の制限", () => {
      it("デフォルトの最大長（500文字）を超えると切り詰められる", () => {
        const longText = "a".repeat(600);
        const result = sanitizeTextInput(longText);

        expect(result.length).toBe(500);
      });

      it("カスタム最大長を指定できる", () => {
        const longText = "a".repeat(100);
        const result = sanitizeTextInput(longText, 50);

        expect(result.length).toBe(50);
      });

      it("最大長以内のテキストはそのまま", () => {
        const text = "a".repeat(100);
        const result = sanitizeTextInput(text, 200);

        expect(result.length).toBe(100);
      });
    });

    describe("HTMLエスケープとトリムの組み合わせ", () => {
      it("空白トリム後にHTMLエスケープを行う", () => {
        const result = sanitizeTextInput("  <script>  ");
        expect(result).toBe("&lt;script&gt;");
      });

      it("最大長制限後にHTMLエスケープを行う", () => {
        // 最大長を5に設定して'<scr'で切れる
        const result = sanitizeTextInput("<script>", 4);
        expect(result).toBe("&lt;scr");
      });
    });

    describe("実際のユースケース", () => {
      it("ユーザーのコメント入力をサニタイズする", () => {
        const userInput = '  素晴らしい泳ぎでした！<script>alert("XSS")</script>  ';
        const result = sanitizeTextInput(userInput);

        expect(result).toBe(
          "素晴らしい泳ぎでした！&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;",
        );
        expect(result).not.toContain("<script>");
      });

      it("練習メモの入力をサニタイズする", () => {
        const memo = "  今日の練習：100m×10本 サークル1'30\"  ";
        const result = sanitizeTextInput(memo);

        expect(result).toBe("今日の練習：100m×10本 サークル1&#039;30&quot;");
      });
    });
  });

  describe("validateMaxLength", () => {
    describe("正常系", () => {
      it("最大長以内ならtrueを返す", () => {
        expect(validateMaxLength("test", 10)).toBe(true);
        expect(validateMaxLength("a".repeat(100), 100)).toBe(true);
        expect(validateMaxLength("", 10)).toBe(true);
      });

      it("最大長を超えるとfalseを返す", () => {
        expect(validateMaxLength("test", 3)).toBe(false);
        expect(validateMaxLength("a".repeat(101), 100)).toBe(false);
      });
    });

    describe("境界値", () => {
      it("ちょうど最大長の場合はtrueを返す", () => {
        expect(validateMaxLength("12345", 5)).toBe(true);
      });

      it("最大長+1の場合はfalseを返す", () => {
        expect(validateMaxLength("123456", 5)).toBe(false);
      });

      it("最大長0の場合、空文字のみtrue", () => {
        expect(validateMaxLength("", 0)).toBe(true);
        expect(validateMaxLength("a", 0)).toBe(false);
      });
    });

    describe("日本語文字列", () => {
      it("日本語文字列の長さを正しく計算する", () => {
        expect(validateMaxLength("あいうえお", 5)).toBe(true);
        expect(validateMaxLength("あいうえお", 4)).toBe(false);
      });

      it("絵文字を含む文字列の長さを計算する", () => {
        // JavaScriptでは絵文字は2文字としてカウントされることがある
        const emoji = "🏊";
        expect(validateMaxLength(emoji, 2)).toBe(true);
      });
    });
  });
});
