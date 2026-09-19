// =============================================================================
// teamRecordBulk.updatePathVideoAttachment.test.tsx
// Sprint Contract Phase A スケルトン — UPDATE 経路でも動画アップロードが実行される
// =============================================================================
//
// 事実6 (PM確定): 現行の動画アップロードループは insert された行しか対象にしていない。
// upsert 化で UPDATE 経路の既存行に新しい動画を添付するケースが漏れるため、
// 対象を「保存成功した全 record (insert + update)」に広げる必要がある。
//
// [V-04] 既存行 (id保持のまま UPDATE) に新しい動画を添付したとき、
//        アップロードが実行され、その行の video_path が更新されること。
//
// `saveStyleRecords` を実物 import して直接呼び出す (screen は render しない)。
// 動画アップロード本体 (`@/utils/videoUpload`) はモックし、「呼ばれたか・どの
// recordId/targetUserId で呼ばれたか」だけを観測する (アップロードの実装詳細を
// このテスト内に再実装しない)。

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
} from "../teamRecordBulk/saveStyleRecords";
import type { ExistingRecord, StyleEntry, StyleLookup } from "../teamRecordBulk/buildStyleEntries";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

const mockUploadVideoForTeamMember = vi.fn();

vi.mock("@/utils/videoUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/videoUpload")>("@/utils/videoUpload");
  return {
    ...actual,
    uploadVideoForTeamMember: (...args: unknown[]) => mockUploadVideoForTeamMember(...args),
  };
});

const STYLES: StyleLookup[] = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

let fake: RecordSaveSupabaseMock;

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mockUploadVideoForTeamMember.mockReset();
  mockUploadVideoForTeamMember.mockResolvedValue({
    finalVideoPath: "videos/new.mp4",
    finalThumbnailPath: "videos/new-thumb.jpg",
  });
});

const existingRecordWithoutVideo: ExistingRecord = {
  id: "record-existing-1",
  user_id: "user-1",
  style_id: 2,
  time: 30.5,
  is_relaying: false,
  note: null,
  split_times: [],
  users: { id: "user-1", name: "選手A" },
  video_path: null,
  video_thumbnail_path: null,
};

function entryWithVideo(videoAsset: { uri: string; mimeType?: string } | null): StyleEntry {
  return {
    id: "entry-style",
    styleId: 2,
    styleName: "自由形50m",
    memberRecords: [
      {
        id: "record-existing-1",
        memberUserId: "user-1",
        memberName: "選手A",
        time: 30.1,
        timeDisplayValue: "30.10",
        reactionTime: "",
        isRelaying: false,
        note: "",
        splitTimes: [],
        videoAsset,
      },
    ],
  };
}

async function runSave(entry: StyleEntry, existingRecords: ExistingRecord[] = [existingRecordWithoutVideo]) {
  const existingRecordIds = scopeExistingRecordIdsForEntries(existingRecords, [entry]);
  return saveStyleRecords({
    supabase: fake.supabase as never,
    competitionId: "comp-1",
    teamId: "team-1",
    poolType: 0,
    entries: [entry],
    existingRecordIds,
    existingRelayRecordIds: new Set(),
    memberGenderByUserId: new Map(),
    styles: STYLES,
    isPremium: true,
    getAccessToken: async () => "fake-access-token",
  });
}

describe("[V-04] UPDATE 経路の動画添付", () => {
  it("既存記録 (INSERTではなくUPDATEされる行) に新しい動画を選択して保存すると、動画アップロード処理が呼ばれる", async () => {
    const result = await runSave(entryWithVideo({ uri: "file:///tmp/clip.mp4", mimeType: "video/mp4" }));

    expect(result.hasError).toBe(false);
    // 対象行は UPDATE (INSERT ではない)
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(1);

    expect(mockUploadVideoForTeamMember).toHaveBeenCalledTimes(1);
    const call = mockUploadVideoForTeamMember.mock.calls[0]?.[0] as {
      id: string;
      targetUserId: string;
      videoUri: string;
    };
    // recordId は UPDATE された既存行の id (record-existing-1) を指す
    expect(call.id).toBe("record-existing-1");
    expect(call.targetUserId).toBe("user-1");
    expect(call.videoUri).toBe("file:///tmp/clip.mp4");
  });

  it("動画アップロード対象の集合は『保存成功した insert 行 + update 行』の両方を含む (insert のみを対象にしていない)", async () => {
    const entry: StyleEntry = {
      id: "entry-style",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        {
          // 既存行 (UPDATE)
          id: "record-existing-1",
          memberUserId: "user-1",
          memberName: "選手A",
          time: 30.1,
          timeDisplayValue: "30.10",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
          videoAsset: { uri: "file:///tmp/existing.mp4" },
        },
        {
          // entries.id 由来の新規行 (INSERT)
          id: "entries-row-9",
          memberUserId: "user-2",
          memberName: "選手B",
          time: 31.4,
          timeDisplayValue: "31.40",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
          videoAsset: { uri: "file:///tmp/new.mp4" },
        },
      ],
    };

    await runSave(entry);

    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(1);
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(1);

    expect(mockUploadVideoForTeamMember).toHaveBeenCalledTimes(2);
    const targetUserIds = mockUploadVideoForTeamMember.mock.calls
      .map((args) => (args[0] as { targetUserId: string }).targetUserId)
      .sort();
    expect(targetUserIds).toEqual(["user-1", "user-2"]);
  });

  it("動画を変更しない既存行では、アップロード処理が呼ばれない (無駄なアップロードをしない)", async () => {
    await runSave(entryWithVideo(null));

    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(1);
    expect(mockUploadVideoForTeamMember).not.toHaveBeenCalled();
  });

  it("UPDATE 経路の動画アップロードが失敗した場合、その旨のエラーハンドリングが existing の insert 経路と同等に行われる (握りつぶさない)", async () => {
    mockUploadVideoForTeamMember.mockRejectedValueOnce(new Error("network error"));

    const result = await runSave(entryWithVideo({ uri: "file:///tmp/clip.mp4" }));

    // DB 書き込み自体は成功しているので hasError は false のまま
    // (動画添付の失敗は videoErrors で部分失敗として通知する)
    expect(result.hasError).toBe(false);
    expect(result.videoErrors).toHaveLength(1);
    expect(result.videoErrors[0]).toEqual({ kind: "generic", memberName: "選手A" });
  });
});
