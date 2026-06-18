/**
 * QA Phase B (W-3): uploadVideoForTeamMember / MissingThumbnailError の検証。
 *
 * 対象修正: team-assign はサムネイル必須だが、uploadVideo はサムネイル生成失敗時に
 * thumbnailPath を空文字で返す。空文字を team-assign に渡すと 400 になるため、
 * サムネ未生成時は team-assign を呼ばず MissingThumbnailError を投げる
 * (動画自体は操作者配下に confirm 済み)。呼び出し側はこのエラーを捕捉し
 * 「サムネ未生成で添付不可」を通知する。
 *
 * 検証観点:
 * [TM-01] サムネ生成成功 → upload-url → R2 PUT(動画+サムネ) → confirm → team-assign が呼ばれ最終パスを返す
 * [TM-02] サムネ生成失敗 → team-assign を呼ばず MissingThumbnailError をスローする (握りつぶさない)
 * [TM-03] MissingThumbnailError は instanceof Error かつ name='MissingThumbnailError'
 * [TM-04] team-assign が 400 を返したら Error をスロー (サムネありの場合)
 */
import { describe, it, vi, beforeEach, expect } from "vitest";

const mockGetThumbnailAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-video-thumbnails", () => ({
  getThumbnailAsync: mockGetThumbnailAsync,
}));

vi.mock("@/lib/env", () => ({
  env: {
    webApiUrl: "https://api.swimhub.example.com",
    r2PublicUrl: null,
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  uploadVideoForTeamMember,
  MissingThumbnailError,
} from "@/utils/videoUpload";

const UPLOAD_URL_RESPONSE = {
  videoUploadUrl: "https://r2.example.com/video-presigned",
  thumbnailUploadUrl: "https://r2.example.com/thumb-presigned",
  videoPath: "videos/owner/practice-logs/log1.mp4",
  thumbnailPath: "thumbnails/owner/practice-logs/log1.jpg",
};

const TEAM_ASSIGN_RESPONSE = {
  finalVideoPath: "videos/member/practice-logs/log1.mp4",
  finalThumbnailPath: "thumbnails/member/practice-logs/log1.jpg",
};

function setupMocks({
  thumbnailSuccess = true,
  teamAssignOk = true,
}: { thumbnailSuccess?: boolean; teamAssignOk?: boolean } = {}) {
  if (thumbnailSuccess) {
    mockGetThumbnailAsync.mockResolvedValue({
      uri: "file:///tmp/thumb.jpg",
      width: 1280,
      height: 720,
    });
  } else {
    mockGetThumbnailAsync.mockRejectedValue(new Error("Thumbnail failed"));
  }

  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";

    if (typeof url === "string" && url.includes("/api/storage/videos/upload-url")) {
      return Promise.resolve({ ok: true, json: async () => UPLOAD_URL_RESPONSE });
    }
    if (typeof url === "string" && url.includes("/api/storage/videos/confirm")) {
      return Promise.resolve({ ok: true });
    }
    if (typeof url === "string" && url.includes("/api/storage/videos/team-assign")) {
      if (!teamAssignOk) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ message: "thumbnail required" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => TEAM_ASSIGN_RESPONSE });
    }
    if (method === "PUT") {
      return Promise.resolve({ ok: true });
    }
    // fetch(fileUri) / fetch(thumbnailUri) → blob()
    return Promise.resolve({ ok: true, blob: async () => new Blob(["binary"]) });
  });
}

const BASE_PARAMS = {
  type: "practice-log" as const,
  id: "log-1",
  targetUserId: "member-1",
  teamId: "team-1",
  videoUri: "file:///video/test.mp4",
  accessToken: "valid-token",
};

describe("[TM-01] サムネ生成成功 → team-assign 完了", () => {
  beforeEach(() => vi.clearAllMocks());

  it("team-assign が呼ばれ finalVideoPath/finalThumbnailPath を返す", async () => {
    setupMocks({ thumbnailSuccess: true, teamAssignOk: true });

    const result = await uploadVideoForTeamMember(BASE_PARAMS);

    expect(result).toEqual(TEAM_ASSIGN_RESPONSE);
    const teamAssignCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([u]) => typeof u === "string" && u.includes("team-assign"),
    );
    expect(teamAssignCalls).toHaveLength(1);
    // team-assign body に sourceId(=id) / targetUserId / tempThumbnailPath が渡る
    const body = JSON.parse(teamAssignCalls[0][1]?.body as string) as {
      sourceId: string;
      targetUserId: string;
      tempThumbnailPath: string;
    };
    expect(body.sourceId).toBe("log-1");
    expect(body.targetUserId).toBe("member-1");
    expect(body.tempThumbnailPath).toBe(UPLOAD_URL_RESPONSE.thumbnailPath);
  });
});

describe("[TM-02] サムネ生成失敗 → team-assign を呼ばず MissingThumbnailError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MissingThumbnailError をスローする (握りつぶさない)", async () => {
    setupMocks({ thumbnailSuccess: false });

    await expect(uploadVideoForTeamMember(BASE_PARAMS)).rejects.toBeInstanceOf(
      MissingThumbnailError,
    );
  });

  it("team-assign API は一切呼ばれない (空 tempThumbnailPath での 400 を回避)", async () => {
    setupMocks({ thumbnailSuccess: false });

    await uploadVideoForTeamMember(BASE_PARAMS).catch(() => {});

    const teamAssignCalls = (mockFetch.mock.calls as Array<[string]>).filter(
      ([u]) => typeof u === "string" && u.includes("team-assign"),
    );
    expect(teamAssignCalls).toHaveLength(0);
  });

  it("動画自体は confirm 済み (upload-url と confirm は呼ばれている)", async () => {
    setupMocks({ thumbnailSuccess: false });

    await uploadVideoForTeamMember(BASE_PARAMS).catch(() => {});

    const urls = (mockFetch.mock.calls as Array<[string]>).map(([u]) => u);
    expect(urls.some((u) => typeof u === "string" && u.includes("upload-url"))).toBe(true);
    expect(urls.some((u) => typeof u === "string" && u.includes("confirm"))).toBe(true);
  });
});

describe("[TM-03] MissingThumbnailError の型", () => {
  it("Error を継承し name='MissingThumbnailError'", () => {
    const e = new MissingThumbnailError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("MissingThumbnailError");
  });

  it("instanceof で他の Error と区別できる (呼び出し側の分岐に必要)", () => {
    const missing: unknown = new MissingThumbnailError();
    const generic: unknown = new Error("network");
    expect(missing instanceof MissingThumbnailError).toBe(true);
    expect(generic instanceof MissingThumbnailError).toBe(false);
  });
});

describe("[TM-04] team-assign 失敗 (サムネあり)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("team-assign が 400 を返すと Error をスロー (MissingThumbnailError ではない)", async () => {
    setupMocks({ thumbnailSuccess: true, teamAssignOk: false });

    await expect(uploadVideoForTeamMember(BASE_PARAMS)).rejects.toThrow();
    await expect(uploadVideoForTeamMember(BASE_PARAMS)).rejects.not.toBeInstanceOf(
      MissingThumbnailError,
    );
  });
});
