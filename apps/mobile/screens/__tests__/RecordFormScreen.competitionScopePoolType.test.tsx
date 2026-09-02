// =============================================================================
// RecordFormScreen.competitionScopePoolType.test.tsx
// =============================================================================
//
// GitHub issue #47 の回帰テスト。
//
// バグ (修正前): 保存時の pool_type 決定が
//   `competitions.find((c) => c.id === finalCompetitionId)` に依存していた。
//   `competitions` は useCompetitionsListQuery (RecordAPI.getCompetitions の
//   `.or("user_id.eq.<self>,user_id.is.null")` スコープ) 由来で、他管理者が作成した
//   チーム大会を含まない。対象の大会がこのスコープに乗らない場合 `.find()` が外れ、
//   `selectedCompetition?.pool_type ?? 0` で無言のまま短水路 (0) が保存されていた。
//
// 修正後 (App Developer): `competitions.find()` を廃し、finalCompetitionId から
//   `supabase.from("competitions").select("pool_type").eq("id", finalCompetitionId).single()`
//   で直接取得する (RecordLogFormScreen.tsx の既存パターンを移植)。取得失敗時は
//   `recordMobile.competitionFetchFailed` を throw し、無言で 0 を書かず保存自体を中止する。
//
// Sprint Contract 検証観点:
//   [V-47-1] dropdown 一覧 (useCompetitionsListQuery) に対象大会が含まれない状態
//     (= 他管理者作成チーム大会を編集するケースの再現) でも、大会の実際の pool_type
//     (長水路=1) が更新 mutation に渡る。0 が書かれてはならない。回帰を止める本体。
//   [V-47-2] 対照: dropdown 一覧に含まれる自分の大会を編集する場合は、従来通り
//     正しい pool_type で保存される (非退行)。
//   [V-47-3] 大会の pool_type 取得が失敗した場合、無言で 0 を書くより保存自体を
//     中止する方が安全、という設計を固定する。更新 mutation は実行されない。
//
// トートロジー防止メモ: handleSave 内の式をコピーして検証するのではなく、実際に
// RecordFormScreen を render → Save ボタン押下 → updateMutation.mutateAsync に
// 渡された実際の引数を検証する。DB 境界 (supabase.from("competitions")...) と
// useCompetitionsListQuery の一覧だけをモックし、.find() が外れる状況は
// 「一覧にその大会を含めない」という現実的なモックデータで再現する
// (ロジックの自作ハーネスは行わない)。
//
// 実装上の注意: モックは全て `vi.hoisted` 内で一度だけ生成した安定参照を返す
// (RecordFormScreen.standalone.test.tsx と同じ理由: useEffect の無限ループを防ぐ)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { useRecordStore } from "@/stores/recordStore";

// react-native の静的モックには Dimensions/Keyboard/KeyboardAvoidingView が
// 含まれないため、この画面専用に補完する (RecordFormScreen.standalone.test.tsx と同じ)
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
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

  // 他管理者が作成した長水路 (pool_type=1) のチーム大会。RecordAPI.getCompetitions()
  // の `.or("user_id.eq.<self>,user_id.is.null")` スコープに乗らないため、
  // ドロップダウン一覧 (useCompetitionsListQuery) には含まれない。
  // record.pool_type=0 はレコード自身の値で、大会紐付けレコードでは無視されるべき。
  const outOfScopeRecord = {
    id: "record-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    competition: null,
    style,
    split_times: [],
  };

  // 対照ケース: 自分が作成し、dropdown 一覧のスコープに含まれる大会
  const inScopeCompetition = {
    id: "comp-2",
    title: "自分の大会",
    date: "2026-08-01",
    pool_type: 1,
  };
  const inScopeRecord = {
    id: "record-2",
    user_id: "user-1",
    competition_id: "comp-2",
    style_id: 2,
    time: 45.0,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    competition: inScopeCompetition,
    style,
    split_times: [],
  };

  const recordsFixture = [outOfScopeRecord, inScopeRecord];
  const stylesFixture = [style];
  // dropdown 一覧 (useCompetitionsListQuery) は comp-1 (他管理者作成チーム大会) を含まない
  const competitionsFixture: unknown[] = [inScopeCompetition];

  // supabase.from("competitions").select("pool_type").eq("id", <id>).single() の
  // 応答をテストごとに切り替えるための Record。table:id をまたいだ取り違えを防ぐため
  // id をキーにする (テスト側で mocks.competitionByIdResponses["comp-1"] = {...} と書ける)
  const competitionByIdResponses: Record<
    string,
    { data: { pool_type: number } | null; error: unknown }
  > = {};
  const competitionFetchCalls: Array<{ table: string; id: string }> = [];

  function makeSupabase() {
    return {
      from: (table: string) => ({
        select: (_columns: string) => ({
          eq: (_column: string, id: string) => {
            competitionFetchCalls.push({ table, id });
            return {
              single: () =>
                Promise.resolve(
                  competitionByIdResponses[id] ?? {
                    data: null,
                    error: new Error(`no mock response for ${table}:${id}`),
                  },
                ),
            };
          },
        }),
      }),
    };
  }

  return {
    style,
    recordsFixture,
    stylesFixture,
    competitionsFixture,
    competitionByIdResponses,
    competitionFetchCalls,
    supabase: makeSupabase(),
    // useRoute のモックが参照する可変な route params (テストごとに recordId を切り替える)
    routeParams: { recordId: "record-1" as string | undefined },
    navigate: vi.fn(),
    goBack: vi.fn(),
    updateMutateAsync: vi.fn(),
    createMutateAsync: vi.fn(),
    replaceSplitTimesMutateAsync: vi.fn(),
    updateCompetitionMutateAsync: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(),
    refetchRecordById: vi.fn(),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
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
  // 大会選択ドロップダウン用の一覧。他管理者作成のチーム大会 (comp-1) を意図的に含めない
  useCompetitionsListQuery: () => ({
    data: mocks.competitionsFixture,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordByIdQuery: (_supabase: unknown, recordId: string) => {
    const found = recordId ? mocks.recordsFixture.find((r) => r.id === recordId) ?? null : undefined;
    return {
      data: found,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mocks.refetchRecordById,
    };
  },
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

// 画像/動画/Premiumバッジ/ラップタイム表示は本テストの検証対象外のため薄いスタブに差し替える
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

describe("RecordFormScreen — issue #47: dropdown一覧のスコープ外の大会を編集しても正しい pool_type が保存される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-1";
    Object.keys(mocks.competitionByIdResponses).forEach((k) => delete mocks.competitionByIdResponses[k]);
    mocks.competitionFetchCalls.length = 0;
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it(
    "[V-47-1] 対象大会 (comp-1) が dropdown 一覧に無い状態で保存すると、大会の実際の pool_type " +
      "(長水路=1) が更新 mutation に渡る。0 が書かれてはならない (修正前の .find() ミスの回帰確認)",
    async () => {
      // comp-1 は他管理者作成の長水路チーム大会。DB 直接取得は pool_type=1 を返す
      mocks.competitionByIdResponses["comp-1"] = { data: { pool_type: 1 }, error: null };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      expect(id).toBe("record-1");
      expect(updates.competition_id).toBe("comp-1");
      // 回帰を止める本体assert: 大会の実際の pool_type (長水路=1) が使われる
      expect(updates.pool_type).toBe(1);
      // 将来また `?? 0` 相当の実装に戻されても検知できるよう明示的に禁止する
      expect(updates.pool_type).not.toBe(0);

      // DB 直接取得 (comp-1) が実際に呼ばれたことも確認する
      // (.find() に戻っていれば supabase.from は一度も呼ばれない)
      expect(mocks.competitionFetchCalls).toContainEqual({ table: "competitions", id: "comp-1" });
    },
  );

  it(
    "[V-47-2] 対照: dropdown 一覧に含まれる自分の大会 (comp-2) を編集する場合は、" +
      "従来通り正しい pool_type で保存される (非退行)",
    async () => {
      mocks.routeParams.recordId = "record-2";
      mocks.competitionByIdResponses["comp-2"] = { data: { pool_type: 1 }, error: null };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0]!;
      expect(id).toBe("record-2");
      expect(updates.competition_id).toBe("comp-2");
      expect(updates.pool_type).toBe(1);
    },
  );
});

describe("RecordFormScreen — issue #47: 大会の pool_type 取得に失敗した場合は保存を中止する (無言で0を書かない)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-1";
    Object.keys(mocks.competitionByIdResponses).forEach((k) => delete mocks.competitionByIdResponses[k]);
    mocks.competitionFetchCalls.length = 0;
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it(
    "[V-47-3] pool_type 取得がエラーを返す場合、更新 mutation は実行されない " +
      "(誤った pool_type で無言で保存されるより、保存を中止する方が安全という設計を固定する)",
    async () => {
      mocks.competitionByIdResponses["comp-1"] = {
        data: null,
        error: new Error("competitions row not found"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("保存"));

      // 修正前は例外が発生せず updateMutateAsync が呼ばれてしまうため Alert は出ない。
      // 修正後は throw → 外側 catch → Alert.alert が呼ばれ、updateMutateAsync は呼ばれない。
      // どちらの経路でも「何かが起きる」ことを待ってから、実行されなかったことを厳密に確認する
      // (Alert 発火のみを待つと修正前は永久にタイムアウトしてしまうため)。
      await waitFor(() => {
        expect(
          vi.mocked(Alert.alert).mock.calls.length + mocks.updateMutateAsync.mock.calls.length,
        ).toBeGreaterThan(0);
      });

      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    },
  );
});
