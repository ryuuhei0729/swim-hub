/**
 * PracticeTabFormScreen.createFlipRegression.test.tsx
 *
 * Sprint Contract #PM-1 — Critical-1 の再発防止テスト (PM 裁定により Phase B で新設)。
 *
 * ■ バグ再発シナリオ (PM 実測)
 *   PracticeTabFormScreen.tsx:151-154
 *     const [resolvedPracticeId, setResolvedPracticeId] = useState(initialPracticeId);
 *     const isEditMode = !!resolvedPracticeId;
 *   PracticeTabFormScreen.tsx:713
 *     setResolvedPracticeId(createdPractice.id);   // 新規作成の親 INSERT 成功直後に flip
 *
 *   isEditMode は route params ではなく **state** 由来であり、新規作成の保存中に
 *   false→true へ転落しうる。管理者が管理者ビューの「追加」で新規練習を作成し、
 *   親 INSERT 成功直後に子処理 (画像アップロード等) が失敗すると、画面は閉じずに
 *   残ったまま (setIsSaved(true) に到達しない) isEditMode だけが true になる。
 *   このとき route params に origin: "teamAdmin" が無いと、canEditPracticeDetails が
 *   re-evaluate されて false に転落し、basicData がその場でグレーアウトする。
 *   続けて編集して再保存すると :614 の `if (canEditPracticeDetails && ...)` で
 *   親 UPDATE が無言で破棄される。
 *
 * ■ 修正 (TeamPracticeList.tsx: handleAdd にも origin: "teamAdmin" を付与)
 *   origin が最後まで route params に残り続けるため、flip 後も
 *   `origin === "teamAdmin" && isCurrentUserPracticeTeamAdmin` で true を維持できる。
 *
 * ■ このテストの検証内容
 *   1. 管理者ビューの「追加」相当 (route params に origin: "teamAdmin" + teamId) で
 *      新規作成フォームを開く
 *   2. 画像を追加した状態で保存 → 親 INSERT は成功するが、画像アップロードが失敗して
 *      画面が閉じない (= isEditMode が state 経由で true に flip した状態を作る)
 *   3. flip 後も basicData (タイトル入力欄) が disabled にならず、制限バナーも出ない
 *   4. その状態でタイトルを編集し再保存 → updatePracticeMutation.mutateAsync が
 *      実際に呼ばれ、編集後の値が payload に乗る (「保存できた」ではなく
 *      mutateAsync 呼び出しと実引数を assert する)
 *
 * モック構成は PracticeTabFormScreen.teamAdminOriginEdit.test.tsx /
 * PracticeTabFormScreen.practiceScopeRowWipe.test.tsx と同型。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

configure({ testIdAttribute: "testID" });

const mocks = vi.hoisted(() => {
  const imagePathsResponses: Record<
    string,
    { data: { image_paths: string[] } | null; error: unknown }
  > = {};

  function makeSupabase() {
    return {
      from: (_table: string) => ({
        select: (_columns: string) => ({
          eq: (_column: string, id: string) => ({
            single: () =>
              Promise.resolve(
                imagePathsResponses[id] ?? { data: { image_paths: [] }, error: null },
              ),
          }),
        }),
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
  }

  return {
    routeParams: {
      practiceId: undefined as string | undefined,
      date: undefined as string | undefined,
      teamId: undefined as string | undefined,
      initialTab: "practice" as "practice" | "log",
      origin: undefined as "teamAdmin" | undefined,
    },
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
    getAccessToken: vi.fn(),
    getUniquePlaces: vi.fn(),
    resolveGalleryImages: vi.fn(),
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createLogMutateAsync: vi.fn(),
    updateLogMutateAsync: vi.fn(),
    currentUserId: "admin-9801" as string,
    useTeamMembersQuery: vi.fn(),
    imagePathsResponses,
    supabase: makeSupabase(),
    // ImageUploader モックのボタンから発火する固定 fixture
    newImageFileFixture: {
      uri: "file://new-flip-regression.jpg",
      base64: "base64-flip-regression",
      fileExtension: "jpg",
    },
  };
});

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn(() => ({ width: 375, height: 812 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Keyboard: { dismiss: vi.fn() },
    KeyboardAvoidingView: original.View,
    TextInput: ({
      onChangeText,
      value,
      editable,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      editable?: boolean;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    setOptions: mocks.setOptions,
    addListener: () => () => {},
  }),
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    user: { id: mocks.currentUserId },
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: mocks.useTeamMembersQuery,
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [], isLoading: false }),
  usePracticeTagsQuery: () => ({ data: [], isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeMutation: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: mocks.createLogMutateAsync, isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: mocks.updateLogMutateAsync, isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({
    profile: null,
    teams: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncPractice: vi.fn(), syncCompetition: vi.fn() }),
}));

vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  usePracticeLogTemplatesQuery: () => ({ data: [], isLoading: false }),
  useUsePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPracticeById = vi.fn();
    getTeamScopedPracticeById = vi.fn();
    getUniquePlaces = mocks.getUniquePlaces;
    deletePracticeLog = vi.fn();
    replacePracticeTimes = vi.fn();
  },
}));

vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return {
    ...actual,
    resolveGalleryImages: mocks.resolveGalleryImages,
    uploadImagesViaApi: mocks.uploadImagesViaApi,
    deleteImagesViaApi: mocks.deleteImagesViaApi,
  };
});

vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({
    onImagesChange,
  }: {
    onImagesChange: (
      newFiles: { uri: string; base64: string; fileExtension: string }[],
      deletedIds: string[],
    ) => void;
  }) => <button onClick={() => onImagesChange([mocks.newImageFileFixture], [])}>画像を1枚追加</button>,
}));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

const TEAM_ID = "team-9802";
const NEW_PRACTICE_ID = "practice-9803-created";

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Host() {
    const [mounted, setMounted] = React.useState(true);
    React.useEffect(() => {
      mocks.goBack.mockImplementation(() => setMounted(false));
    }, []);
    if (!mounted) return null;
    return <PracticeTabFormScreen />;
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.routeParams.practiceId = undefined; // 新規作成 (管理者ビューの「追加」相当)
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = TEAM_ID;
  mocks.routeParams.initialTab = "practice";
  mocks.routeParams.origin = "teamAdmin"; // 契約更新: handleAdd も origin を付与する
  mocks.currentUserId = "admin-9801";

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.setOptions.mockReset();
  mocks.createMutateAsync.mockReset();
  mocks.createLogMutateAsync.mockReset();
  mocks.updateLogMutateAsync.mockReset();

  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset();
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.createMutateAsync.mockResolvedValue({ id: NEW_PRACTICE_ID });
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: NEW_PRACTICE_ID });
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({
    data: [{ user_id: "admin-9801", role: "admin" }],
    isLoading: false,
  });

  Object.keys(mocks.imagePathsResponses).forEach((k) => delete mocks.imagePathsResponses[k]);
  mocks.imagePathsResponses[NEW_PRACTICE_ID] = { data: { image_paths: [] }, error: null };

  vi.mocked(Alert.alert).mockClear();
});

describe(
  "PracticeTabFormScreen — Critical-1 再発防止: 管理者ビュー『追加』で新規作成中に isEditMode が " +
    "flip しても basicData が編集可能なまま (origin: teamAdmin の一貫性)",
  () => {
    it(
      "新規作成 → 画像アップロード失敗で isEditMode が flip → basicData 編集可能のまま → " +
        "再編集して保存すると updatePracticeMutation に編集後の値が乗る",
      async () => {
        // 1回目: 画像アップロードが失敗する (親 INSERT は成功済みのため resolvedPracticeId は
        // 既に flip している状態を作る)
        mocks.uploadImagesViaApi.mockRejectedValueOnce(new Error("network hiccup"));

        renderScreen();

        await waitFor(() => {
          expect(screen.getByPlaceholderText("例: Swim, AM, 16:00")).toBeTruthy();
        });

        const titleInput = screen.getByPlaceholderText("例: Swim, AM, 16:00") as HTMLInputElement;
        fireEvent.change(titleInput, { target: { value: "管理者追加フロー初回タイトル" } });

        fireEvent.click(screen.getByText("画像を1枚追加"));

        await act(async () => {
          fireEvent.click(screen.getByTestId("practice-tab-form-save"));
          await flushAsync();
        });

        // 親 INSERT (createPracticeMutation) は成功している = resolvedPracticeId が
        // NEW_PRACTICE_ID に flip 済み (isEditMode が false→true へ転落した状態)
        expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
        // 画像アップロード失敗でエラーダイアログが出て、画面は goBack していない
        expect(mocks.goBack).not.toHaveBeenCalled();
        expect(vi.mocked(Alert.alert)).toHaveBeenCalled();

        // [Critical-1 再発防止の核心] flip 後も basicData が disabled になっていない
        // (origin: teamAdmin が保たれているため canEditPracticeDetails が true のまま)
        const titleInputAfterFlip = screen.getByPlaceholderText(
          "例: Swim, AM, 16:00",
        ) as HTMLInputElement;
        expect(titleInputAfterFlip.disabled).toBe(false);
        expect(
          screen.queryByText("この練習の情報はチーム管理者のみ編集できます"),
        ).toBeNull();

        // 2回目: 再編集して保存すると、今度は成功する (uploadImagesViaApi はデフォルトの
        // mockResolvedValue にフォールバック)
        mocks.uploadImagesViaApi.mockResolvedValue([{ path: "practice/9803/retry-upload.jpg" }]);

        fireEvent.change(titleInputAfterFlip, { target: { value: "flip後の再編集タイトル" } });
        fireEvent.click(screen.getByTestId("practice-tab-form-save"));

        await waitFor(() => {
          expect(mocks.updateMutateAsync).toHaveBeenCalled();
        });

        // updatePracticeMutation の呼び出しの中に、id=NEW_PRACTICE_ID かつ
        // title が編集後の値であるものが実際に含まれることを assert する
        // (「保存できた」「エラーが出ない」だけでは無言スキップと区別できないため、
        // mutateAsync の実引数まで見る)
        const matchingCall = mocks.updateMutateAsync.mock.calls.find((call: unknown[]) => {
          const arg = call[0] as { id: string; updates: Record<string, unknown> };
          return arg.id === NEW_PRACTICE_ID && arg.updates.title === "flip後の再編集タイトル";
        });
        expect(
          matchingCall,
          "flip 後の再保存で updatePracticeMutation に編集後の title が渡っていない " +
            "(= canEditPracticeDetails が再度 false に落ちて無言スキップされている疑い)",
        ).toBeTruthy();
      },
    );
  },
);
