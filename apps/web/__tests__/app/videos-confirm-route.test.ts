// QA Phase B (W-1, 0行検出): 動画確定 API /api/storage/videos/confirm の
// 「RLS 不一致による 0 行 UPDATE を loud に 500 で弾く」不変条件を、実ルートハンドラ
// (route.ts の POST) を直接呼び出して検証する。
//
// トートロジー回避: 0 行検出ロジックを再実装せず、実ハンドラをそのまま import し、
// 依存 (auth / premium / thumbnail upload / supabase update) を vi.mock で差し替える。
// supabase の .update().eq().select() が返す行数だけを変え、ステータスコードを観測する。
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- 依存モジュールのモック ----
const authenticateApiRequest = vi.fn();
vi.mock("@/lib/auth-api", () => ({
  authenticateApiRequest: (...args: unknown[]) => authenticateApiRequest(...args),
}));

vi.mock("@/lib/r2-video", () => ({
  uploadThumbnailToR2: vi.fn().mockResolvedValue(undefined),
}));

// authz は別テスト (video-authz.test.ts) で網羅済み。ここでは ok:true を返させ、
// DB 更新 0 行/1 行の分岐に集中する。
vi.mock("@/lib/video-authz", () => ({
  authorizeRecordVideoMutation: vi.fn().mockResolvedValue({ ok: true }),
  authorizePracticeLogVideoMutation: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock("@/i18n/routing", () => ({
  localeFromReferer: vi.fn().mockReturnValue("ja"),
}));

vi.mock("@swim-hub/shared/utils/premium", () => ({
  checkIsPremium: vi.fn().mockReturnValue(true),
}));

vi.mock("@swim-hub/shared/constants/premium", () => ({
  PREMIUM_ERROR_CODE: "PREMIUM_REQUIRED",
}));

import { POST } from "@/app/api/storage/videos/confirm/route";

// ---- supabase フェイク: update().eq().select() の返却行数を制御 ----
// それ以外 (user_subscriptions の single) は premium 用のダミーを返す。
function makeSupabase(updateRows: { id: string }[] | null, updateError: unknown = null) {
  return {
    from(table: string) {
      if (table === "user_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { plan: "premium", status: "active", cancel_at_period_end: false, premium_expires_at: null, trial_end: null },
                  error: null,
                }),
            }),
          }),
        };
      }
      // records / practice_logs の UPDATE 経路
      return {
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: updateRows, error: updateError }),
          }),
        }),
      };
    },
  };
}

function makeRequest(type: "record" | "practice-log") {
  const fd = new FormData();
  fd.append("type", type);
  fd.append("id", "target-id");
  fd.append("videoPath", "videos/u/records/target-id.mp4");
  // thumbnailPath 空 → サムネアップロードはスキップ (R2 呼び出し回避)
  fd.append("thumbnailPath", "");
  return {
    headers: { get: () => null },
    formData: () => Promise.resolve(fd),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/storage/videos/confirm — 0 行検出", () => {
  it("record: UPDATE が 1 行 → 200 success", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase([{ id: "target-id" }]),
    });
    const res = await POST(makeRequest("record"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("record: UPDATE が 0 行 (RLS 不一致) → 500 (無音 false-success を弾く)", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase([]),
    });
    const res = await POST(makeRequest("record"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success?: boolean };
    expect(body.success).toBeUndefined();
  });

  it("record: UPDATE が null データ → 500", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase(null),
    });
    const res = await POST(makeRequest("record"));
    expect(res.status).toBe(500);
  });

  it("practice-log: UPDATE が 1 行 → 200 success", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase([{ id: "target-id" }]),
    });
    const res = await POST(makeRequest("practice-log"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("practice-log: UPDATE が 0 行 (RLS 不一致) → 500", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase([]),
    });
    const res = await POST(makeRequest("practice-log"));
    expect(res.status).toBe(500);
  });

  it("practice-log: UPDATE error → 500", async () => {
    authenticateApiRequest.mockResolvedValue({
      user: { id: "coach" },
      supabase: makeSupabase(null, { message: "db error" }),
    });
    const res = await POST(makeRequest("practice-log"));
    expect(res.status).toBe(500);
  });

  it("未認証 → 401 (0 行検出以前にブロック)", async () => {
    authenticateApiRequest.mockResolvedValue(null);
    const res = await POST(makeRequest("record"));
    expect(res.status).toBe(401);
  });
});
