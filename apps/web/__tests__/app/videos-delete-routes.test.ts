// QA Phase B (C-1 追加検証): 動画削除 API /api/storage/videos/record と
// /api/storage/videos/practice-log の DELETE ハンドラを、実ルートハンドラを直接
// 呼び出して検証する。
//
// 観点:
//   1. authz (authorizeRecordVideoMutation / authorizePracticeLogVideoMutation) が
//      ok:false を返す場合、DB更新/R2削除いずれよりも前に authz.status で早期
//      リターンすること。
//   2. authz は ok:true だが、実際の DB UPDATE が 0 行になった場合
//      (退会済み (is_active=false) メンバーが自分の過去ログを更新しようとするケース等。
//      practice_logs の SELECT ポリシーが team active member でない対象行を候補として
//      可視化しないため、WITH CHECK に到達する前に 0 件になる。実測は
//      supabase/tests/05_atomic_usage_rpc_and_video_authz.test.sql の H-1 参照)、
//      DELETE ルートは DB 更新を R2 削除より先に行い .select() で影響行数を確認する
//      ため、0 行なら R2 には一切触れず 409 を返す (「R2だけ消えてDBは不整合」という
//      不可逆な破壊を防ぐ不変条件)。
//   3. DB 更新が成功して初めて R2 削除が呼ばれること (実行順序そのものを固定するのでは
//      なく、「R2 削除は DB 更新確定後にのみ発生する」という観測可能な不変条件を検証する)。
//
// トートロジー回避: ロジックを再実装せず実ハンドラ (DELETE) を import し、
// 依存 (authenticateApiRequest / video-authz / deleteVideosFromR2) のみを
// vi.mock で差し替える。supabase の update().eq().select() が返す行数を制御し、
// 観測可能なレスポンス / R2 削除呼び出しの有無のみを見る。
import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateApiRequest = vi.fn();
vi.mock("@/lib/auth-api", () => ({
  authenticateApiRequest: (...args: unknown[]) => authenticateApiRequest(...args),
}));

const authorizeRecordVideoMutation = vi.fn();
const authorizePracticeLogVideoMutation = vi.fn();
vi.mock("@/lib/video-authz", () => ({
  authorizeRecordVideoMutation: (...args: unknown[]) => authorizeRecordVideoMutation(...args),
  authorizePracticeLogVideoMutation: (...args: unknown[]) =>
    authorizePracticeLogVideoMutation(...args),
}));

const deleteVideosFromR2 = vi.fn();
vi.mock("@/lib/r2-video", () => ({
  deleteVideosFromR2: (...args: unknown[]) => deleteVideosFromR2(...args),
}));

import { DELETE as deleteRecordVideo } from "@/app/api/storage/videos/record/route";
import { DELETE as deletePracticeLogVideo } from "@/app/api/storage/videos/practice-log/route";

function makeSupabase(opts: {
  selectRow: { video_path: string | null; video_thumbnail_path: string | null } | null;
  updateRows?: { id: string }[] | null;
  updateError?: unknown;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve(
              opts.selectRow
                ? { data: opts.selectRow, error: null }
                : { data: null, error: { message: "not found" } },
            ),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () =>
            Promise.resolve({
              data: opts.updateRows ?? [{ id: "updated" }],
              error: opts.updateError ?? null,
            }),
        }),
      }),
    }),
  };
}

function makeRequest(url: string) {
  return { url } as unknown as Parameters<typeof deleteRecordVideo>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateApiRequest.mockResolvedValue({
    user: { id: "caller-uid" },
    supabase: makeSupabase({
      selectRow: { video_path: "videos/rec1.mp4", video_thumbnail_path: null },
    }),
  });
});

describe("DELETE /api/storage/videos/record", () => {
  it("authz が ok:false (403) の場合、DB更新/R2削除いずれよりも前に 403 を返し、R2 削除を一切呼ばない", async () => {
    authorizeRecordVideoMutation.mockResolvedValue({
      ok: false,
      status: 403,
      error: "権限がありません",
    });

    const res = await deleteRecordVideo(
      makeRequest("http://localhost/api/storage/videos/record?recordId=rec1"),
    );

    expect(res.status).toBe(403);
    expect(deleteVideosFromR2).not.toHaveBeenCalled();
  });

  it("authz が ok:true かつ DB UPDATE が正常に完了する (1行) 場合、200 success を返し R2 が削除される (回帰)", async () => {
    authorizeRecordVideoMutation.mockResolvedValue({ ok: true });

    const res = await deleteRecordVideo(
      makeRequest("http://localhost/api/storage/videos/record?recordId=rec1"),
    );

    expect(res.status).toBe(200);
    expect(deleteVideosFromR2).toHaveBeenCalledWith(["videos/rec1.mp4"]);
  });

  it("authz が ok:true でも DB UPDATE がエラーを返す場合、500 を返し R2 削除は呼ばれない", async () => {
    authorizeRecordVideoMutation.mockResolvedValue({ ok: true });
    authenticateApiRequest.mockResolvedValue({
      user: { id: "caller-uid" },
      supabase: makeSupabase({
        selectRow: { video_path: "videos/rec1.mp4", video_thumbnail_path: null },
        updateError: { message: "db error" },
      }),
    });

    const res = await deleteRecordVideo(
      makeRequest("http://localhost/api/storage/videos/record?recordId=rec1"),
    );

    expect(res.status).toBe(500);
    expect(deleteVideosFromR2).not.toHaveBeenCalled();
  });

  it("authz は ok:true だが DB UPDATE が 0 行 (RLS 不一致等) の場合、409 を返し R2 削除は一切呼ばれない " +
    "(R2 だけ消えて DB が不整合になる不可逆な破壊を防ぐ不変条件)", async () => {
    authorizeRecordVideoMutation.mockResolvedValue({ ok: true });
    authenticateApiRequest.mockResolvedValue({
      user: { id: "caller-uid" },
      supabase: makeSupabase({
        selectRow: { video_path: "videos/rec1.mp4", video_thumbnail_path: null },
        updateRows: [],
      }),
    });

    const res = await deleteRecordVideo(
      makeRequest("http://localhost/api/storage/videos/record?recordId=rec1"),
    );

    expect(res.status).toBe(409);
    expect(deleteVideosFromR2).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/storage/videos/practice-log", () => {
  it("authz が ok:false (403) の場合、DB更新/R2削除いずれよりも前に 403 を返し、R2 削除を一切呼ばない", async () => {
    authorizePracticeLogVideoMutation.mockResolvedValue({
      ok: false,
      status: 403,
      error: "権限がありません",
    });
    authenticateApiRequest.mockResolvedValue({
      user: { id: "caller-uid" },
      supabase: makeSupabase({
        selectRow: { video_path: "videos/log1.mp4", video_thumbnail_path: null },
      }),
    });

    const res = await deletePracticeLogVideo(
      makeRequest("http://localhost/api/storage/videos/practice-log?practiceLogId=log1"),
    );

    expect(res.status).toBe(403);
    expect(deleteVideosFromR2).not.toHaveBeenCalled();
  });

  it("authz が ok:true かつ DB UPDATE が正常に完了する (1行) 場合、200 success を返し R2 が削除される (回帰)", async () => {
    authorizePracticeLogVideoMutation.mockResolvedValue({ ok: true });
    authenticateApiRequest.mockResolvedValue({
      user: { id: "caller-uid" },
      supabase: makeSupabase({
        selectRow: { video_path: "videos/log1.mp4", video_thumbnail_path: null },
      }),
    });

    const res = await deletePracticeLogVideo(
      makeRequest("http://localhost/api/storage/videos/practice-log?practiceLogId=log1"),
    );

    expect(res.status).toBe(200);
    expect(deleteVideosFromR2).toHaveBeenCalledWith(["videos/log1.mp4"]);
  });

  it("[C-1 修正確認] authz は ok:true (log.user_id===callerId で「本人」許可) だが、実際の DB UPDATE が " +
    "0 行になり得るケース (退会済み (is_active=false) メンバーが自分の過去ログを更新しようとする場合等。" +
    "practice_logs の SELECT ポリシーが team active member でない対象行を候補として可視化しないため、" +
    "WITH CHECK に到達する前に 0 件になる。pgTAP 05_atomic_usage_rpc_and_video_authz.test.sql の " +
    "H-1 で実測済み)。この場合、ルートは DB 更新を R2 削除より先に行い 0 行検出で 409 を返すため、R2 の" +
    "動画ファイルには一切触れない (削除済みのはずのファイルが残るだけで、DB とファイルの不整合は起きない)。", async () => {
      authorizePracticeLogVideoMutation.mockResolvedValue({ ok: true });
      authenticateApiRequest.mockResolvedValue({
        user: { id: "caller-uid" },
        supabase: makeSupabase({
          selectRow: { video_path: "videos/log1.mp4", video_thumbnail_path: null },
          // 実際の挙動の再現: 退会済みメンバーの過去ログ等、SELECT ポリシーにより対象行が
          // 可視化されず、認可通過後も UPDATE の対象行が0件になり得るケースのモック。
          updateRows: [],
        }),
      });

      const res = await deletePracticeLogVideo(
        makeRequest("http://localhost/api/storage/videos/practice-log?practiceLogId=log1"),
      );

      expect(res.status).toBe(409);
      // 不変条件の核心: DB更新が確認できるまで R2 のファイルには一切触れない
      expect(deleteVideosFromR2).not.toHaveBeenCalled();
    });

  it("authz が ok:true でも DB UPDATE がエラーを返す場合、500 を返し R2 削除は呼ばれない", async () => {
    authorizePracticeLogVideoMutation.mockResolvedValue({ ok: true });
    authenticateApiRequest.mockResolvedValue({
      user: { id: "caller-uid" },
      supabase: makeSupabase({
        selectRow: { video_path: "videos/log1.mp4", video_thumbnail_path: null },
        updateError: { message: "db error" },
      }),
    });

    const res = await deletePracticeLogVideo(
      makeRequest("http://localhost/api/storage/videos/practice-log?practiceLogId=log1"),
    );

    expect(res.status).toBe(500);
    expect(deleteVideosFromR2).not.toHaveBeenCalled();
  });
});
