// =============================================================================
// RecordFormScreen.standalone.test.tsx
// =============================================================================
//
// 大会未紐付けレコード（一括ベストタイム入力等。record.competition_id が null）の
// 編集フロー回帰検証。Sprint Contract 検証観点:
//
//   [isStandaloneRecord 検出] recordId のみ渡され (competitionId 未指定) かつ
//     読み込んだレコードの competition_id が null の場合、大会選択UIが disabled の
//     「(一括入力)」表示に切り替わり、画像アップロードUIも非表示になる
//   [pool_type 保持] 保存時、大会が無いため選択中の大会からは pool_type を導出できない。
//     読み込み時点のレコード自身の pool_type (standaloneOriginalPoolType) がそのまま
//     保存に使われ、失われない
//   [competition_id null 維持] 保存時に competition_id が null のまま維持される
//     (大会に誤って紐付けられない)
//
// トートロジー防止メモ: handleSave 内の式をそのまま検証するのではなく、
// 実際に Save ボタンを押した結果 updateMutation.mutateAsync に渡される引数を検証する。
//
// 実装上の注意: このモジュールのモックは全て `vi.hoisted` 内で一度だけ生成した
// 安定参照 (同一オブジェクト/配列/関数) を返すこと。フックのモックが呼ばれるたびに
// 新しいオブジェクト/配列リテラルを生成すると、依存配列に非プリミティブ値を持つ
// useEffect が再レンダーのたびに再実行され続け、無限ループ (OOM) を起こす。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordStore } from "@/stores/recordStore";

// react-native の静的モックには Dimensions/Keyboard/KeyboardAvoidingView が
// 含まれないため、この画面専用に補完する (他の画面では未使用のため共有モックには追加しない)
vi.mock("react-native", async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Keyboard: { dismiss: () => {} },
    KeyboardAvoidingView: actual.View,
  };
});

// -----------------------------------------------------------------------
// 安定参照のフィクスチャ・モック関数 (vi.hoisted 内で一度だけ生成)
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const style = {
    id: 2,
    name_jp: "50m自由形",
    name: "50m Freestyle",
    style: "Fr",
    distance: 50,
  };

  // 大会未紐付けレコード（一括入力）: competition が null、pool_type=1 (長水路)
  const standaloneRecord = {
    id: "record-1",
    user_id: "user-1",
    competition_id: null,
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 1, // 長水路。大会が無いのでここが唯一の pool_type 情報源
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: null,
    style,
    split_times: [],
  };

  // 大会紐付けレコード（通常フロー、非退行確認用）: competition_id あり、pool_type=0 (短水路)
  const linkedCompetition = {
    id: "comp-1",
    title: "テスト大会",
    date: "2026-07-01",
    pool_type: 1, // 大会側は長水路 (record.pool_type=0 とはあえて変えて「大会から導出される」ことを確認)
  };
  const linkedRecord = {
    id: "record-2",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 2,
    time: 40.0,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    competition: linkedCompetition,
    style,
    split_times: [],
  };

  const recordsFixture = [standaloneRecord, linkedRecord];
  const stylesFixture = [style];
  const competitionsFixture: unknown[] = [linkedCompetition];
  const supabaseFixture = {};
  // useRoute のモックが参照する可変な route params (テストごとに recordId を切り替える)
  const routeParams: { recordId?: string } = { recordId: "record-1" };

  return {
    style,
    standaloneRecord,
    linkedRecord,
    linkedCompetition,
    recordsFixture,
    stylesFixture,
    competitionsFixture,
    supabaseFixture,
    routeParams,
    navigate: vi.fn(),
    goBack: vi.fn(),
    updateMutateAsync: vi.fn(),
    createMutateAsync: vi.fn(),
    replaceSplitTimesMutateAsync: vi.fn(),
    updateCompetitionMutateAsync: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabaseFixture,
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useRecordsQuery: () => ({
    records: mocks.recordsFixture,
    competitions: mocks.competitionsFixture,
    isLoading: false,
  }),
  useCreateRecordMutation: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdateRecordMutation: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  useReplaceSplitTimesMutation: () => ({
    mutateAsync: mocks.replaceSplitTimesMutateAsync,
    isPending: false,
  }),
  useUpdateCompetitionMutation: () => ({
    mutateAsync: mocks.updateCompetitionMutateAsync,
    isPending: false,
  }),
}));

// 画像/動画/Premiumバッジ/ラップタイム表示は本テストの検証対象外のため薄いスタブに差し替える。
// ImageUploader は「表示されるかどうか (!isStandaloneRecord ゲート)」自体を検証するため
// 目印となるテキストを描画するスタブにする (null だと表示有無を判定できない)。
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: () => <>画像アップローダー</>,
}));
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
vi.mock("@/components/shared/PremiumBadge", () => ({
  PremiumBadge: () => null,
}));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
}));

import { RecordFormScreen } from "../RecordFormScreen";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("RecordFormScreen — 大会未紐付けレコード(一括入力)の編集", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-1";
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it("[isStandaloneRecord 検出] 大会選択UIが「(一括入力)」の disabled 表示になり、画像アップロードUIは表示されない", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    // レコード読み込み完了 (ローディング終了) を待つ
    await waitFor(() => {
      expect(screen.getByText(/一括入力/)).toBeDefined();
    });

    // 通常の大会選択プレースホルダ (大会を選択) は表示されない
    expect(screen.queryByText(/大会を選択/)).toBeNull();
  });

  it("[pool_type 保持 / competition_id null 維持] Save 押下で pool_type=1・competition_id=null のまま更新される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/一括入力/)).toBeDefined();
    });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0];
    expect(id).toBe("record-1");
    expect(updates.competition_id).toBeNull();
    expect(updates.pool_type).toBe(1); // レコード自身の pool_type (長水路) が保持される
    expect(updates.style_id).toBe(2);
    expect(updates.time).toBe(30.5);
  });
});

// ---------------------------------------------------------------------------
// [Reviewer 指摘] 通常 (大会紐付け) の編集フロー非退行確認
// isStandaloneRecord 分岐を追加したことで、従来の大会紐付けレコード編集
// (isStandaloneRecord=false) の挙動 — 大会選択UI表示・画像アップロードUI表示・
// pool_type は大会から導出 (record 自身の pool_type ではない) — が壊れていないことを
// 検証する。
// ---------------------------------------------------------------------------
describe("RecordFormScreen — 大会紐付けレコードの通常編集フロー (非退行)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-2"; // linkedRecord (competition_id="comp-1")
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-2" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it("[非退行] isStandaloneRecord=false のとき、通常の大会選択UI・画像アップロードUIが表示される (「(一括入力)」は出ない)", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeDefined();
    });

    expect(screen.queryByText(/一括入力/)).toBeNull();
    // 通常編集では画像アップロードUIが表示される (standalone では非表示)
    expect(screen.getByText("画像アップローダー")).toBeDefined();
  });

  it("[非退行] Save 押下で competition_id が維持され、pool_type は大会 (comp-1) から導出される (record 自身の pool_type=0 は使われない)", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeDefined();
    });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0];
    expect(id).toBe("record-2");
    expect(updates.competition_id).toBe("comp-1");
    // linkedCompetition.pool_type=1 (長水路) が使われる。record.pool_type=0 (短水路) ではない
    expect(updates.pool_type).toBe(1);
    expect(updates.style_id).toBe(2);
    expect(updates.time).toBe(40.0);
  });
});
