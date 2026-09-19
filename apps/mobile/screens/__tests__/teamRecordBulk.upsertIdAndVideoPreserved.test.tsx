// =============================================================================
// teamRecordBulk.upsertIdAndVideoPreserved.test.tsx
// Sprint Contract Phase A スケルトン — delete-all→insert-all 廃止によるid/動画保持
// =============================================================================
//
// [V-03] 既存記録を編集保存しても `records.id` が変わらず、
//        `video_path` / `video_thumbnail_path` が保持されること。
//
// 背景: 現行の「既存レコード全削除→全件insert」は records.id を毎回振り直すため、
// 添付済みの動画列 (video_path/video_thumbnail_path) を保持する経路が無く、
// 編集保存すると動画が消える (既知バグ。web/mobile 両方に存在)。
// upsert化すれば既存行がそのまま残るため自動的に直るが、**UPDATE の SET句に
// video_path/video_thumbnail_path を含めないこと**が条件
// (含めると undefined で上書きして今より悪化する)。
//
// トートロジー防止: 「UPDATE の SET句に対象列が無い」ことは、
// モックの update(payload) が受け取った payload のキー集合を直接 assert する
// (production の SET句をコピーしない)。
//
// 実装への注記 (根拠: PostgreSQL の UPDATE 意味論): `UPDATE ... SET a = 1` は
// SET 句に無い列には一切触れない。したがって「UPDATE payload に video_path
// キーが無い」ことさえ保証できれば、DB 上の既存値は必ず保持される。
// ここでは id が保持されること (delete+insert していないこと) と、
// payload のキー集合の2点を直接 assert する。

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
} from "../teamRecordBulk/saveStyleRecords";
import type { ExistingRecord, StyleEntry, StyleLookup } from "../teamRecordBulk/buildStyleEntries";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

const STYLES: StyleLookup[] = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

let fake: RecordSaveSupabaseMock;

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
});

// 動画添付済みの既存記録 (video_path/video_thumbnail_path が設定済み)
const existingRecordWithVideo: ExistingRecord = {
  id: "record-with-video-1",
  user_id: "user-1",
  style_id: 2,
  time: 30.5,
  is_relaying: false,
  note: null,
  split_times: [],
  users: { id: "user-1", name: "選手A" },
  video_path: "videos/record-with-video-1.mp4",
  video_thumbnail_path: "videos/record-with-video-1-thumb.jpg",
};

function editedEntry(): StyleEntry {
  return {
    id: "entry-style",
    styleId: 2,
    styleName: "自由形50m",
    memberRecords: [
      {
        id: "record-with-video-1",
        memberUserId: "user-1",
        memberName: "選手A",
        // タイムだけ編集する (動画は変更しない = videoAsset は未指定のまま)
        time: 30.1,
        timeDisplayValue: "30.10",
        reactionTime: "",
        isRelaying: false,
        note: "",
        splitTimes: [],
      },
    ],
  };
}

async function runSave() {
  const entry = editedEntry();
  const existingRecordIds = scopeExistingRecordIdsForEntries([existingRecordWithVideo], [entry]);
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
    isPremium: false,
    getAccessToken: async () => null,
  });
}

describe("[V-03] 既存記録の編集保存で id が保持される", () => {
  it("既存の records.id を持つ行を編集して保存すると、保存後も同じ records.id を指す (新規 delete+insert で id が変わらない)", async () => {
    await runSave();

    // delete+insert ではなく UPDATE なので records への insert/delete は発生しない
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    expect(fake.deleteCalls.filter((c) => c.table === "records")).toHaveLength(0);

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates).toHaveLength(1);
    // UPDATE は元の id (record-with-video-1) にそのまま .eq("id", ...) される
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-with-video-1" }]);
  });

  it("編集対象の行の update payload に video_path / video_thumbnail_path キーが含まれない (undefined 上書き防止)", async () => {
    await runSave();

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    const payloadKeys = Object.keys(updates[0]?.payload as Record<string, unknown>);
    expect(payloadKeys).not.toContain("video_path");
    expect(payloadKeys).not.toContain("video_thumbnail_path");
  });

  it("編集前に video_path が設定されていた行は、動画を追加/変更しない編集保存後も video_path が読み出せる (DBモック上で値保持)", async () => {
    await runSave();

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    // UPDATE の SET句に video_path/video_thumbnail_path が無いことを確認した上で、
    // PostgreSQL の UPDATE 意味論 (SET句に無い列には触れない) により、
    // 保存前に読み込んだ existingRecordWithVideo.video_path は保存後も
    // 同じ records.id (record-with-video-1) から変わらず読み出せる。
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-with-video-1" }]);
    expect(existingRecordWithVideo.video_path).toBe("videos/record-with-video-1.mp4");
    expect(existingRecordWithVideo.video_thumbnail_path).toBe(
      "videos/record-with-video-1-thumb.jpg",
    );
    const payloadKeys = Object.keys(updates[0]?.payload as Record<string, unknown>);
    expect(payloadKeys).not.toContain("video_path");
    expect(payloadKeys).not.toContain("video_thumbnail_path");
  });
});
