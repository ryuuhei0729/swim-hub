/**
 * RecordDetail.cachedDetail.test.tsx
 *
 * 日別詳細の記録は React Query のキャッシュに載せている。
 *   - スプリットタイムは記録と同じ問い合わせで取得する (以前は記録1件ごとに
 *     split_times へ別の問い合わせを順番に投げていた)
 *   - 同じ日を開き直したときは、取り直しを待たずに前回の内容を表示する
 */

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native-view-shot", () => ({
  captureRef: vi.fn().mockResolvedValue("file:///tmp/share.png"),
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
});

import { RecordDetail } from "../components/RecordDetail";
import { invalidateCalendarAfterSave } from "@/hooks/dayDetailQueries";

const RECORD_ROW = {
  id: "record-1",
  time: 27.35,
  reaction_time: null,
  is_relaying: false,
  note: "キャッシュ確認用の記録",
  style_id: 1,
  video_path: null,
  video_thumbnail_path: null,
  style: { id: 1, name_jp: "50m自由形", distance: 50, style: "fr" },
  split_times: [{ distance: 25, split_time: 13.1 }],
};

interface FakeSupabase {
  client: { from: (table: string) => unknown };
  tables: string[];
  recordSelects: string[];
  /** records の問い合わせが返す内容。null の間は返さない (通信が遅い状況) */
  respondRecords: (rows: unknown[]) => void;
}

function createFakeSupabase(initialRows: unknown[] | null): FakeSupabase {
  const tables: string[] = [];
  const recordSelects: string[] = [];
  let pending: Array<(rows: unknown[]) => void> = [];
  let rows = initialRows;

  const recordsChain: Record<string, unknown> = {
    select: (query: string) => {
      recordSelects.push(query);
      return recordsChain;
    },
    eq: () => recordsChain,
    order: () => recordsChain,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      new Promise<unknown[]>((res) => {
        if (rows) res(rows);
        else pending.push(res);
      }).then((data) => resolve({ data, error: null })),
  };
  const competitionsChain: Record<string, unknown> = {
    select: () => competitionsChain,
    eq: () => competitionsChain,
    single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
  };

  return {
    client: {
      from: (table: string) => {
        tables.push(table);
        return table === "records" ? recordsChain : competitionsChain;
      },
    },
    tables,
    recordSelects,
    respondRecords: (next) => {
      rows = next;
      pending.forEach((res) => res(next));
      pending = [];
    },
  };
}

function renderRecordDetail(queryClient: QueryClient, supabase: FakeSupabase) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthContext({
      supabase: supabase.client,
      user: { id: "user-1" },
      getAccessToken: vi.fn().mockResolvedValue(null),
    }),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RecordDetail
        competitionId="comp-1"
        competitionName="テスト大会"
        records={[]}
        isTeamCompetition={false}
        onEditCompetition={vi.fn()}
        onDeleteCompetition={vi.fn()}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("RecordDetail — 詳細データのキャッシュ", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("スプリットタイムは記録と同じ問い合わせに含め、split_times へ別途問い合わせない", async () => {
    const supabase = createFakeSupabase([RECORD_ROW]);
    renderRecordDetail(createClient(), supabase);

    expect(await screen.findByText("キャッシュ確認用の記録")).toBeTruthy();

    expect(supabase.recordSelects.some((query) => query.includes("split_times("))).toBe(true);
    expect(supabase.tables).not.toContain("split_times");
  });

  it("開き直したとき、取り直しが返ってくる前から前回の内容を表示する", async () => {
    const queryClient = createClient();

    const first = renderRecordDetail(queryClient, createFakeSupabase([RECORD_ROW]));
    expect(await screen.findByText("キャッシュ確認用の記録")).toBeTruthy();
    first.unmount();

    // 開き直し: 取り直しは返ってこないままにする
    const slow = createFakeSupabase(null);
    renderRecordDetail(queryClient, slow);

    expect(screen.getByText("キャッシュ確認用の記録")).toBeTruthy();
    await waitFor(() => expect(slow.tables).toContain("records"));

    // 取り直しが届いたら新しい内容に差し替わる
    slow.respondRecords([{ ...RECORD_ROW, note: "取り直した記録" }]);
    expect(await screen.findByText("取り直した記録")).toBeTruthy();
    expect(screen.queryByText("キャッシュ確認用の記録")).toBeNull();
  });

  it("保存で無効化されたあとに開き直したときは、古い内容を見せずに取り直しを待つ", async () => {
    const queryClient = createClient();

    const first = renderRecordDetail(queryClient, createFakeSupabase([RECORD_ROW]));
    expect(await screen.findByText("キャッシュ確認用の記録")).toBeTruthy();
    first.unmount();

    // 記録の保存画面が保存後に行う無効化
    await invalidateCalendarAfterSave(queryClient, { competitionId: "comp-1" });

    const slow = createFakeSupabase(null);
    renderRecordDetail(queryClient, slow);

    expect(screen.queryByText("キャッシュ確認用の記録")).toBeNull();

    slow.respondRecords([{ ...RECORD_ROW, note: "保存後の記録" }]);
    expect(await screen.findByText("保存後の記録")).toBeTruthy();
  });

  it("別の大会を保存しただけなら、この大会は開き直したときに前回の内容をすぐ表示する", async () => {
    const queryClient = createClient();

    const first = renderRecordDetail(queryClient, createFakeSupabase([RECORD_ROW]));
    expect(await screen.findByText("キャッシュ確認用の記録")).toBeTruthy();
    first.unmount();

    await invalidateCalendarAfterSave(queryClient, { competitionId: "other-competition" });

    renderRecordDetail(queryClient, createFakeSupabase(null));

    expect(screen.getByText("キャッシュ確認用の記録")).toBeTruthy();
  });
});
