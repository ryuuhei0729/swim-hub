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
//   で直接取得する (RecordLogFormScreen.tsx の既存パターンを移植)。
//
// 【PM 裁定 (#48 との設計衝突の解消)】大会の pool_type 取得が失敗するケースには
//   (a) 大会自体が存在しない (新規作成時に不正な competition_id が渡る等) と
//   (b) 大会は存在するが RLS で参照できない (退会済みチームの大会を編集する場合) の
//   2通りがあり、アプリのランタイムからは区別する手段が無い。(a) は「無言で0を書く」
//   以外の代替が無いため throw で保存を中止すべきだが、(b) にまで throw を適用すると
//   ユーザーはチーム退会後、自分の過去記録を一切編集できなくなる (note の修正すら
//   できない)。そこで「編集モードで、かつ読み込んだ記録自身の pool_type が既知」の
//   場合に限り、0 に潰さず記録自身の pool_type を維持して保存を継続する。維持すべき
//   値が存在しない新規作成時は、従来どおり throw して保存を中止する。
//
// Sprint Contract 検証観点:
//   [V-47-1] dropdown 一覧 (useCompetitionsListQuery) に対象大会が含まれない状態
//     (= 他管理者作成チーム大会を編集するケースの再現) でも、大会の実際の pool_type
//     (長水路=1) が更新 mutation に渡る。0 が書かれてはならない。回帰を止める本体。
//   [V-47-2] 対照: dropdown 一覧に含まれる自分の大会を編集する場合は、従来通り
//     正しい pool_type で保存される (非退行)。
//   [V-47-3] 編集モードで大会の pool_type 取得が失敗した場合 (退会済みチームの大会など)、
//     無言で 0 を書かず、かつ保存も中止しない。読み込んだ記録自身の pool_type
//     (fixture は長水路=1。0 に潰されていないこと) を維持して更新 mutation が実行される。
//   [V-47-4] 対照 (境界確認): 新規作成モードで大会の pool_type 取得が失敗した場合は、
//     維持すべき記録自身の値が存在しないため、従来どおり throw して作成 mutation は
//     実行されない。「編集モードだけ維持に倒した」ことの境界を固定する。
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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  // record.pool_type=1 (長水路): V-47-1/V-47-2 では大会紐付けレコードなので大会側の
  // pool_type が優先され無視される。V-47-3 (大会取得失敗) ではこの値がそのまま維持
  // されて保存される想定のため、意図的に #47 の旧バグが書き込んでいた値である 0 を
  // 避けている (0 のままだと「維持」しても旧バグの誤 0 と区別が付かずトートロジーに
  // なる)。
  const outOfScopeRecord = {
    id: "record-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 1,
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

  // supabase.from("competitions").select(<columns>).eq("id", <id>).single() の
  // 応答をテストごとに切り替えるための Record。この画面は同じ id に対して
  // `.select("pool_type")` (保存直前) と `.select("image_paths, title")` (表示用) の
  // 複数種類の ID 直指定クエリを投げるため、列名を無視して id だけで応答を引くと
  // 片方用の fixture がもう片方に取り違えられる (Reviewer 指摘の再発防止。手本:
  // RecordFormScreen.competitionScopeImagePaths.test.tsx の normalizeColumns)。
  // そのため列名は「カンマ区切り→trim→ソート→再結合」で正規化し、id と組み合わせて
  // キーにする (例: "pool_type:comp-1")。
  const competitionByIdResponses: Record<
    string,
    { data: Record<string, unknown> | null; error: unknown }
  > = {};
  const competitionFetchCalls: Array<{ table: string; columns: string; id: string }> = [];

  function normalizeColumns(columns: string): string {
    return columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .sort()
      .join(",");
  }

  function makeSupabase() {
    return {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (_column: string, id: string) => {
            competitionFetchCalls.push({ table, columns, id });
            const responseKey = `${normalizeColumns(columns)}:${id}`;
            return {
              single: () =>
                Promise.resolve(
                  competitionByIdResponses[responseKey] ?? {
                    data: null,
                    error: new Error(`no mock response for ${table}.${responseKey}`),
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
    // useRoute のモックが参照する可変な route params。recordId は編集対象の切り替え、
    // competitionId は新規作成モード (V-47-4) で紐付け先大会を指定するために使う
    routeParams: {
      recordId: "record-1" as string | undefined,
      competitionId: undefined as string | undefined,
    },
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
    mocks.routeParams.competitionId = undefined;
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
      mocks.competitionByIdResponses["pool_type:comp-1"] = { data: { pool_type: 1 }, error: null };

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
      expect(mocks.competitionFetchCalls).toContainEqual({
        table: "competitions",
        columns: "pool_type",
        id: "comp-1",
      });
    },
  );

  it(
    "[V-47-2] 対照: dropdown 一覧に含まれる自分の大会 (comp-2) を編集する場合は、" +
      "従来通り正しい pool_type で保存される (非退行)",
    async () => {
      mocks.routeParams.recordId = "record-2";
      mocks.competitionByIdResponses["pool_type:comp-2"] = { data: { pool_type: 1 }, error: null };

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

describe("RecordFormScreen — issue #47/#48: 大会の pool_type 取得に失敗した場合の挙動 (PM 裁定: 編集モードは維持、新規作成は中止)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-1";
    mocks.routeParams.competitionId = undefined;
    Object.keys(mocks.competitionByIdResponses).forEach((k) => delete mocks.competitionByIdResponses[k]);
    mocks.competitionFetchCalls.length = 0;
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    mocks.createMutateAsync.mockResolvedValue({ id: "record-new" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it(
    "[V-47-3] 編集モードで pool_type 取得が失敗しても保存は中止しない。読み込んだ記録自身の " +
      "pool_type (長水路=1。0 に潰されていないこと) を維持して更新 mutation が実行される " +
      "(PM 裁定: 退会済みチームの記録もユーザーが編集できる状態を保つ)",
    async () => {
      mocks.competitionByIdResponses["pool_type:comp-1"] = {
        data: null,
        error: new Error("competitions row not found"),
      };

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
      // 本体assert: 記録自身の pool_type (長水路=1) が維持される。0 に潰されてはならない
      expect(updates.pool_type).toBe(1);
      expect(updates.pool_type).not.toBe(0);

      // pool_type 取得は実際に試みており、単に取得をスキップして常に維持側へ
      // フォールバックしているわけではないことを確認する
      expect(mocks.competitionFetchCalls).toContainEqual({
        table: "competitions",
        columns: "pool_type",
        id: "comp-1",
      });

      // 保存は中止されていない (エラーダイアログは出ない)
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );

  it(
    "[V-47-4] 対照 (境界確認): 新規作成モードで pool_type 取得が失敗した場合、維持すべき" +
      "記録自身の値が存在しないため、従来どおり throw して作成 mutation は実行されない " +
      "(編集モードだけ「維持」に倒したことの境界を固定する)",
    async () => {
      mocks.routeParams.recordId = undefined;
      mocks.routeParams.competitionId = "comp-1";
      mocks.competitionByIdResponses["pool_type:comp-1"] = {
        data: null,
        error: new Error("competitions row not found"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // バリデーションを通すため、保存に必要な種目・タイムをストアへ直接設定する
      // (新規作成フォームは空欄始まりのため、レコード読み込みによる自動初期化が無い)。
      // マウント時の「編集モード切り替え・レコードID変更時に初期化フラグをリセット」
      // useEffect (isEditMode=false → initialize() で空フォームに戻す) の後に設定する
      // 必要があるため、render 前ではなく画面表示後に行う。act() で包み、React の
      // 再レンダー確定後に画面反映を待ってからクリックする (act 外の store 更新は
      // クリックの fireEvent と競合し、styleId/time が古いままの closure で
      // validate() が呼ばれてしまう)
      act(() => {
        useRecordStore.getState().setStyleId(2);
        useRecordStore.getState().setTime(30.5);
      });

      await waitFor(() => {
        expect(screen.getByText("50m自由形")).toBeDefined();
      });

      fireEvent.click(screen.getByText("保存"));

      // 新規作成モードは isEditMode=false かつ fetchedRecord が無いため、修正後の
      // 「編集モードなら維持」分岐に入らず、従来どおり throw → 外側 catch → Alert.alert
      await waitFor(() => {
        expect(vi.mocked(Alert.alert).mock.calls.length).toBeGreaterThan(0);
      });

      expect(mocks.createMutateAsync).not.toHaveBeenCalled();
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();

      expect(mocks.competitionFetchCalls).toContainEqual({
        table: "competitions",
        columns: "pool_type",
        id: "comp-1",
      });
    },
  );
});
