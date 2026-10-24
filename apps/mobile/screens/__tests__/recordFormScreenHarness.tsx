// =============================================================================
// recordFormScreenHarness.tsx
// RecordFormScreen を render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// 画面ごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   react-native                        Dimensions / Keyboard / KeyboardAvoidingView を補完
//   @react-navigation/native            useRoute (harness.routeParams) / useNavigation
//   @/contexts/AuthProvider             supabase (harness.supabase) / getAccessToken
//   @apps/shared/api/styles             getStyles
//   @apps/shared/hooks/queries/records  大会一覧 (harness.competitions)・編集対象
//                                       (harness.records から recordId で解決)・各 mutation
//   ImageUploader                       「画像アップローダー」と harness.imageUploaderActions の
//                                       ボタンを描画する (押すと onImagesChange を呼ぶ)
//   VideoUploader / PremiumBadge / LapTimeDisplay → 描画しない
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// このファイルは `import { RecordFormScreen } from "../RecordFormScreen"` より前に import する。
// 各ファイルの beforeEach で resetRecordFormHarness() を呼び、そのファイルが前提にする値を設定する。
//
// モックのフックは毎回同じ参照を返す (harness のプロパティを直接返す)。呼ばれるたびに
// 新しいオブジェクトや配列を作ると、それを依存配列に持つ useEffect が再レンダーのたびに
// 走り続け、無限ループ (OOM) になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

type ByIdResponse = { data: Record<string, unknown> | null; error: unknown };

export type ImageUploaderAction = {
  label: string;
  newFiles: { uri: string; base64: string; fileExtension: string }[];
  deletedIds: string[];
};

const harness = vi.hoisted(() => {
  /**
   * `supabase.from(<table>).select(<columns>).eq("id", <id>).single()` の応答表。
   * キーは `${正規化した列名}:${id}` (例: "pool_type:comp-1"、"image_paths,title:comp-1")。
   * 画面は同じ id に対して列の違うクエリを複数投げるため、列名を捨てて id だけで引くと
   * 応答を取り違える。列名は「カンマ区切り → trim → ソート → 再結合」で正規化する。
   */
  const competitionByIdResponses: Record<string, ByIdResponse> = {};
  const competitionFetchCalls: Array<{ table: string; columns: string; id: string }> = [];

  const normalizeColumns = (columns: string) =>
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .sort()
      .join(",");

  const supabase = {
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

  return {
    supabase,
    competitionByIdResponses,
    competitionFetchCalls,
    /** useRoute().params。recordId で編集対象、competitionId で新規作成時の紐付け先を指定する */
    routeParams: {} as { recordId?: string; competitionId?: string },
    /** useRecordByIdQuery が recordId で引く編集対象の候補 */
    records: [] as Array<{ id: string }>,
    /** useCompetitionsListQuery が返す大会選択ドロップダウンの一覧 */
    competitions: [] as unknown[],
    /** useRecordByIdQuery を エラー / 初回ロード中 / リトライ中 にする */
    recordByIdError: false,
    recordByIdLoading: false,
    recordByIdFetching: false,
    imageUploaderActions: [] as ImageUploaderAction[],
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

// react-native の静的モックには Dimensions/Keyboard/KeyboardAvoidingView が無いので補完する
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Keyboard: { dismiss: () => {} },
    KeyboardAvoidingView: actual.View,
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: harness.routeParams }),
  useNavigation: () => ({ navigate: harness.navigate, goBack: harness.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: harness.supabase,
    subscription: null,
    getAccessToken: harness.getAccessToken,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = harness.getStyles;
  },
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCompetitionsListQuery: () => ({
    data: harness.competitions,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordByIdQuery: (_supabase: unknown, recordId: string) => {
    if (!recordId) {
      return {
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: harness.refetchRecordById,
      };
    }
    if (harness.recordByIdError) {
      // リトライ中かどうかは isFetching で表す (react-query の isLoading は初回ロード専用)
      return {
        data: null,
        isLoading: false,
        isFetching: harness.recordByIdFetching,
        isError: true,
        refetch: harness.refetchRecordById,
      };
    }
    if (harness.recordByIdLoading) {
      return {
        data: undefined,
        isLoading: true,
        isFetching: true,
        isError: false,
        refetch: harness.refetchRecordById,
      };
    }
    return {
      data: harness.records.find((r) => r.id === recordId) ?? null,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: harness.refetchRecordById,
    };
  },
  useCreateRecordMutation: () => ({ mutateAsync: harness.createMutateAsync, isPending: false }),
  useUpdateRecordMutation: () => ({ mutateAsync: harness.updateMutateAsync, isPending: false }),
  useReplaceSplitTimesMutation: () => ({
    mutateAsync: harness.replaceSplitTimesMutateAsync,
    isPending: false,
  }),
  useUpdateCompetitionMutation: () => ({
    mutateAsync: harness.updateCompetitionMutateAsync,
    isPending: false,
  }),
}));

// ImageUploader は「表示されるかどうか」自体を検証するため、目印のテキストを描画する
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({
    onImagesChange,
  }: {
    onImagesChange: (newFiles: ImageUploaderAction["newFiles"], deletedIds: string[]) => void;
  }) => (
    <>
      画像アップローダー
      {harness.imageUploaderActions.map((action) => (
        <button key={action.label} onClick={() => onImagesChange(action.newFiles, action.deletedIds)}>
          {action.label}
        </button>
      ))}
    </>
  ),
}));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records", () => ({ LapTimeDisplay: () => null }));

export { harness };

/**
 * テストごとに変わる値 (route params・supabase の応答表と呼び出し記録・useRecordByIdQuery の状態フラグ) を
 * 初期値に戻す。records / competitions / imageUploaderActions とモック関数の返り値は戻さないので、
 * 各ファイルが beforeEach (またはモジュール先頭) で設定する
 */
export function resetRecordFormHarness() {
  harness.routeParams = {};
  for (const key of Object.keys(harness.competitionByIdResponses)) {
    delete harness.competitionByIdResponses[key];
  }
  harness.competitionFetchCalls.length = 0;
  harness.recordByIdError = false;
  harness.recordByIdLoading = false;
  harness.recordByIdFetching = false;
}

export const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
