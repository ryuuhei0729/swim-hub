// Mini-Sprint QA: /api/storage/profile の POST を「旧画像削除→アップロード」から
// 「アップロード成功→旧画像削除」に入れ替える修正の検証。
// (前回 QA が Info、Reviewer が Warning とした「アップロード失敗時にアバターが消失し得る」
// 既存欠陥の根治。今回は Web Developer が実装し、QA が独立に route ハンドラを検証する)
//
// トートロジー回避: videos-confirm-route.test.ts の手法に倣い、削除順序・除外ロジックを
// 再実装せず、実ルートハンドラ (route.ts の POST) をそのまま import し、
// 依存 (auth-api / r2 / supabase storage) のみ vi.mock で差し替える。
//
// 検証観点:
//   [R2-1]  R2分岐: アップロード成功 → 新旧プレフィックス両方の旧ファイルが削除され、{path} が返る
//   [R2-2]  R2分岐: uploadToR2 reject → deleteMultipleFromR2 が呼ばれず、500 (旧アバター無傷の核心)
//   [R2-3]  R2分岐: アップロード成功後の deleteMultipleFromR2 reject → それでも 200 + {path} (非致命)
//   [R2-4]  R2分岐: 削除対象リストがアップロード前にキャプチャされる (list→upload→delete の順序)
//   [SB-1]  Supabase分岐: uploadError のとき remove は実行されず、500
//   [SB-2]  Supabase分岐: remove が失敗しても 200 + {path} (非致命)
//   [SB-3]  Supabase分岐: list→upload→remove の順序でキャプチャが先に行われる
//   [VAL-1〜4] バリデーション回帰スモーク (未認証401/ファイルなし400/不正content-type400/サイズ超過400)
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- 依存モジュールのモック ----
const authenticateApiRequest = vi.fn();
vi.mock("@/lib/auth-api", () => ({
  authenticateApiRequest: (...args: unknown[]) => authenticateApiRequest(...args),
}));

const isR2Enabled = vi.fn();
const uploadToR2 = vi.fn();
const listR2Objects = vi.fn();
const deleteMultipleFromR2 = vi.fn();
vi.mock("@/lib/r2", () => ({
  isR2Enabled: (...args: unknown[]) => isR2Enabled(...args),
  uploadToR2: (...args: unknown[]) => uploadToR2(...args),
  listR2Objects: (...args: unknown[]) => listR2Objects(...args),
  deleteMultipleFromR2: (...args: unknown[]) => deleteMultipleFromR2(...args),
}));

import { POST } from "@/app/api/storage/profile/route";

const USER_ID = "user-1";

/**
 * route.ts が file から実際に読む面 (size/type/name/arrayBuffer) だけを満たす最小フェイク。
 * jsdom 環境の File/FormData 実装は Blob 以外を append すると文字列化する等、実 File の
 * ラウンドトリップに癖があるため (arrayBuffer が失われる等)、request.formData() 自体を
 * 直接モックして FormData/File の実装差異を回避する。
 */
function makeFileLike(
  overrides: Partial<{ name: string; type: string; size: number }> = {},
): { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> } {
  const { name = "avatar.jpg", type = "image/jpeg", size = 4 } = overrides;
  return {
    name,
    type,
    size,
    arrayBuffer: async () => new ArrayBuffer(size),
  };
}

function makeRequest(
  file: ReturnType<typeof makeFileLike> | null | undefined = makeFileLike(),
) {
  return {
    formData: () =>
      Promise.resolve({
        get: (key: string) => (key === "file" ? (file ?? null) : null),
      }),
  } as unknown as Parameters<typeof POST>[0];
}

function makeSupabaseStorage(opts: {
  listData?: Array<{ name: string }> | null;
  uploadError?: unknown;
  removeError?: unknown;
}) {
  const list = vi.fn().mockResolvedValue({ data: opts.listData ?? [], error: null });
  const upload = vi.fn().mockResolvedValue({ error: opts.uploadError ?? null });
  const remove = vi.fn().mockResolvedValue({ error: opts.removeError ?? null });
  const from = vi.fn(() => ({ list, upload, remove }));
  return { supabase: { storage: { from } }, spies: { list, upload, remove, from } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/storage/profile — R2分岐", () => {
  beforeEach(() => {
    isR2Enabled.mockReturnValue(true);
  });

  it("[R2-1] アップロード成功 → 新旧プレフィックス両方の旧ファイルが削除され、{path} が返る", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    listR2Objects.mockImplementation((prefix: string) => {
      if (prefix === `profile-images/${USER_ID}/`) {
        return Promise.resolve([`profile-images/${USER_ID}/old-new-prefix.jpg`]);
      }
      if (prefix === `profiles/avatars/${USER_ID}/`) {
        return Promise.resolve([`profiles/avatars/${USER_ID}/old-legacy.jpg`]);
      }
      return Promise.resolve([]);
    });
    uploadToR2.mockResolvedValue("https://r2.example.com/whatever");
    deleteMultipleFromR2.mockResolvedValue(undefined);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));

    expect(deleteMultipleFromR2).toHaveBeenCalledWith([
      `profile-images/${USER_ID}/old-new-prefix.jpg`,
      `profiles/avatars/${USER_ID}/old-legacy.jpg`,
    ]);
  });

  it(
    "[R2-2] uploadToR2 reject → deleteMultipleFromR2 が呼ばれず、500 になる (旧アバター無傷の核心)",
    async () => {
      authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
      listR2Objects.mockResolvedValue([`profile-images/${USER_ID}/old.jpg`]);
      uploadToR2.mockRejectedValue(new Error("R2 upload failed"));

      const res = await POST(makeRequest());

      expect(res.status).toBe(500);
      expect(deleteMultipleFromR2).not.toHaveBeenCalled();
    },
  );

  it("[R2-3] アップロード成功後の deleteMultipleFromR2 reject でも 200 + {path} (非致命)", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    listR2Objects.mockResolvedValue([`profile-images/${USER_ID}/old.jpg`]);
    uploadToR2.mockResolvedValue("https://r2.example.com/whatever");
    deleteMultipleFromR2.mockRejectedValue(new Error("cleanup failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toBeTruthy();
    expect(deleteMultipleFromR2).toHaveBeenCalled(); // 削除は試行されている(非致命として握りつぶされるだけ)
  });

  it("[R2-4] 削除対象リストがアップロード前にキャプチャされる (list → upload → delete の順序)", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    // 新旧プレフィックスで異なる値を返す (同一値だと Promise.all の2呼び出しが区別できず、
    // 実装が正しく2引数を渡しているかの検証にならない)
    listR2Objects.mockImplementation((prefix: string) =>
      prefix === `profile-images/${USER_ID}/`
        ? Promise.resolve([`profile-images/${USER_ID}/old.jpg`])
        : Promise.resolve([]),
    );
    uploadToR2.mockResolvedValue("https://r2.example.com/whatever");
    deleteMultipleFromR2.mockResolvedValue(undefined);

    await POST(makeRequest());

    const listOrder = listR2Objects.mock.invocationCallOrder[0];
    const uploadOrder = uploadToR2.mock.invocationCallOrder[0];
    const deleteOrder = deleteMultipleFromR2.mock.invocationCallOrder[0];
    expect(listOrder).toBeLessThan(uploadOrder);
    expect(uploadOrder).toBeLessThan(deleteOrder);

    // 削除対象は list() の戻り値そのまま。新規アップロードしたファイルのキー(UUID)が紛れ込んでいない
    const deletedKeys = deleteMultipleFromR2.mock.calls[0][0] as string[];
    expect(deletedKeys).toEqual([`profile-images/${USER_ID}/old.jpg`]);
  });
});

describe("POST /api/storage/profile — Supabase フォールバック分岐", () => {
  beforeEach(() => {
    isR2Enabled.mockReturnValue(false);
  });

  it("[SB-1] uploadError のとき remove は実行されず、500 になる (旧アバター無傷の核心)", async () => {
    const { supabase, spies } = makeSupabaseStorage({
      listData: [{ name: "old.jpg" }],
      uploadError: { message: "upload failed" },
    });
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase });

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("画像のアップロードに失敗しました");
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it("[SB-2] remove が失敗しても 200 + {path} になる (非致命)", async () => {
    const { supabase, spies } = makeSupabaseStorage({
      listData: [{ name: "old.jpg" }],
      removeError: { message: "remove failed" },
    });
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toBeTruthy();
    expect(spies.remove).toHaveBeenCalled(); // 削除は試行されている
  });

  it("[SB-3] list → upload → remove の順序でキャプチャが先に行われる", async () => {
    const { supabase, spies } = makeSupabaseStorage({ listData: [{ name: "old.jpg" }] });
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase });

    await POST(makeRequest());

    const listOrder = spies.list.mock.invocationCallOrder[0];
    const uploadOrder = spies.upload.mock.invocationCallOrder[0];
    const removeOrder = spies.remove.mock.invocationCallOrder[0];
    expect(listOrder).toBeLessThan(uploadOrder);
    expect(uploadOrder).toBeLessThan(removeOrder);

    const removedPaths = spies.remove.mock.calls[0][0] as string[];
    expect(removedPaths).toEqual([`${USER_ID}/old.jpg`]);
  });
});

describe("POST /api/storage/profile — バリデーション回帰スモーク", () => {
  beforeEach(() => {
    isR2Enabled.mockReturnValue(true);
  });

  it("[VAL-1] 未認証 → 401 (アップロード処理以前にブロック)", async () => {
    authenticateApiRequest.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it("[VAL-2] file が無い → 400", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("[VAL-3] 許可されていない content-type (例: image/gif) → 400", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    const res = await POST(makeRequest(makeFileLike({ type: "image/gif" })));
    expect(res.status).toBe(400);
  });

  it("[VAL-4] ファイルサイズが5MB超 → 400", async () => {
    authenticateApiRequest.mockResolvedValue({ user: { id: USER_ID }, supabase: {} });
    const res = await POST(makeRequest(makeFileLike({ size: 6 * 1024 * 1024 })));
    expect(res.status).toBe(400);
  });
});
