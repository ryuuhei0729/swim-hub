// QA Phase B — Sprint Contract V1/V2/V3
// /api/storage/videos/confirm の M-4 パス突合 (team-assign/route.ts と同型) を検証する。
//
// V1: 正常な videoPath/thumbnailPath であれば従来通り 200 で成功する。
// V2: videoPath を他人の user_id prefix に改ざんすると 400 になり、
//     かつ R2 アップロードも DB 更新も一度も呼ばれていないこと (副作用の呼び出し回数で確認)。
// V3: thumbnailPath のみ改ざんでも 400 になる。
//
// トートロジー回避: route.ts のパス構築ロジックをテスト側で再実装せず、実ハンドラを
// そのまま import し、authz/R2/DB 呼び出しをスパイして「呼ばれていない」ことを検証する。
import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateApiRequest = vi.fn();
vi.mock("@/lib/auth-api", () => ({
  authenticateApiRequest: (...args: unknown[]) => authenticateApiRequest(...args),
}));

const uploadThumbnailToR2 = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/r2-video", () => ({
  uploadThumbnailToR2: (...args: unknown[]) => uploadThumbnailToR2(...args),
}));

const authorizeRecordVideoMutation = vi.fn().mockResolvedValue({ ok: true });
const authorizePracticeLogVideoMutation = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/video-authz", () => ({
  authorizeRecordVideoMutation: (...args: unknown[]) => authorizeRecordVideoMutation(...args),
  authorizePracticeLogVideoMutation: (...args: unknown[]) => authorizePracticeLogVideoMutation(...args),
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

const USER_ID = "user-123";
const OTHER_USER_ID = "attacker-999";
const RECORD_ID = "record-abc";

// updateSpy: records/practice_logs への .update() が呼ばれたかどうかを検証する
const updateSpy = vi.fn();

function makeSupabase() {
  return {
    from(table: string) {
      if (table === "user_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    plan: "premium",
                    status: "active",
                    cancel_at_period_end: false,
                    premium_expires_at: null,
                    trial_end: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        update: (payload: unknown) => {
          updateSpy(table, payload);
          return {
            eq: () => ({
              select: () => Promise.resolve({ data: [{ id: RECORD_ID }], error: null }),
            }),
          };
        },
      };
    },
  };
}

function makeRequest(opts: {
  type: "record" | "practice-log";
  id: string;
  videoPath: string;
  thumbnailPath?: string;
  thumbnailBlob?: File | null;
}) {
  const fd = new FormData();
  fd.append("type", opts.type);
  fd.append("id", opts.id);
  fd.append("videoPath", opts.videoPath);
  if (opts.thumbnailPath !== undefined) {
    fd.append("thumbnailPath", opts.thumbnailPath);
  }
  if (opts.thumbnailBlob) {
    fd.append("thumbnailBlob", opts.thumbnailBlob);
  }
  return {
    headers: { get: () => null },
    formData: () => Promise.resolve(fd),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateApiRequest.mockResolvedValue({
    user: { id: USER_ID },
    supabase: makeSupabase(),
  });
});

describe("POST /api/storage/videos/confirm — M-4 パス突合 (V1/V2/V3)", () => {
  it("V1: 正しい videoPath/thumbnailPath なら 200 で成功する (record)", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${USER_ID}/records/${RECORD_ID}.jpg`,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("V1: 正しい videoPath なら 200 で成功する (practice-log)", async () => {
    const res = await POST(
      makeRequest({
        type: "practice-log",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/practice-logs/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${USER_ID}/practice-logs/${RECORD_ID}.jpg`,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("V1: thumbnailPath が空文字 (サムネ生成失敗) でも videoPath が正しければ成功する", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: "",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("V2: videoPath を他人の user_id prefix に改ざんすると 400", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${OTHER_USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${USER_ID}/records/${RECORD_ID}.jpg`,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "不正なファイルパスです" });
  });

  it("V2: videoPath に ../ トラバーサルを混入すると 400", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/../${OTHER_USER_ID}/records/${RECORD_ID}.mp4`,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("V2: videoPath の id を別レコードの id に差し替えると 400", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/records/other-record-id.mp4`,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("V2: 改ざんパスで 400 を返すとき、authz / R2アップロード / DB update が一度も呼ばれていない", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${OTHER_USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${OTHER_USER_ID}/records/${RECORD_ID}.jpg`,
        thumbnailBlob: new File(["fake"], "thumb.jpg", { type: "image/jpeg" }),
      }),
    );
    expect(res.status).toBe(400);
    // 副作用ゼロであることが V2 の核心: 400 が返ることだけでは不十分。
    expect(authorizeRecordVideoMutation).not.toHaveBeenCalled();
    expect(authorizePracticeLogVideoMutation).not.toHaveBeenCalled();
    expect(uploadThumbnailToR2).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("V3: thumbnailPath のみ改ざん (videoPath は正しい) でも 400 になり副作用が起きない", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${OTHER_USER_ID}/records/${RECORD_ID}.jpg`,
        thumbnailBlob: new File(["fake"], "thumb.jpg", { type: "image/jpeg" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "不正なファイルパスです" });
    expect(uploadThumbnailToR2).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("V3: thumbnailPath が別 record の id に差し替えられていても 400", async () => {
    const res = await POST(
      makeRequest({
        type: "record",
        id: RECORD_ID,
        videoPath: `videos/${USER_ID}/records/${RECORD_ID}.mp4`,
        thumbnailPath: `thumbnails/${USER_ID}/records/other-record-id.jpg`,
      }),
    );
    expect(res.status).toBe(400);
  });

  // Reviewer 指摘 (任意項目3): `type` の想定外値についての回帰検知。
  // 実装は `prefix = type === "record" ? "records" : "practice-logs"` および authz の
  // 分岐 (`type === "record"`) が完全に同じ条件式なので、"record" 以外の値は常に
  // "practice-log" 相当として扱われ一貫性が保たれる (= バイパスにはならない、実害なし)。
  // 将来この分岐が変更された際に一貫性が崩れたことを検知するための回帰テストとして追加する。
  it("type が想定外の文字列 (\"foo\") でも、practice-logs prefix として一貫して扱われ、正しいパスなら成功する", async () => {
    const fd = new FormData();
    fd.append("type", "foo");
    fd.append("id", RECORD_ID);
    fd.append("videoPath", `videos/${USER_ID}/practice-logs/${RECORD_ID}.mp4`);
    const req = {
      headers: { get: () => null },
      formData: () => Promise.resolve(fd),
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("type が想定外の文字列 (\"foo\") で records prefix のパスを渡すと 400 になる (practice-logs 一貫性の裏付け)", async () => {
    const fd = new FormData();
    fd.append("type", "foo");
    fd.append("id", RECORD_ID);
    fd.append("videoPath", `videos/${USER_ID}/records/${RECORD_ID}.mp4`);
    const req = {
      headers: { get: () => null },
      formData: () => Promise.resolve(fd),
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("type が大文字違い (\"RECORD\") の場合、\"record\" とは厳密文字列比較で不一致になり practice-logs 相当として扱われる (大文字小文字を無視した緩い比較になっていないことの回帰検知)", async () => {
    const fd = new FormData();
    fd.append("type", "RECORD");
    fd.append("id", RECORD_ID);
    fd.append("videoPath", `videos/${USER_ID}/practice-logs/${RECORD_ID}.mp4`);
    const req = {
      headers: { get: () => null },
      formData: () => Promise.resolve(fd),
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("type/id/videoPath 未指定は 400 (既存の必須パラメータチェック)", async () => {
    const fd = new FormData();
    const req = {
      headers: { get: () => null },
      formData: () => Promise.resolve(fd),
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "type, id, videoPath が必要です" });
  });
});
