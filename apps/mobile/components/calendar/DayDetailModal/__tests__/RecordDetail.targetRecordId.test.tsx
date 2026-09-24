/**
 * RecordDetail.targetRecordId.test.tsx
 *
 * Sprint Contract (大会タブ経由の DayDetailModal は「タップした記録1件のみ」表示する)
 * 検証観点:
 *
 *   [V-46]  targetRecordId が渡されたとき、records テーブルへの内部クエリに
 *           .eq("id", targetRecordId) が発行される (同じ大会の他種目記録を除外する実体)
 *   [V-46b] targetRecordId が渡されないとき (エントリー済み行タップ / 大会タブ以外) は
 *           .eq("id", ...) を発行しない (従来どおり大会の全記録を取得する)
 *   [V-46c] チーム大会 (isTeamCompetition=true) では targetRecordId 指定時も
 *           既存の .eq("user_id", user.id) 自分の記録限定フィルタが維持される
 *           (targetRecordId 追加が既存の権限的スコープを緩めない)
 *   [V-46d] 個人大会 (isTeamCompetition=false) では targetRecordId 指定時も
 *           .eq("competition_id", competitionId) は維持される
 *
 * 対象実装 (未実装 / targetRecordId prop 自体が存在しないため RED):
 *   apps/mobile/components/calendar/DayDetailModal/components/RecordDetail.tsx
 *   apps/mobile/components/calendar/DayDetailModal/types.ts (RecordDetailProps に
 *     targetRecordId?: string を追加)
 *
 * モック方針:
 *   「引数を捨てるモックは検証不能」(過去のQAフィードバック) を踏まえ、
 *   supabase.from("records")...eq(col, val) の呼び出し引数を `eqCalls` に生で記録し、
 *   モック内で最初から絞り込んでしまわない (絞り込みロジックがプロダクション側に
 *   実装されていることを検証するため、モックの `then` は常に固定データを返す)。
 *
 * トートロジー防止メモ:
 *   期待するクエリ列 (.eq の呼び出し有無・引数) は Sprint Contract のユーザー要望
 *   (「大会タブでタップした記録1件のみ表示」「チーム大会は自分の記録のみ」という既存仕様は
 *   維持」) から導出したものであり、RecordDetail.tsx の実装を読んでコピーしたものではない。
 */

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

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
import type { RecordDetailProps } from "../types";

/** records クエリチェーンの .eq() 呼び出し引数を生で記録するスパイ付きモックを作る */
function buildRecordsQueryChain(eqCalls: Array<[string, unknown]>) {
  const recordsChain: Record<string, unknown> = {
    select: () => recordsChain,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return recordsChain;
    },
    order: () => recordsChain,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return recordsChain;
}

function renderRecordDetail(
  props: Partial<Omit<RecordDetailProps, "isTeamCompetition">> & {
    isTeamCompetition: boolean;
  },
  eqCalls: Array<[string, unknown]>,
) {
  const recordsChain = buildRecordsQueryChain(eqCalls);
  const competitionsChain: Record<string, unknown> = {
    select: () => competitionsChain,
    eq: () => competitionsChain,
    single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
  };

  mockUseAuth.mockReturnValue({
    supabase: {
      from: (table: string) => (table === "records" ? recordsChain : competitionsChain),
    },
    user: { id: "user-1" },
    getAccessToken: vi.fn().mockResolvedValue(null),
  });

  return render(
    <RecordDetail
      competitionId="comp-1"
      competitionName="テスト大会"
      records={[]}
      onEditCompetition={vi.fn()}
      onDeleteCompetition={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("RecordDetail — targetRecordId による内部クエリの絞り込み", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("[V-46] targetRecordId 指定時、records クエリに eq(\"id\", targetRecordId) が発行される", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    renderRecordDetail(
      { isTeamCompetition: false, targetRecordId: "record-xyz" } as Partial<RecordDetailProps> & {
        isTeamCompetition: boolean;
      },
      eqCalls,
    );

    await waitFor(() => {
      expect(eqCalls.some(([col, val]) => col === "id" && val === "record-xyz")).toBe(true);
    });
  });

  it("[V-46b] targetRecordId 未指定時は eq(\"id\", ...) を発行しない (従来どおり全記録取得)", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    renderRecordDetail({ isTeamCompetition: false }, eqCalls);

    await waitFor(() => {
      expect(eqCalls.some(([col]) => col === "competition_id")).toBe(true);
    });
    expect(eqCalls.some(([col]) => col === "id")).toBe(false);
  });

  it("[V-46c] チーム大会では targetRecordId 指定時も eq(\"user_id\", user.id) が維持される", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    renderRecordDetail(
      { isTeamCompetition: true, targetRecordId: "record-xyz" } as Partial<RecordDetailProps> & {
        isTeamCompetition: boolean;
      },
      eqCalls,
    );

    await waitFor(() => {
      expect(eqCalls.some(([col, val]) => col === "user_id" && val === "user-1")).toBe(true);
      expect(eqCalls.some(([col, val]) => col === "id" && val === "record-xyz")).toBe(true);
    });
  });

  it("[V-46d] 個人大会では targetRecordId 指定時も eq(\"competition_id\", competitionId) が維持される", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    renderRecordDetail(
      {
        isTeamCompetition: false,
        competitionId: "comp-9",
        targetRecordId: "record-xyz",
      } as Partial<RecordDetailProps> & { isTeamCompetition: boolean },
      eqCalls,
    );

    await waitFor(() => {
      expect(eqCalls.some(([col, val]) => col === "competition_id" && val === "comp-9")).toBe(
        true,
      );
    });
  });
});
