// QA Phase B — Sprint Contract V5/V6/V7 (M-2: /api/contact のレート制限)
//
// V5: 同一IPから 11 件目が 429
// V6: 別IPは影響を受けない / IP 取得不能時は制限されず通る
// V7: 正常な問い合わせが従来通り成功しメール送信される
//
// トートロジー回避: 実ルートハンドラ (POST) を import し、
// reserveContactSubmission (RPC 層) と getClientIp のみをモックする。
// レート制限そのものの原子性/RPC呼び出しの正しさは rate-limit.test.ts で別途検証する。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const reserveContactSubmission = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  reserveContactSubmission: (...args: unknown[]) => reserveContactSubmission(...args),
}));

const getClientIp = vi.fn();
vi.mock("@/lib/client-ip", () => ({
  getClientIp: (...args: unknown[]) => getClientIp(...args),
}));

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: (...args: unknown[]) => insertMock(...args) }),
  })),
}));

const sendContactNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/resend", () => ({
  sendContactNotification: (...args: unknown[]) => sendContactNotification(...args),
}));

import { POST } from "@/app/api/contact/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  name: "Taro Yamada",
  email: "taro@example.com",
  subject: "お問い合わせ",
  message: "テストメッセージです",
};

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  sendContactNotification.mockResolvedValue(undefined);
});

describe("POST /api/contact — M-2 レート制限 (V5/V6/V7)", () => {
  it("V7: 正常な問い合わせが従来通り成功し、メール送信される", async () => {
    getClientIp.mockReturnValue("203.0.113.10");
    reserveContactSubmission.mockResolvedValue({ allowed: true, remaining: 9 });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendContactNotification).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("V5: 同一IPで allowed=false (11件目相当) が返ると 429 になる", async () => {
    getClientIp.mockReturnValue("203.0.113.10");
    reserveContactSubmission.mockResolvedValue({ allowed: false, remaining: 0 });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(429);
    // 上限超過時は DB insert / メール送信に到達しない
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendContactNotification).not.toHaveBeenCalled();
  });

  it("V6: 別IPは reserveContactSubmission に別の値で渡され、互いに影響しない", async () => {
    getClientIp.mockReturnValue("198.51.100.20");
    reserveContactSubmission.mockResolvedValue({ allowed: true, remaining: 9 });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(reserveContactSubmission).toHaveBeenCalledWith("198.51.100.20");
  });

  it("V6: IP 取得不能 (null) の場合はレート制限自体を呼ばずに通す", async () => {
    getClientIp.mockReturnValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    // reserveContactSubmission 自体が呼ばれていない = 固定キー共有バケットに
    // フォールバックしていないことの証拠 (相互DoS回避)
    expect(reserveContactSubmission).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("V6: reserveContactSubmission が例外を投げても IP null 時は影響を受けない (制御フロー確認)", async () => {
    getClientIp.mockReturnValue(null);
    reserveContactSubmission.mockRejectedValue(new Error("should not be called"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(reserveContactSubmission).not.toHaveBeenCalled();
  });

  it("必須フィールド (name) が空だと 400 (レート制限より前段のバリデーション)", async () => {
    getClientIp.mockReturnValue("203.0.113.10");
    const res = await POST(makeRequest({ ...VALID_BODY, name: "" }));
    expect(res.status).toBe(400);
    expect(reserveContactSubmission).not.toHaveBeenCalled();
  });
});
