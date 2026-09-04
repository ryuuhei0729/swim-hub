// =============================================================================
// RecordFormScreen.competitionScopeImagePaths.test.tsx
// =============================================================================
//
// GitHub issue #48 の回帰テスト (画像パス編)。
//
// バグ: 保存時の既存画像パス (existingImagePaths) の由来が、L234-270 の
//   `competitions.find((c) => c.id === currentCompetitionId)` (useCompetitionsListQuery
//   = RecordAPI.getCompetitions() の `.or("user_id.eq.<self>,user_id.is.null")` 個人スコープ)
//   に依存している。対象の大会が他管理者作成のチーム大会等でこのスコープに乗らない場合
//   `.find()` が外れ、existingImagePaths が [] のまま保存される。
//   結果、画像を1枚追加しただけで `updateCompetitionMutation` に渡る `image_paths` が
//   新規1枚だけの配列に「全置換」され、既存の画像が静かに失われる。
//
// 修正方針 (PM 確定): L234-270 の `.find()` を廃し、保存直前に
//   `supabase.from("competitions").select("image_paths").eq("id", finalCompetitionId).single()`
//   で権威ある image_paths を取得してから mergeImagePaths の第1引数に渡す。
//   取得に失敗した場合は「不明」状態を持ち、image_paths を含む update 自体を送らない
//   (無言で [] を書いて全置換を許してはならない)。
//
// Sprint Contract 検証観点:
//   [V-48-1] dropdown 一覧 (useCompetitionsListQuery) に対象大会が含まれない状態で
//     画像を1枚追加したとき、image_paths は既存2件+新規1件の計3件になる (厳密一致)。
//   [V-48-2] 同じ状況で、権威ある image_paths の取得自体も失敗したとき、
//     image_paths を含む update は一切送られない (全置換を起こさない)。
//   [V-48-3] 削除のみのケースで、削除対象以外の既存パスが保持される。
//   [V-48-4] 追加と削除が同時のケースで正しく merge される。
//   [V-48-5] 自分が作成した大会 (dropdown 一覧のスコープ内) での画像追加は非退行。
//     (このテストは現状の実装でも green になるはずの対照ケース。もし red になったら
//      テストハーネス自体の設計ミスを疑うこと)
//   [V-48-6] PM 裁定 (#47 との設計衝突の解消): 退会済みチームの大会 (RLS で
//     competitions が SELECT できない) に紐づく過去記録でも、レコード自体の保存は
//     成功する。pool_type は記録自身の値を維持し (0 に潰されていないこと)、大会取得
//     失敗を理由に保存全体を throw で中止してはならない (根拠: 一律 throw すると、
//     退会済みチームの記録を持つユーザーは note の修正すら一切できなくなる。
//     RecordFormScreen.competitionScopePoolType.test.tsx の V-47-3 と同一の分岐
//     [isEditMode && fetchedRecord] を通る)。
//   [V-48-11] dropdown 一覧のスコープ外の大会で、ID 直指定取得した title が画面に
//     表示される (実装4: selectedCompetitionName の title 解決)。
//   [V-48-12] ID 直指定取得は成功したが title が DB 上 NULL の場合、汎用フォールバック
//     文言 (t("recordMobile.fallbackTitle")) が表示され、未選択プレースホルダーは
//     表示されない (PM 判断で確定した仕様。根拠: initial_schema.sql:684 の
//     competitions.title カラムコメント「大会名（NULLの場合は「大会」と表示）」)。
//   [V-48-13] ID 直指定取得自体が失敗した場合、selectedCompetitionTitle は undefined の
//     ままとなり、従来どおり dropdown 一覧からの解決にフォールバックする (非退行)。
//
// トートロジー防止メモ: handleSave 内の式をコピーして検証するのではなく、実際に
// RecordFormScreen を render → 画像操作 → Save ボタン押下 → updateCompetitionMutation
// .mutateAsync に渡された実際の引数を検証する。mergeImagePaths はプロダクションの実装
// (@/utils/imageUpload) をそのまま使い (vi.importActual)、DB 境界
// (supabase.from("competitions")...) と useCompetitionsListQuery の一覧、
// ImageUploader の UI 操作だけをモックする。同様に [V-48-11]〜[V-48-13] も
// selectedCompetitionName の式をコピーせず、実際に画面に描画されたテキストを見る。
//
// クエリ引数を捨てない: supabase モックは select() に渡された columns 文字列を見て
// 応答を振り分ける。この画面が投げる ID 直指定クエリは
//   (a) `.select("pool_type")` (保存直前、大会からプールタイプを取得)
//   (b) `.select("image_paths")` (保存直前、権威ある既存画像パスを再取得)
//   (c) `.select("image_paths, title")` (表示用、既存画像と大会名を取得)
// の3種類が同じ id に対して飛んでくる。過去に (b) と (c) を `columns.includes("image_paths")`
// という部分一致だけで同一バケットに丸め込んだ結果、(c) 用の fixture に title が
// 存在せず title が常に null に潰れる取り違えが起きた (Reviewer 指摘)。
// そのため列名は「カンマ区切り→trim→ソート→再結合」で正規化し、(a)(b)(c) を
// 別々の応答として区別できるキーにする。
//
// 実装上の注意: モックは全て `vi.hoisted` 内で一度だけ生成した安定参照を返す
// (RecordFormScreen.standalone.test.tsx と同じ理由: useEffect の無限ループを防ぐ)。
// resolveGalleryImages は実装をモックに差し替える (実装をそのまま使うと
// env.webApiUrl = https://swim-hub.app への実ネットワークアクセスが発生してしまうため)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { useRecordStore } from "@/stores/recordStore";

// react-native の静的モックには Dimensions/Keyboard/KeyboardAvoidingView が
// 含まれないため、この画面専用に補完する (他の RecordFormScreen テストと同じ)
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

  // 他管理者が作成した長水路チーム大会。dropdown 一覧 (useCompetitionsListQuery) の
  // `.or("user_id.eq.<self>,user_id.is.null")` スコープに乗らない (.find() が外れる対象)。
  // 既存画像を2枚保持している (DB上の権威あるデータ)。
  const outOfScopeCompetition = {
    id: "comp-1",
    title: "他管理者のチーム大会",
    date: "2026-08-01",
    pool_type: 1,
    image_paths: ["team/comp1/existing-a.jpg", "team/comp1/existing-b.jpg"],
  };
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

  // 対照: 自分が作成し、dropdown 一覧のスコープに含まれる大会 (非退行確認用)
  const ownCompetition = {
    id: "comp-3",
    title: "自分の大会",
    date: "2026-08-05",
    pool_type: 1,
    image_paths: ["self/comp3/existing.jpg"],
  };
  const ownRecord = {
    id: "record-3",
    user_id: "user-1",
    competition_id: "comp-3",
    style_id: 2,
    time: 45.0,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
    competition: ownCompetition,
    style,
    split_times: [],
  };

  // 退会済みチームの大会に紐づく過去記録。competition_id は非nullのまま残るが、
  // RLS で SELECT/UPDATE とも拒否される想定 (V-48-6)。
  // pool_type=1 (長水路): PM 裁定により「大会取得に失敗しても記録自身の pool_type を
  // 維持して保存を継続する」仕様になったため、fixture を #47/#48 の旧バグが書き込んで
  // いた値である 0 のままにすると、維持しても 0 が書かれる旧バグと区別が付かず
  // トートロジーになる。意図的に非0にして「0 に潰されていないこと」を検証可能にする。
  const withdrawnTeamRecord = {
    id: "record-6",
    user_id: "user-1",
    competition_id: "comp-9",
    style_id: 2,
    time: 50.0,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    competition: null, // RLS で join が落ちている
    style,
    split_times: [],
  };

  const newImageFileFixture = {
    uri: "file:///tmp/new-photo.jpg",
    base64: "new-photo-base64-data",
    fileExtension: "jpg",
  };

  const recordsFixture = [outOfScopeRecord, ownRecord, withdrawnTeamRecord];
  const stylesFixture = [style];
  // dropdown 一覧は comp-1 (他管理者チーム大会) ・ comp-9 (退会済みチーム大会) を含まない
  const competitionsFixture: unknown[] = [ownCompetition];

  // supabase.from("competitions").select(<columns>).eq("id", <id>).single() の
  // 応答をテストごとに切り替えるための Record。同じ id に対して
  // `.select("pool_type")` / `.select("image_paths")` / `.select("image_paths, title")`
  // という3種類の ID 直指定クエリが飛んでくるため、columns を正規化 (カンマ区切り→trim→
  // ソート→再結合) してキーにし、単独クエリと結合クエリを別バケットとして区別する
  // (キーは `${正規化後のcolumns}:${id}`。例: "image_paths:comp-1" と
  // "image_paths,title:comp-1" は別キー)。
  // 部分一致 (`columns.includes("image_paths")`) で振り分けると、結合クエリが
  // 単独クエリ用の fixture (title を持たない) に丸め込まれ title が常に欠落する
  // 取り違えが起きる (Reviewer 指摘の Critical)。
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
    outOfScopeCompetition,
    ownCompetition,
    newImageFileFixture,
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
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    resolveGalleryImages: vi.fn(),
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
  // 大会選択ドロップダウン用の一覧。他管理者作成のチーム大会 (comp-1) ・
  // 退会済みチームの大会 (comp-9) を意図的に含めない
  useCompetitionsListQuery: () => ({
    data: mocks.competitionsFixture,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordByIdQuery: (_supabase: unknown, recordId: string) => {
    const found = recordId ? (mocks.recordsFixture.find((r) => r.id === recordId) ?? null) : undefined;
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

// mergeImagePaths は本番実装 (プロダクションロジック) をそのまま使う。
// uploadImagesViaApi / deleteImagesViaApi / resolveGalleryImages は実ネットワーク
// アクセス (Web API 経由) を伴うためモックに差し替える。
vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return {
    ...actual,
    uploadImagesViaApi: mocks.uploadImagesViaApi,
    deleteImagesViaApi: mocks.deleteImagesViaApi,
    resolveGalleryImages: mocks.resolveGalleryImages,
  };
});

// 画像アップローダーは、テストから「追加」「削除」「追加+削除同時」を明示的に
// 発火できる薄いスタブに差し替える。ボタンが押す既存パスは
// mocks.outOfScopeCompetition.image_paths を直接参照する (RecordFormScreen 内部の
// existingImages state 経由にしない。ここはまさにバグで空になりうる state であり、
// それに依存すると「ユーザーが実際に見ている画像を削除できる」という前提が
// テストの成否に紛れ込んでしまうため)。
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({
    onImagesChange,
  }: {
    onImagesChange: (
      newFiles: { uri: string; base64: string; fileExtension: string }[],
      deletedIds: string[],
    ) => void;
  }) => (
    <>
      画像アップローダー
      <button onClick={() => onImagesChange([mocks.newImageFileFixture], [])}>画像を1枚追加</button>
      <button
        onClick={() =>
          onImagesChange([], [mocks.outOfScopeCompetition.image_paths[0]!])
        }
      >
        既存画像1枚目を削除
      </button>
      <button
        onClick={() =>
          onImagesChange(
            [mocks.newImageFileFixture],
            [mocks.outOfScopeCompetition.image_paths[0]!],
          )
        }
      >
        追加と削除を同時に行う
      </button>
    </>
  ),
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

// 画像パスの update 呼び出しだけを抽出するヘルパー (image_paths キーを含む updates を
// 持つ呼び出しのみ)。V-48-2 で「image_paths を含む update が一切送られない」ことを
// 「呼ばれなかった」でも「呼ばれたが image_paths キーが無い」でも検知できるようにする。
function imagePathsUpdateCalls() {
  return mocks.updateCompetitionMutateAsync.mock.calls.filter(([arg]) => {
    const updates = (arg as { updates?: Record<string, unknown> } | undefined)?.updates;
    return !!updates && Object.prototype.hasOwnProperty.call(updates, "image_paths");
  });
}

describe("RecordFormScreen — issue #48: dropdown一覧のスコープ外の大会で画像を編集すると image_paths が全置換される", () => {
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
    mocks.updateCompetitionMutateAsync.mockResolvedValue({ id: "comp-1" });
    mocks.resolveGalleryImages.mockResolvedValue([]);
    mocks.uploadImagesViaApi.mockResolvedValue([{ path: "team/comp1/new-upload.jpg" }]);
    mocks.deleteImagesViaApi.mockResolvedValue(undefined);

    // 権威あるDB応答のデフォルト (comp-1: 対象大会 / comp-3: 対照の自分の大会)
    mocks.competitionByIdResponses["pool_type:comp-1"] = { data: { pool_type: 1 }, error: null };
    mocks.competitionByIdResponses["image_paths:comp-1"] = {
      data: { image_paths: [...mocks.outOfScopeCompetition.image_paths] },
      error: null,
    };
    // 表示用の結合クエリ (`.select("image_paths, title")`)。保存直前の再取得
    // (`.select("image_paths")` 単独) とは別キーで管理する。
    mocks.competitionByIdResponses["image_paths,title:comp-1"] = {
      data: {
        image_paths: [...mocks.outOfScopeCompetition.image_paths],
        title: mocks.outOfScopeCompetition.title,
      },
      error: null,
    };
    mocks.competitionByIdResponses["pool_type:comp-3"] = { data: { pool_type: 1 }, error: null };
    mocks.competitionByIdResponses["image_paths:comp-3"] = {
      data: { image_paths: [...mocks.ownCompetition.image_paths] },
      error: null,
    };
    mocks.competitionByIdResponses["image_paths,title:comp-3"] = {
      data: {
        image_paths: [...mocks.ownCompetition.image_paths],
        title: mocks.ownCompetition.title,
      },
      error: null,
    };
  });

  it(
    "[V-48-1] 対象大会 (comp-1) が dropdown 一覧に無い状態で画像を1枚追加すると、" +
      "image_paths は既存2件+新規1件の計3件になる (厳密一致。全置換が起きてはならない)",
    async () => {
      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(mocks.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = mocks.updateCompetitionMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      expect(id).toBe("comp-1");
      // 回帰を止める本体assert: 既存2件が失われず、新規1件が追加された計3件になる
      expect(updates.image_paths).toEqual([
        "team/comp1/existing-a.jpg",
        "team/comp1/existing-b.jpg",
        "team/comp1/new-upload.jpg",
      ]);
      expect(updates.image_paths).toHaveLength(3);

      // 設計確認: 権威あるDBから ID 直指定で image_paths を取得していること
      // (.find() のままなら comp-1 に対する image_paths 直指定クエリは発生しない)
      expect(
        mocks.competitionFetchCalls.some(
          (c) => c.table === "competitions" && c.id === "comp-1" && c.columns.includes("image_paths"),
        ),
      ).toBe(true);
    },
  );

  it(
    "[V-48-2] 権威ある image_paths の取得自体が失敗した場合、image_paths を含む update は" +
      "一切送られない (無言で既存パスを [] とみなして全置換してはならない)",
    async () => {
      mocks.competitionByIdResponses["image_paths:comp-1"] = {
        data: null,
        error: new Error("RLS denied: cannot read competitions row"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      // レコード自体の保存 (updateMutateAsync) か、失敗ダイアログ (Alert) か、
      // いずれかで「何かが起きた」ことを待ってから、image_paths 付き update が
      // 送られていないことを厳密に確認する。
      await waitFor(() => {
        expect(
          mocks.updateMutateAsync.mock.calls.length + vi.mocked(Alert.alert).mock.calls.length,
        ).toBeGreaterThan(0);
      });

      expect(imagePathsUpdateCalls()).toHaveLength(0);
    },
  );

  it("[V-48-3] 削除のみのケースで、削除対象以外の既存パスが保持される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });

    fireEvent.click(screen.getByText("既存画像1枚目を削除"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mocks.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ updates }] = mocks.updateCompetitionMutateAsync.mock.calls[0]!;
    expect(updates.image_paths).toEqual(["team/comp1/existing-b.jpg"]);
    expect(updates.image_paths).toHaveLength(1);
  });

  it("[V-48-4] 追加と削除が同時のケースで正しく merge される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });

    fireEvent.click(screen.getByText("追加と削除を同時に行う"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(mocks.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ updates }] = mocks.updateCompetitionMutateAsync.mock.calls[0]!;
    expect(updates.image_paths).toEqual(["team/comp1/existing-b.jpg", "team/comp1/new-upload.jpg"]);
    expect(updates.image_paths).toHaveLength(2);
  });

  it(
    "[V-48-5 / 非退行] 自分が作成した大会 (comp-3, dropdown 一覧のスコープ内) での画像追加は、" +
      "既存の実装のままでも正しく merge される (このテストが red になったらハーネス自体を疑うこと)",
    async () => {
      mocks.routeParams.recordId = "record-3";
      mocks.uploadImagesViaApi.mockResolvedValue([{ path: "self/comp3/new-upload.jpg" }]);

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(mocks.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = mocks.updateCompetitionMutateAsync.mock.calls[0]!;
      expect(id).toBe("comp-3");
      expect(updates.image_paths).toEqual(["self/comp3/existing.jpg", "self/comp3/new-upload.jpg"]);
      expect(updates.image_paths).toHaveLength(2);
    },
  );

  it(
    "[V-48-11] dropdown 一覧のスコープ外の大会 (comp-1) で、ID 直指定取得した title が" +
      "画面に表示される (実装4: selectedCompetitionName の title 解決)",
    async () => {
      // dropdown 一覧 (competitionsFixture) にはこの文字列を含む大会名は存在しない
      // (ownCompetition.title = "自分の大会" のみ)。部分文字列関係にもならない、
      // このテスト固有のタイトルにすることで、たまたま dropdown 側の解決経路で
      // 一致してしまうトートロジーを防ぐ。
      const idDirectFetchOnlyTitle = "ID直指定限定表示名アルファ";
      mocks.competitionByIdResponses["image_paths,title:comp-1"] = {
        data: {
          image_paths: [...mocks.outOfScopeCompetition.image_paths],
          title: idDirectFetchOnlyTitle,
        },
        error: null,
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      await waitFor(() => {
        expect(screen.getByText(idDirectFetchOnlyTitle)).toBeDefined();
      });

      // プレースホルダーには絶対に落ちていないこと
      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );

  it(
    "[V-48-12] ID 直指定取得は成功したが title が DB 上 NULL の場合、汎用フォールバック" +
      "文言 (t(\"recordMobile.fallbackTitle\")) が表示され、未選択プレースホルダーは" +
      "表示されない " +
      "(PM 判断で確定した仕様。根拠: competitions.title のカラムコメントに " +
      "「大会名（NULLの場合は「大会」と表示）」と明記されている " +
      "[initial_schema.sql:684]。selectedCompetitionTitle が null [= 取得成功・title 未設定] と " +
      "undefined [= 取得失敗、V-48-13 で別途検証] を区別し、null の場合のみこのフォールバックに" +
      "落ちる)。",
    async () => {
      mocks.competitionByIdResponses["image_paths,title:comp-1"] = {
        data: {
          image_paths: [...mocks.outOfScopeCompetition.image_paths],
          title: null,
        },
        error: null,
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // 仕様: ID 直指定取得が成功し title が DB 上 NULL のときは、カラムコメントが
      // 規定する汎用の大会名フォールバック (「大会」) が表示される。dropdown 一覧の
      // スコープ外 (comp-1) でも、選択済みなのに未選択プレースホルダーに落ちてはならない。
      // 大会選択ボタン自身を role="button" でスコープする (フィールドラベルの
      // "大会" テキストと fallbackTitle の "大会" テキストが同じ文字列のため、
      // screen.getByText("大会") は複数要素にヒットしてしまう。Pressable は
      // react-native-web 上で <button> に描画されるため、アクセシブルネームで
      // 一意に絞り込める)。
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "大会" })).toBeDefined();
      });

      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );

  it(
    "[V-48-13] ID 直指定取得自体が失敗した場合、selectedCompetitionTitle は undefined の" +
      "ままとなり、従来どおり dropdown 一覧からの解決にフォールバックする " +
      "(スコープ内の comp-3 なら大会名が表示される。非退行)",
    async () => {
      mocks.routeParams.recordId = "record-3";
      mocks.competitionByIdResponses["image_paths,title:comp-3"] = {
        data: null,
        error: new Error("RLS denied: cannot read competitions row"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // ID 直指定取得は失敗しているが、comp-3 は dropdown 一覧のスコープ内なので
      // 従来の .find() 経由で大会名が表示され続ける
      await waitFor(() => {
        expect(screen.getByText(mocks.ownCompetition.title)).toBeDefined();
      });

      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );
});

describe("RecordFormScreen — issue #48: 退会済みチームの大会に紐づく過去記録の編集 (V-48-6, PM 裁定で確定した仕様)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordStore.getState().reset();
    mocks.routeParams.recordId = "record-6";
    Object.keys(mocks.competitionByIdResponses).forEach((k) => delete mocks.competitionByIdResponses[k]);
    mocks.competitionFetchCalls.length = 0;
    mocks.getStyles.mockResolvedValue(mocks.stylesFixture);
    mocks.getAccessToken.mockResolvedValue("test-access-token");
    mocks.updateMutateAsync.mockResolvedValue({ id: "record-6" });
    mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
    mocks.updateCompetitionMutateAsync.mockResolvedValue({ id: "comp-9" });
    mocks.resolveGalleryImages.mockResolvedValue([]);
    mocks.uploadImagesViaApi.mockResolvedValue([]);
    mocks.deleteImagesViaApi.mockResolvedValue(undefined);

    // 退会済みチームの大会 (comp-9) は RLS で SELECT が拒否される
    mocks.competitionByIdResponses["pool_type:comp-9"] = {
      data: null,
      error: new Error("RLS denied: not a team member"),
    };
  });

  it(
    "[V-48-6] storeCompetitionId が非null (competition_id が残存) のため isStandaloneRecord は" +
      "false だが、pool_type 取得が RLS で拒否されてもレコード自体の保存は成功し、pool_type は" +
      "記録自身の値 (長水路=1。0 に潰されていないこと) が維持される " +
      "(PM 裁定: 一律 throw すると退会済みチームの記録を持つユーザーが note の修正すら" +
      "一切できなくなるため、大会取得失敗時は記録自身の値を維持して保存を継続する。" +
      "V-47-3 と同一の分岐 [isEditMode && fetchedRecord] を通る)",
    async () => {
      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // 「(一括入力)」表示にはならない = isStandaloneRecord が false と判定されていることの確認
      // (competition_id が残っているため大会紐付けレコードとして扱われる)
      expect(screen.queryByText(/一括入力/)).toBeNull();

      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      expect(id).toBe("record-6");
      expect(updates.competition_id).toBe("comp-9");
      // 本体assert: 記録自身の pool_type (長水路=1) が維持される。0 に潰されてはならない
      expect(updates.pool_type).toBe(1);
      expect(updates.pool_type).not.toBe(0);

      // pool_type 取得は実際に試みて RLS 拒否を受け取ったことも確認する
      // (取得を試みずに常に維持側へフォールバックしているのではないことの担保)
      expect(mocks.competitionFetchCalls).toContainEqual({
        table: "competitions",
        columns: "pool_type",
        id: "comp-9",
      });

      // 保存は中止されていない (エラーダイアログは出ない)
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );
});
