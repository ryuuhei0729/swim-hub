// =============================================================================
// recordClientIdAndVideoPreserved.test.tsx
// Sprint Contract Phase A スケルトン — 編集保存での id / 動画列保持 (web)
// =============================================================================
//
// [V-03w] 既存記録を編集保存しても records.id が変わらず、
//         video_path (と、選択時に限り video_thumbnail_path) が保持されること。
//
// 【PM裁定 2026-09-17 (往復の記録)】当初 PM は「web の RecordDataLoader.tsx に
// video_thumbnail_path の select 追加が必要」と指示し、このテストもそれを前提に
// 書かれていた。その後 Reviewer の指摘を受けて PM がこの指示を**撤回**した。
// 撤回の根拠 (PM 実測):
//   1. web の記録入力画面 (RecordClient.tsx) には既存動画を表示する経路が無い。
//      `thumbnailPath` が出てくる箇所は全て新規アップロードのフロー
//      (upload-url / confirm) であり、既存サムネイルの読み出しではない
//   2. video_thumbnail_path を実際に表示している web 画面
//      (RecordDetailModal.tsx / CompetitionDetails.tsx 等) は
//      RecordDataLoader を経由せず、自前のクエリで読んでいる
//   3. mobile の新詳細画面 (TeamRecordStyleDetailScreen.tsx) は
//      `existingThumbnailPath` を実際に VideoUploader へ渡して使っているため、
//      mobile 側には select が必要
// つまり **mobile は必要・web は不要という非対称が正しい状態**であり、web に
// select 列を追加すると「読まれないフィールドを増やさない」原則
// (`apps/shared/api/teams/relayRecords.ts` の `RelayRecordReplaceResult` の
// docstring と同じ考え方) に反する。
//
// 🚨 次の担当者へ: 「mobile にあって web に無いのは漏れだ」と早合点しないこと。
// web の記録入力画面が既存の添付動画を一切表示しない、という mobile とのパリティ
// ギャップ自体は実在するが、これは今スプリントで作ったものではない既存の残債務
// であり、PM 裁定によりこのスプリントでは対応しない。

import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Style } from "@apps/shared/types";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "../utils/supabaseRecordSaveMock";

// ---------------------------------------------------------------------------
// vi.mock は必ずファイルのトップレベル (describe/it の外) で呼ぶ。hoisting の
// 対象になるのはトップレベル呼び出しのみで、describe 内に書くと巻き上げの
// 挙動が不安定になる。
// ---------------------------------------------------------------------------
const mockGetServerUser = vi.fn();
const mockCreateAuthenticatedServerClient = vi.fn();
const mockGetLocale = vi.fn().mockResolvedValue("ja");
const mockNotFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("@/lib/supabase-server-auth", () => ({
  createAuthenticatedServerClient: mockCreateAuthenticatedServerClient,
}));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: mockGetServerUser }));
vi.mock("next-intl/server", () => ({
  getLocale: mockGetLocale,
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
// RecordDataLoader (server component) は `<RecordClient {...props} />` という
// React 要素を作るだけで RecordClient 自体を呼び出さない (React.createElement は
// 関数本体を実行しない) ため、この select 列テストのためだけに RecordClient を
// モックする必要は無い。2つ目の describe (実際に render する方) では本物を使う。

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
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

let fake: RecordSaveSupabaseMock;
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: fake.supabase, subscription: null }),
}));

type ChainResponse = { data: unknown; error: unknown };

function buildRecordDataLoaderSupabaseMock(
  responses: Record<string, { single?: ChainResponse; order?: ChainResponse }>,
) {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const selectCallsByTable: Record<string, string[]> = {};
  const from = vi.fn((table: string) => {
    const tableResponses = responses[table] ?? {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn((columns?: string) => {
      (selectCallsByTable[table] ??= []).push(columns ?? "");
      return chain();
    });
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(() => Promise.resolve(tableResponses.order ?? defaultResponse));
    builder.single = vi.fn(() => Promise.resolve(tableResponses.single ?? defaultResponse));
    return builder;
  });
  return { from, selectCallsByTable };
}

// ---------------------------------------------------------------------------
// [V-03w] RecordDataLoader の select 列
//
// パターンは既存 recordAdminGuard.test.ts を踏襲: server component を直接
// await 呼び出しし、supabase.from().select() の呼び出し引数を検査する
// (production の select 文字列をテスト内で再構築しない)。
// ---------------------------------------------------------------------------
describe("[V-03w] RecordDataLoader の select 列", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetLocale.mockResolvedValue("ja");
  });

  it("RecordDataLoader が records を取得するクエリに video_path が含まれる (video_thumbnail_path は web に既存動画の表示経路が無いため意図的に含めない)", async () => {
    const mock = buildRecordDataLoaderSupabaseMock({
      team_memberships: {
        single: { data: { id: "m-1", role: "admin" }, error: null },
        order: { data: [], error: null },
      },
      competitions: {
        single: {
          data: {
            id: "comp-1",
            user_id: "user-1",
            team_id: "team-1",
            title: "テスト大会",
            date: "2026-01-01",
            end_date: null,
            place: null,
            pool_type: 0,
            note: null,
            created_at: "2020-01-01T00:00:00Z",
            team: { id: "team-1", name: "チーム" },
          },
          error: null,
        },
      },
      records: { order: { data: [], error: null } },
      styles: { order: { data: [], error: null } },
    });
    mockCreateAuthenticatedServerClient.mockResolvedValue(mock);

    const mod = await import(
      "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader"
    );
    const RecordDataLoader = mod.default;
    await RecordDataLoader({ teamId: "team-1", competitionId: "comp-1" });

    const recordsSelectCalls = mock.selectCallsByTable.records ?? [];
    expect(recordsSelectCalls.length).toBeGreaterThan(0);
    // video_path は既存記録の再生に使うため select する
    expect(recordsSelectCalls.some((cols) => cols.includes("video_path"))).toBe(true);
    // video_thumbnail_path は web の入力画面に表示経路が無いため select しない
    // (追加すると「読まれないフィールド」になる。PM裁定 2026-09-17 参照)。
    // "video_path" の部分文字列マッチを避けるため、"video_thumbnail_path" 自体を含むかで判定する。
    expect(
      recordsSelectCalls.some((cols) => cols.includes("video_thumbnail_path")),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-03w] 編集保存での id / 動画列保持
//
// この describe が V-03w の本体 (upsert 後も動画関連の列が失われないこと)。
// 「保持される」の実体は PostgreSQL の UPDATE 意味論 (SET句に無い列には
// 一切触れない) なので、証明すべきは「UPDATE payload (SET句相当) に
// video_path / video_thumbnail_path キーが含まれないこと」+
// 「同じ records.id を UPDATE していること (delete+insert で id が変わらない)」
// の2点。video_thumbnail_path を web が select しているかどうかとは独立に
// 成立する (select していなくても、書き込み側が触れなければ DB 上の値は消えない)。
// ---------------------------------------------------------------------------
describe("[V-03w] 編集保存での id / 動画列保持", () => {
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
  ];

  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  async function renderAndSave() {
    const { default: RecordClient } = await import(
      "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient"
    );
    render(
      <RecordClient
        teamId="team-1"
        competitionId="comp-1"
        competition={baseCompetition}
        teamName="テストチーム"
        members={activeMembers}
        existingRecords={[
          {
            id: "record-with-video-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.5,
            video_path: "videos/record-with-video-1.mp4",
            note: null,
            is_relaying: false,
            reaction_time: null,
            pool_type: null,
            team_id: "team-1",
            split_times: [],
            users: { id: "user-1", name: "太郎" },
            styles: { id: 2, name_jp: "自由形50m", distance: 50 },
          },
        ]}
        styles={[STYLE_FREE_50]}
        entries={[]}
        bestTimesByUser={{}}
      />,
    );

    // タイムだけ編集する (動画は変更しない)
    const timeInput = screen.getByPlaceholderText("timePlaceholder") as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: "30.10" } });
    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });
  }

  it("既存の records.id を持つ行を編集保存しても、同じ records.id を指し続ける", async () => {
    await renderAndSave();

    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-with-video-1" }]);
  });

  it("UPDATE payload (SET句相当) に video_path / video_thumbnail_path キーが含まれない (undefined 上書きで悪化させない)", async () => {
    await renderAndSave();

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    const payloadKeys = Object.keys(updates[0]?.payload as Record<string, unknown>);
    expect(payloadKeys).not.toContain("video_path");
    expect(payloadKeys).not.toContain("video_thumbnail_path");
  });

  it("編集前に video_path が設定されていた行は、動画を変更しない編集保存後も値が保持される", async () => {
    await renderAndSave();

    // PostgreSQL の UPDATE 意味論 (SET句に無い列には触れない) により、
    // video_path キーが payload に無いこと + 同じ id を UPDATE していることの
    // 2点で「保持される」ことを裏付ける。
    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-with-video-1" }]);
    const payloadKeys = Object.keys(updates[0]?.payload as Record<string, unknown>);
    expect(payloadKeys).not.toContain("video_path");
  });
});
