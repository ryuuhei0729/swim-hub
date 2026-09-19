// =============================================================================
// recordClientUpdatePathVideoAttachment.test.tsx
// Sprint Contract Phase A スケルトン — UPDATE 経路の動画アップロード (web)
// =============================================================================
//
// 事実6 (PM確定): 現行の動画アップロードループは insert された行しか対象にしていない。
// upsert 化で UPDATE 経路の既存行に新しい動画を添付するケースが漏れる。
// web にも同一の対応が必要。

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "../utils/supabaseRecordSaveMock";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

// TeamVideoUploader は「動画選択ボタンを押すと即座に onVideoReady が発火する」
// フェイクに差し替える (実際のファイル選択 UI は本テストの対象外)。
vi.mock("@/components/video/TeamVideoUploader", () => ({
  default: (props: { onVideoReady: (file: File, thumbnail: Blob) => void }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "fake-video-ready",
        onClick: () =>
          props.onVideoReady(
            new File(["dummy-video"], "clip.mp4", { type: "video/mp4" }),
            new Blob(["dummy-thumb"], { type: "image/jpeg" }),
          ),
      },
      "fake-video-ready",
    ),
}));

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

let fake: RecordSaveSupabaseMock;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: fake.supabase, subscription: null }),
}));

const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "Fr",
  distance: 50,
};

const baseCompetition = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: "2026-01-01",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const activeMembers = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎", gender: 0 } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];

function renderRecordClient(
  overrides: Partial<Pick<RecordClientPropsFull, "existingRecords" | "entries">>,
) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={activeMembers}
      existingRecords={[]}
      styles={[STYLE_FREE_50]}
      entries={[]}
      bestTimesByUser={{}}
      {...overrides}
    />,
  );
}

function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    if (url === "/api/storage/videos/upload-url") {
      return new Response(
        JSON.stringify({
          videoUploadUrl: "https://r2.example.com/upload/video",
          thumbnailUploadUrl: "https://r2.example.com/upload/thumb",
          videoPath: "videos/new-clip.mp4",
          thumbnailPath: "videos/new-clip-thumb.jpg",
        }),
        { status: 200 },
      );
    }
    // R2 への PUT / confirm / team-assign はすべて成功させる
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mocks.push.mockClear();
  vi.unstubAllGlobals();
});

describe("[V-04w] UPDATE 経路の動画添付 (web)", () => {
  it("既存記録 (UPDATE される行) に新しい動画を選択して保存すると、動画アップロード処理が呼ばれる", async () => {
    const { calls } = stubFetch();

    renderRecordClient({
      existingRecords: [
        {
          id: "record-existing-1",
          user_id: "user-1",
          style_id: 2,
          time: 30.5,
          video_path: null,
          note: null,
          is_relaying: false,
          reaction_time: null,
          pool_type: null,
          team_id: "team-1",
          split_times: [],
          users: { id: "user-1", name: "太郎" },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ],
    });

    fireEvent.click(screen.getByText("videoSelect"));
    await waitFor(() => screen.getByTestId("fake-video-ready"));
    fireEvent.click(screen.getByTestId("fake-video-ready"));
    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    expect(calls.some((c) => c.url === "/api/storage/videos/upload-url")).toBe(true);
    expect(calls.some((c) => c.url === "/api/storage/videos/confirm")).toBe(true);

    // UPDATE される既存行 (record-existing-1) の id で動画アップロードURLを要求している
    // (mr.id をそのまま使わず、保存後の実 records.id に解決していることの確認)
    const uploadUrlCall = calls.find((c) => c.url === "/api/storage/videos/upload-url");
    const body = JSON.parse(uploadUrlCall?.init?.body as string) as { id: string };
    expect(body.id).toBe("record-existing-1");

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-existing-1" }]);
  });

  it("動画アップロード対象の集合が『保存成功した insert 行 + update 行』の両方を含む", async () => {
    const { calls } = stubFetch();

    // 太郎 = 既存記録 (保存すると UPDATE)。次郎 = エントリー由来の新規行
    // (entry_time は入力欄に入らないのでタイムは未入力のまま → 保存前にテストで入力し、
    // 保存すると INSERT になる)。
    renderRecordClient({
      existingRecords: [
        {
          id: "record-existing-2",
          user_id: "user-1",
          style_id: 2,
          time: 30.5,
          video_path: null,
          note: null,
          is_relaying: false,
          reaction_time: null,
          pool_type: null,
          team_id: "team-1",
          split_times: [],
          users: { id: "user-1", name: "太郎" },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ],
      entries: [
        {
          id: "entry-jiro-1",
          user_id: "user-2",
          style_id: 2,
          entry_time: 31.0,
          note: null,
          users: { id: "user-2", name: "次郎" },
        },
      ],
    });

    // 次郎 (entries 由来行) にタイムを入力する
    const timeInputs = screen.getAllByPlaceholderText("timePlaceholder") as HTMLInputElement[];
    expect(timeInputs).toHaveLength(2);
    const jiroTimeInput = timeInputs.find((input) => input.value === "");
    fireEvent.change(jiroTimeInput as HTMLInputElement, { target: { value: "30.90" } });

    // 太郎・次郎の両方に動画を添付する (videoSelect ボタンは行ごとに1つ)
    const videoSelectButtons = screen.getAllByText("videoSelect");
    expect(videoSelectButtons).toHaveLength(2);
    fireEvent.click(videoSelectButtons[0] as HTMLElement);
    await waitFor(() => screen.getByTestId("fake-video-ready"));
    fireEvent.click(screen.getByTestId("fake-video-ready"));
    fireEvent.click(videoSelectButtons[1] as HTMLElement);
    await waitFor(() => screen.getByTestId("fake-video-ready"));
    fireEvent.click(screen.getByTestId("fake-video-ready"));

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    // 太郎 (UPDATE) と次郎 (INSERT) の両方が保存された
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-existing-2" }]);
    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    const newRecordId = fake.insertedIds.records?.[0];
    expect(newRecordId).toBeDefined();

    // 動画アップロードは2件 (太郎=UPDATE行、次郎=INSERT行) とも発生する
    const uploadUrlCalls = calls.filter((c) => c.url === "/api/storage/videos/upload-url");
    expect(uploadUrlCalls).toHaveLength(2);
    const uploadedIds = uploadUrlCalls
      .map((c) => JSON.parse(c.init?.body as string) as { id: string })
      .map((b) => b.id)
      .sort();
    expect(uploadedIds).toEqual(["record-existing-2", newRecordId].sort());
  });

  it("動画を変更しない既存行ではアップロード処理が呼ばれない (対照)", async () => {
    const { calls } = stubFetch();

    renderRecordClient({
      existingRecords: [
        {
          id: "record-no-video-change",
          user_id: "user-1",
          style_id: 2,
          time: 30.5,
          video_path: null,
          note: null,
          is_relaying: false,
          reaction_time: null,
          pool_type: null,
          team_id: "team-1",
          split_times: [],
          users: { id: "user-1", name: "太郎" },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ],
    });

    // 動画選択ボタンには触れず、タイムだけ変更して保存する
    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    expect(calls.some((c) => c.url === "/api/storage/videos/upload-url")).toBe(false);
  });
});
