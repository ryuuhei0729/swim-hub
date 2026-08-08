// QA Phase B — Sprint Contract V8 (M-2: 生IPがハッシュ化されて RPC に渡る)
//
// V8: 生 IP が reserve_contact_submission RPC の引数に一切現れないこと。
// トートロジー回避: hashIp() をモックせず実際に Web Crypto (crypto.subtle) で
// ハッシュ化させ、実際に RPC へ渡された引数を検査する。
import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom テスト環境は `window` を持つため "server-only" パッケージが
// クライアントコンポーネント扱いで throw する。lib/rate-limit.ts の
// 冒頭 `import "server-only"` を無害化する (M-9 の server-only 追加と同種の対処)。
vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();
const singleMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (...args: unknown[]) => {
      rpcMock(...args);
      return { single: () => singleMock() };
    },
  })),
}));

import { reserveContactSubmission } from "@/lib/rate-limit";

const RAW_IP = "203.0.113.55";

beforeEach(() => {
  vi.clearAllMocks();
  singleMock.mockResolvedValue({ data: { allowed: true, remaining: 9 }, error: null });
});

describe("reserveContactSubmission — M-2 (V8)", () => {
  it("V8: RPC 呼び出しの引数に生IPがそのまま含まれていない", async () => {
    await reserveContactSubmission(RAW_IP);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("reserve_contact_submission");
    const serializedArgs = JSON.stringify(rpcArgs);
    expect(serializedArgs).not.toContain(RAW_IP);
    expect(serializedArgs).not.toContain("203.0.113");
  });

  it("V8: p_ip_hash は SHA-256 ハッシュ (64桁hex) であり、同じIPからは決定的に同じ値になる", async () => {
    await reserveContactSubmission(RAW_IP);
    const firstHash = (rpcMock.mock.calls[0][1] as { p_ip_hash: string }).p_ip_hash;

    rpcMock.mockClear();
    await reserveContactSubmission(RAW_IP);
    const secondHash = (rpcMock.mock.calls[0][1] as { p_ip_hash: string }).p_ip_hash;

    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe(RAW_IP);
  });

  it("V8: 異なるIPは異なるハッシュになる (バケット分離の前提)", async () => {
    await reserveContactSubmission("203.0.113.55");
    const hashA = (rpcMock.mock.calls[0][1] as { p_ip_hash: string }).p_ip_hash;

    rpcMock.mockClear();
    await reserveContactSubmission("198.51.100.10");
    const hashB = (rpcMock.mock.calls[0][1] as { p_ip_hash: string }).p_ip_hash;

    expect(hashA).not.toBe(hashB);
  });

  it("RPC が allowed:true を返せば allowed: true を伝播する", async () => {
    singleMock.mockResolvedValue({ data: { allowed: true, remaining: 3 }, error: null });
    const result = await reserveContactSubmission(RAW_IP);
    expect(result).toEqual({ allowed: true, remaining: 3 });
  });

  it("RPC が allowed:false を返せば allowed: false を伝播する (429 の元)", async () => {
    singleMock.mockResolvedValue({ data: { allowed: false, remaining: 0 }, error: null });
    const result = await reserveContactSubmission(RAW_IP);
    expect(result).toEqual({ allowed: false, remaining: 0 });
  });

  it("RPC がエラーを返すと throw する (呼び出し元 route.ts の try/catch で 500 に落ちる想定)", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    await expect(reserveContactSubmission(RAW_IP)).rejects.toBeTruthy();
  });
});
