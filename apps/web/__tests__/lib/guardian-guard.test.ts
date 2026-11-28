// =============================================================================
// lib/guardian-guard.ts — 保護者アカウントの書き込みを API ルートで止める
// =============================================================================
//
//   [GG-1] 承認済み・現役の guardian membership があれば保護者と判定する (DB の is_guardian_user と同じ条件)
//   [GG-2] 該当が無ければ保護者ではない
//   [GG-3] 問い合わせに失敗したら通さない (例外を投げ、ルート側の catch で 500 になる)
//   [GG-4] rejectIfGuardian は保護者なら 403 + code GUARDIAN_READ_ONLY、そうでなければ null
//
// vitest.setup.ts はこのモジュールを「保護者ではない」でモックしているので、ここでは実物を使う。
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/lib/guardian-guard");

const query = vi.hoisted(() => ({
  result: { data: [] as unknown[] | null, error: null as unknown },
  calls: [] as Array<[string, ...unknown[]]>,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: vi.fn(() => {
    const builder = {
      select: (...args: unknown[]) => {
        query.calls.push(["select", ...args]);
        return builder;
      },
      eq: (...args: unknown[]) => {
        query.calls.push(["eq", ...args]);
        return builder;
      },
      limit: (...args: unknown[]) => {
        query.calls.push(["limit", ...args]);
        return Promise.resolve(query.result);
      },
    };
    return {
      from: (table: string) => {
        query.calls.push(["from", table]);
        return builder;
      },
    };
  }),
}));

import { isGuardianUser, rejectIfGuardian } from "@/lib/guardian-guard";

describe("guardian-guard", () => {
  beforeEach(() => {
    query.result = { data: [], error: null };
    query.calls = [];
  });

  it("[GG-1] 承認済み・現役の guardian membership があれば保護者", async () => {
    query.result = { data: [{ id: "tm-1" }], error: null };

    await expect(isGuardianUser("user-1")).resolves.toBe(true);
    expect(query.calls).toEqual(
      expect.arrayContaining([
        ["from", "team_memberships"],
        ["eq", "user_id", "user-1"],
        ["eq", "role", "guardian"],
        ["eq", "status", "approved"],
        ["eq", "is_active", true],
      ]),
    );
  });

  it("[GG-2] 該当が無ければ保護者ではない", async () => {
    query.result = { data: [], error: null };
    await expect(isGuardianUser("user-1")).resolves.toBe(false);
  });

  it("[GG-3] 問い合わせに失敗したら例外を投げる (通さない)", async () => {
    query.result = { data: null, error: { message: "db down" } };
    await expect(isGuardianUser("user-1")).rejects.toEqual({ message: "db down" });
  });

  it("[GG-4] 保護者なら 403 と GUARDIAN_READ_ONLY を返す", async () => {
    query.result = { data: [{ id: "tm-1" }], error: null };

    const response = await rejectIfGuardian("user-1");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    await expect(response!.json()).resolves.toMatchObject({ code: "GUARDIAN_READ_ONLY" });
  });

  it("[GG-4] 保護者でなければ null (ルートはそのまま続行する)", async () => {
    query.result = { data: [], error: null };
    await expect(rejectIfGuardian("user-1")).resolves.toBeNull();
  });
});
