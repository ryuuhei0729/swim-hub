/**
 * validateRedirectPath (src/web/validateRedirectPath.ts) の単体テスト。
 *
 * Sprint Contract: OAuth/メール確認コールバックの redirect_to クエリパラメータを
 * 検証・サニタイズし、オープンリダイレクトを防止する。defaultPath は呼び出し元
 * (各アプリ) が渡す第2引数であり、関数内にハードコードされた値ではない
 * (3アプリで遷移先が異なるため呼び出し元が指定する — swim-hub は "/dashboard"、
 * scanner/timer は "/" またはロケール付きパス)。
 *
 * 移植元: swim-hub/apps/web/app/api/auth/callback/route.ts,
 * swimhub-scanner・swimhub-timer の同等 route.ts の validateRedirectPath
 * (ロジックは byte-identical。defaultPath のハードコード値のみ各アプリで
 * 異なっていたものを引数化して統合した)。
 *
 * 制御文字を含むテスト入力は String.fromCharCode() で組み立てる (ソースファイル中に
 * 生の制御バイトを直接埋め込むと git diff や一部エディタで文字化け・
 * バイナリ扱いされるリスクがあるため、意図的に避けている)。
 */
import { describe, it, expect } from "vitest";
import { validateRedirectPath } from "../../src/web/validateRedirectPath";

const DEFAULT_PATH = "/dashboard";
const ORIGIN = "http://localhost:3000";

describe("validateRedirectPath — 空値 (V-52, V-53)", () => {
  it("[V-52] redirectTo が null の場合は defaultPath を返す", () => {
    expect(validateRedirectPath(null, DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });

  it("[V-53] redirectTo が空文字の場合は defaultPath を返す", () => {
    expect(validateRedirectPath("", DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — デコード失敗 (V-54)", () => {
  it("[V-54] decodeURIComponent が失敗する不正なエンコード文字列は defaultPath を返す", () => {
    expect(validateRedirectPath("%E0%A4%A", DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — scheme 付き URL の拒否 (V-55)", () => {
  it.each(["http://evil.com", "https://evil.com", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])(
    "[V-55] scheme 付き URL '%s' は defaultPath を返す",
    (input) => {
      expect(validateRedirectPath(input, DEFAULT_PATH)).toBe(DEFAULT_PATH);
    },
  );
});

describe("validateRedirectPath — プロトコル相対 URL の拒否 (V-56)", () => {
  it("[V-56] '//evil.com' はプロトコル相対 URL として defaultPath を返す", () => {
    expect(validateRedirectPath("//evil.com", DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — '/' で始まらないパスの拒否 (V-57)", () => {
  it("[V-57] '/' で始まらない相対パスは defaultPath を返す", () => {
    expect(validateRedirectPath("relative/path", DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — 制御文字の拒否 (V-58)", () => {
  const CONTROL_CHAR_CASES: Array<[label: string, charCode: number]> = [
    ["LF (0x0A)", 0x0a],
    ["CR (0x0d)", 0x0d],
    ["NUL (0x00)", 0x00],
    ["TAB (0x09)", 0x09],
    ["DEL (0x7f)", 0x7f],
    ["C1 制御文字 (0x9f)", 0x9f],
  ];

  it.each(CONTROL_CHAR_CASES)("[V-58] %s を含むパスは defaultPath を返す", (_label, charCode) => {
    const input = `/foo${String.fromCharCode(charCode)}bar`;
    expect(validateRedirectPath(input, DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — パストラバーサルの拒否 (V-59)", () => {
  it("[V-59] '..' を含むパスは defaultPath を返す", () => {
    expect(validateRedirectPath("/foo/../../etc/passwd", DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });
});

describe("validateRedirectPath — origin 指定時の同一オリジン確認 (V-60, V-61)", () => {
  it("[V-60] origin 指定時、バックスラッシュ正規化トリック ('/' + backslash + 'evil.com') で別オリジンに解決される場合は defaultPath を返す", () => {
    // new URL("/\\evil.com", "http://localhost:3000") は WHATWG URL の仕様上
    // バックスラッシュがスラッシュとして正規化され http://evil.com/ に解決される
    // (プロトコル相対チェック startsWith("//") はこの入力をすり抜けるため、
    // 最後の防波堤である origin 照合が実際に機能することを固定する)。
    const input = "/" + "\\" + "evil.com";
    expect(new URL(input, ORIGIN).origin).not.toBe(ORIGIN); // 前提の裏付け
    expect(validateRedirectPath(input, DEFAULT_PATH, ORIGIN)).toBe(DEFAULT_PATH);
  });

  it("[V-60] origin 指定時、resolvedUrl の origin が一致すれば許可される", () => {
    expect(validateRedirectPath("/team/join", DEFAULT_PATH, ORIGIN)).toBe("/team/join");
  });

  it("[V-61] origin を省略した場合は同一オリジン確認をスキップする (バックスラッシュトリックであっても他の検証さえ通れば許可されてしまう既知の緩和仕様)", () => {
    // 単一オリジンで完結する呼び出し元 (origin を渡さない実装) では、この
    // バックスラッシュトリックに対する防御が同一オリジン確認だけである点に注意。
    // origin を省略できる設計そのものは Sprint Contract で承認済み (PM承認の
    // 設計判断) だが、その場合にこの入力が素通りするという実際の挙動を
    // 明文化しておく (Reviewer/将来の変更者への警告を兼ねる)。
    const input = "/" + "\\" + "evil.com";
    expect(validateRedirectPath(input, DEFAULT_PATH)).toBe(input);
  });
});

describe("validateRedirectPath — 正当なパスの許可 (V-62)", () => {
  it("[V-62] 検証を通過した相対パスはデコード済みの値をそのまま返す", () => {
    expect(validateRedirectPath("/team/join", DEFAULT_PATH, ORIGIN)).toBe("/team/join");
  });

  it("[V-62] 二重エンコードされたパスもデコード後の値で検証され、正当なら許可される", () => {
    const input = encodeURIComponent("/team/join?ref=abc");
    expect(validateRedirectPath(input, DEFAULT_PATH, ORIGIN)).toBe("/team/join?ref=abc");
  });

  it("[V-62] クエリパラメータ・ハッシュを含む正当なパスも許可される", () => {
    expect(validateRedirectPath("/settings?tab=billing#top", DEFAULT_PATH, ORIGIN)).toBe(
      "/settings?tab=billing#top",
    );
  });
});
