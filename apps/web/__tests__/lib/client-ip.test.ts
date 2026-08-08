// QA Phase B — 再検証 (Reviewer 指摘): apps/web/lib/client-ip.ts の単体テストが1件も
// 存在しなかった (contact-route.test.ts は getClientIp を丸ごと vi.mock、
// rate-limit.test.ts は reserveContactSubmission だけを見ている)。
//
// M-2 でレート制限を回避しようとする攻撃者が最も直接触る部分であるにも関わらず、
// どのテストからも検証されていなかったため、モックを一切使わず実装を直接検証する。
//
// 検証観点:
//   - CF-Connecting-IP が X-Forwarded-For より優先される
//   - X-Forwarded-For が複数値 (カンマ区切り) の場合に正しく先頭を取り、trim される
//   - 全ヘッダー欠落時に null を返す (V6 の核心: null 以外を返すと固定バケット共有=相互DoS)
//   - ヘッダー偽装 (空文字・空白のみ・複数行・不正形式) の挙動
//
// 【追記】この初回検証で実際に「空文字ヘッダーが null にフォールバックしない」バグを発見し、
// 担当Aが修正した (apps/web/lib/client-ip.ts 参照)。修正後、以下のテストは「バグの挙動を
// pin する」ものから「V6 契約を守っていることを検証する」ものに書き換えてある。
// 教訓: 調査中に「観測した挙動をそのまま pin する」テストと「あるべき契約を検証する」
// テストを混在させないこと。前者はバグ修正後に必ず後者へ昇格させる。
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/client-ip";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers,
  });
}

describe("getClientIp — モック無しの直接検証 (Reviewer 指摘の穴埋め)", () => {
  describe("優先順位: CF-Connecting-IP > X-Forwarded-For > X-Real-IP > null", () => {
    it("CF-Connecting-IP のみ → その値を返す", () => {
      const req = makeRequest({ "CF-Connecting-IP": "203.0.113.10" });
      expect(getClientIp(req)).toBe("203.0.113.10");
    });

    it("CF-Connecting-IP と X-Forwarded-For の両方がある場合、CF-Connecting-IP が優先される (攻撃者が X-Forwarded-For を偽装してもレート制限を回避できないことの核心)", () => {
      const req = makeRequest({
        "CF-Connecting-IP": "203.0.113.10",
        "X-Forwarded-For": "198.51.100.99, 10.0.0.1",
      });
      expect(getClientIp(req)).toBe("203.0.113.10");
    });

    it("CF-Connecting-IP が無く X-Forwarded-For のみ → X-Forwarded-For を使う", () => {
      const req = makeRequest({ "X-Forwarded-For": "198.51.100.20" });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("CF-Connecting-IP も X-Forwarded-For も無く X-Real-IP のみ → X-Real-IP を使う", () => {
      const req = makeRequest({ "X-Real-IP": "192.0.2.55" });
      expect(getClientIp(req)).toBe("192.0.2.55");
    });

    it("X-Forwarded-For と X-Real-IP の両方がある場合、X-Forwarded-For が優先される", () => {
      const req = makeRequest({
        "X-Forwarded-For": "198.51.100.20",
        "X-Real-IP": "192.0.2.55",
      });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });
  });

  describe("X-Forwarded-For の複数値処理 (カンマ区切り + trim)", () => {
    it("複数値 (クライアント, プロキシ1, プロキシ2) の場合、先頭 (実クライアント側) を取る", () => {
      const req = makeRequest({ "X-Forwarded-For": "198.51.100.20, 10.0.0.1, 10.0.0.2" });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("先頭値の前後に空白があっても trim される", () => {
      const req = makeRequest({ "X-Forwarded-For": "  198.51.100.20  , 10.0.0.1" });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("カンマの直後にスペースが無くても正しく分割される", () => {
      const req = makeRequest({ "X-Forwarded-For": "198.51.100.20,10.0.0.1" });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });
  });

  describe("V6 の核心: 全ヘッダー欠落時は null (固定キー共有=相互DoS を避ける)", () => {
    it("CF-Connecting-IP / X-Forwarded-For / X-Real-IP のいずれも無い場合、null を返す", () => {
      const req = makeRequest({});
      expect(getClientIp(req)).toBeNull();
    });

    it("無関係なヘッダーだけがある場合も null を返す", () => {
      const req = makeRequest({ "User-Agent": "QA-Test/1.0", "Content-Type": "application/json" });
      expect(getClientIp(req)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 修正後の再検証 (担当A): これらは「バグを pin する」テストから「V6 契約を守って
  // いることを検証する」テストに昇格させたもの。修正前はこの4件がバグを検出して
  // FAIL していた (= QA が発見し、担当Aが実装側を直した)。挙動をそのまま記録する
  // ("観測した値を pin する") テストと、契約を検証するテストは混在させないこと。
  // ---------------------------------------------------------------------------
  describe("空文字ヘッダーでも null / 次の優先ヘッダーへ正しくフォールバックする (V6 契約の検証)", () => {
    it("X-Forwarded-For が空文字の場合、(他に有効なヘッダーが無ければ) null にフォールバックする", () => {
      const req = makeRequest({ "X-Forwarded-For": "" });
      // 空文字は「値がある」ではなく「取得不能」として扱われ、null になる。
      // hashIp("") という空文字IP専用の固定バケットが生まれない (V6 の核心)。
      expect(getClientIp(req)).toBeNull();
    });

    it("X-Forwarded-For が空白のみの場合も、trim 後に空とみなされ null にフォールバックする", () => {
      const req = makeRequest({ "X-Forwarded-For": "   " });
      expect(getClientIp(req)).toBeNull();
    });

    it("CF-Connecting-IP が空文字の場合、X-Forwarded-For の値が正しく使われる (最優先ヘッダーが空でもフォールバックが発動する証拠)", () => {
      const req = makeRequest({
        "CF-Connecting-IP": "",
        "X-Forwarded-For": "198.51.100.20",
      });
      // CF-Connecting-IP が空文字 (falsy) なので、truthy チェックによって
      // 正しく次の X-Forwarded-For にフォールバックし、その値が採用される。
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("X-Forwarded-For の先頭要素が空 (\",1.2.3.4\") の場合、2番目の要素にはフォールバックせず null になる (設計判断: 「先頭が空なら2番目を見る」という独自ルールは意図的に入れていない。XFF はクライアントが完全に偽装できるヘッダーであり、特別ルールを追加しても安全性上の意味は薄いため)", () => {
      const req = makeRequest({ "X-Forwarded-For": ",198.51.100.20" });
      // 先頭要素 ("") が空なので X-Forwarded-For 全体を「使えない」と判定し、
      // 2番目の要素 (198.51.100.20) へは進まず、次のヘッダー (X-Real-IP) → null と
      // フォールバックする (この例では X-Real-IP も無いので null)。
      expect(getClientIp(req)).toBeNull();
    });

    it("X-Forwarded-For の先頭要素が空でも、X-Real-IP が有効なら X-Real-IP にフォールバックする", () => {
      const req = makeRequest({
        "X-Forwarded-For": ",198.51.100.20",
        "X-Real-IP": "192.0.2.77",
      });
      expect(getClientIp(req)).toBe("192.0.2.77");
    });
  });

  describe("trim 対応 (担当A追加分): CF-Connecting-IP / X-Real-IP も前後の空白を trim する", () => {
    it("CF-Connecting-IP の前後に空白があっても trim される", () => {
      const req = makeRequest({ "CF-Connecting-IP": "  203.0.113.10  " });
      expect(getClientIp(req)).toBe("203.0.113.10");
    });

    it("X-Real-IP の前後に空白があっても trim される (CF-Connecting-IP・X-Forwarded-For が無い場合)", () => {
      const req = makeRequest({ "X-Real-IP": "  192.0.2.55  " });
      expect(getClientIp(req)).toBe("192.0.2.55");
    });

    it("CF-Connecting-IP が空白のみの場合、trim 後に空とみなされ X-Forwarded-For にフォールバックする", () => {
      const req = makeRequest({
        "CF-Connecting-IP": "   ",
        "X-Forwarded-For": "198.51.100.20",
      });
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("X-Real-IP が空白のみの場合、trim 後に空とみなされ null になる (他のヘッダーが無い場合)", () => {
      const req = makeRequest({ "X-Real-IP": "   " });
      expect(getClientIp(req)).toBeNull();
    });
  });

  describe("ヘッダー偽装・異常値の挙動 (実装の穴を探す)", () => {
    it("IP 形式でない文字列がヘッダーに入っていても、バリデーションせずそのまま返す (実装に形式検証は無い)", () => {
      const req = makeRequest({ "X-Forwarded-For": "not-an-ip-address" });
      expect(getClientIp(req)).toBe("not-an-ip-address");
    });

    it("X-Forwarded-For に CRLF (ヘッダーインジェクション相当) を含む値は Headers API 自体が構築時に拒否する (getClientIp 到達前にブロックされる)", () => {
      // 実測: Fetch 標準の Headers 実装 (Next.js の NextRequest が内部で使う) は
      // ヘッダー値内の CRLF を "invalid header value" として構築時に例外にする。
      // つまりこのクラスのインジェクションは getClientIp のロジックに到達する前に
      // プラットフォーム層で防がれる (ここでは実際に起きる例外を記録する)。
      // 注意: これは JS の Headers/fetch API を経由した場合の挙動であり、Cloudflare
      // Workers が生の HTTP リクエストをどこまで正規化してから Headers オブジェクトを
      // 構築するかはこのテストの範囲外 (プラットフォーム側の責務)。
      expect(() =>
        makeRequest({ "X-Forwarded-For": "203.0.113.1\r\nX-Injected: evil" }),
      ).toThrow(/invalid header value/i);
    });

    it("同名ヘッダーが複数回送られた場合 (Headers.append)、Fetch 標準に従いカンマ結合された1つの値として扱われる", () => {
      const headers = new Headers();
      headers.append("X-Forwarded-For", "198.51.100.20");
      headers.append("X-Forwarded-For", "10.0.0.1");
      const req = new NextRequest("http://localhost/api/contact", { method: "POST", headers });
      // Headers.append で同名キーを複数回設定すると ", " 区切りで自動結合されるのが
      // Fetch 標準の挙動。結合後の先頭要素 (実クライアント側) が取得できることを確認する。
      expect(getClientIp(req)).toBe("198.51.100.20");
    });

    it("非常に長い X-Forwarded-For (多数のプロキシ経由を偽装) でも先頭だけを正しく取り、クラッシュしない", () => {
      const many = Array.from({ length: 200 }, (_, i) => `10.0.0.${i % 256}`).join(", ");
      const req = makeRequest({ "X-Forwarded-For": `203.0.113.99, ${many}` });
      expect(getClientIp(req)).toBe("203.0.113.99");
    });
  });
});
