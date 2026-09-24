/**
 * PracticeTabFormScreen.permissionUnavailable.test.tsx
 *
 * Sprint Contract v4 — **D12** (練習側の権限取得失敗ガード) の検証。SC-20 / SC-21 / SC-22 / SC-23。
 *
 * ■ 塞いだ穴
 *   `useTeamMembersQuery` がエラーで終わると isLoading=false / data=undefined になる。
 *   放置すると `isCurrentUserPracticeTeamAdmin` が false へ倒れ、**正規の管理者**に
 *   制限バナー付きの読み取り専用フォームと押せる保存ボタンが出る。チーム管理者ビューでは
 *   log タブも画面に無いのでログの差分も空になり、**1件も書かずに画面が閉じて成功と
 *   区別がつかない**。
 *
 * ■ 練習は大会と条件が違う (D12 の禁止事項)。本ファイルはその差分も pin する:
 *   - **禁止1**: `isResolvingPracticePermission` に origin を足さない
 *     → `[PU-6]` (origin 無しでも isLoading 中は全画面ローディング)
 *       ＋ 既存 `practiceScopeRowWipe.test.tsx` の `[P-13]`
 *   - **禁止2**: フック引数を origin で絞らない (`canEditPracticeLogs` が消費するため)
 *     → `[PU-7 / SC-23]` (origin 無しでも practiceTeamId で呼ばれ続ける)。
 *       大会の `[CTAO-19]` とは **逆向き**の pin であることに注意
 *   - **禁止3**: 早期 return が log の保存経路を巻き込まない
 *     → `[PU-9 / SC-22]` (個人フローの非 admin がログだけ保存できる)
 *       ＋ `[PU-10]` (動画だけの変更もブロックされない)
 *   - **禁止5**: snapshot と state に片側だけの正規化を入れない → `[PU-13]`
 *
 * ■ 早期 return の到達条件 (QA 実測)
 *   練習の保存ボタンは `disabled={isSaving || !canEditPracticeLogs}`。
 *   canEditPracticeLogs は owner/admin 判定なので、**admin を失っただけの第三者は
 *   ボタン自体が押せず早期 return に到達しない**。到達しうるのは
 *   canEditPracticeLogs が true のまま canEditPracticeDetails だけが false に落ちる人
 *   = **作成者本人 (owner)**。`[PU-8]` `[PU-11]` `[PU-12]` はこの条件で組んである。
 *
 * ■ トートロジー防止
 *   - 4条件 AND の**各条件を1つずつ外した対照**を置く (`[PU-3] [PU-4] [PU-5]`)。
 *     これが無いと「エラーなら常に ErrorView」の実装でも `[PU-1]` は通る。
 *   - 「保存できた/できない」ではなく mutateAsync と navigation の**呼び出し件数**で見る。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeWithLogs } from "@apps/shared/types";

configure({ testIdAttribute: "testID" });

const mocks = vi.hoisted(() => {
  function makeSupabase() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
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
      initialTab: undefined as "practice" | "log" | undefined,
      origin: undefined as "teamAdmin" | undefined,
    },
    navigate: vi.fn(),
    goBack: vi.fn(),
    popTo: vi.fn(),
    popToTop: vi.fn(),
    setOptions: vi.fn(),
    getAccessToken: vi.fn(),
    getTeamScopedPracticeById: vi.fn(),
    getUniquePlaces: vi.fn(),
    resolveGalleryImages: vi.fn(),
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createLogMutateAsync: vi.fn(),
    updateLogMutateAsync: vi.fn(),
    deletePracticeLog: vi.fn(),
    replacePracticeTimes: vi.fn(),
    currentUserId: "user-1" as string,
    useTeamMembersQuery: vi.fn(),
    refetchTeamMembers: vi.fn(),
    useTeamMembersQueryCalls: [] as Array<string | undefined>,
    supabase: makeSupabase(),
    newImageFileFixture: {
      uri: "file://d12-permission-unavailable.jpg",
      base64: "base64-d12-permission-unavailable",
      fileExtension: "jpg",
    },
    pendingVideoAssetFixture: { uri: "file://d12-pending-video.mov", mimeType: "video/quicktime" },
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
    // RN の editable={false} を jsdom の disabled に変換する。
    // これをしないと canEditPracticeDetails の述語がどう壊れても検出できない。
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
    popTo: mocks.popTo,
    popToTop: mocks.popToTop,
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
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    mocks.useTeamMembersQueryCalls.push(teamId);
    // 実物は data/isLoading/isError/refetch を返す。テストが明示しないフィールドは
    // 正常系の既定値で埋める (undefined のままだと isError 分岐が「たまたま falsy」で
    // 通ってしまい、D12 の退行を検出できない)。
    return { isError: false, refetch: mocks.refetchTeamMembers, ...mocks.useTeamMembersQuery(teamId) };
  },
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
    getTeamScopedPracticeById = mocks.getTeamScopedPracticeById;
    getUniquePlaces = mocks.getUniquePlaces;
    deletePracticeLog = mocks.deletePracticeLog;
    replacePracticeTimes = mocks.replacePracticeTimes;
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

// intrinsic な <span> の型には testID / data-disabled が無いため、素通し用の
// 緩い props 型を介して渡す (他の練習/大会テストと同じ TestFlag パターン)。
function TestFlag(props: { testID: string; "data-disabled": string }) {
  return React.createElement("span", props);
}

// ImageUploader: disabled フラグの観測と「画像を1枚追加する」操作の両方を出す。
// disabled を無視して onImagesChange を呼べるようにしてあるのは意図的:
// 「canEdit が true のうちに画像を足し、その後 false へ flip した」状態を再現するため。
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({
    disabled,
    onImagesChange,
  }: {
    disabled?: boolean;
    onImagesChange: (
      newFiles: { uri: string; base64: string; fileExtension: string }[],
      deletedIds: string[],
    ) => void;
  }) => (
    <>
      <TestFlag testID="image-uploader-disabled-flag" data-disabled={String(!!disabled)} />
      <button onClick={() => onImagesChange([mocks.newImageFileFixture], [])}>画像を1枚追加</button>
    </>
  ),
}));

// VideoUploader: log タブの持ち物。保留動画をセットする操作だけを出す。
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: ({
    onPendingVideoAsset,
  }: {
    onPendingVideoAsset?: (asset: { uri: string; mimeType?: string } | null) => void;
  }) => (
    <button onClick={() => onPendingVideoAsset?.(mocks.pendingVideoAssetFixture)}>
      動画を保留に追加
    </button>
  ),
}));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

// ---------------------------------------------------------------------------
// fixture (互いに部分文字列関係にならない固有値)
// ---------------------------------------------------------------------------
const PRACTICE_ID = "practice-9401";
const TEAM_ID = "team-9402";
const ADMIN_VIEWER_ID = "roster-admin-9403";
const GENERAL_VIEWER_ID = "roster-general-9404";
const OWNER_ID = "roster-owner-9405";
const LOG_ID = "plog-9406-alpha";

const PRACTICE_TITLE = "D12権限取得失敗検証チーム練習";
const PRACTICE_PLACE = "D12検証用プール";
const PRACTICE_NOTE = "D12検証用の練習備考";
const LOG_NOTE = "D12検証用のログ備考";

const PERMISSION_CHECK_FAILED_MESSAGE =
  "編集権限を確認できませんでした。通信状況を確認して再試行してください。";
const PRACTICE_SAVE_BLOCKED_MESSAGE =
  "編集権限が確認できないため、練習情報を保存できませんでした。画面を開き直して再試行してください。";
const EDIT_RESTRICTED_MESSAGE = "この練習の情報はチーム管理者のみ編集できます";

function makeLog() {
  return {
    id: LOG_ID,
    practice_id: PRACTICE_ID,
    style: "Fr",
    swim_category: "Swim",
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: LOG_NOTE,
    video_path: null,
    video_thumbnail_path: null,
    practice_times: [],
    practice_log_tags: [],
  };
}

function makePracticeFixture(
  overrides: Record<string, unknown> = {},
  logs: unknown[] = [makeLog()],
): PracticeWithLogs {
  return {
    id: PRACTICE_ID,
    user_id: OWNER_ID,
    team_id: TEAM_ID,
    date: "2026-06-01",
    title: PRACTICE_TITLE,
    place: PRACTICE_PLACE,
    note: PRACTICE_NOTE,
    image_paths: [],
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    practice_logs: logs,
    ...overrides,
  } as unknown as PracticeWithLogs;
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** ErrorView (alert-triangle アイコン) の描画数 */
function errorViewIconCount(): number {
  return document.querySelectorAll('[data-testid="icon-alert-triangle"]').length;
}

/** saveError バナー (#FEE2E2 背景) */
function saveErrorBanner(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll("div")).find(
    (el) => (el as HTMLElement).style.backgroundColor === "rgb(254, 226, 226)",
  ) as HTMLElement | undefined;
}

function titleInput(): HTMLInputElement {
  return screen.getByDisplayValue(PRACTICE_TITLE) as HTMLInputElement;
}

/**
 * useTeamMembersQuery は素の vi.fn() なので mockReturnValue の差し替えだけでは
 * React が再レンダーしない。flip ケース用に外部から dispatch できる Host を挟む。
 */
function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let forceUpdate: (() => void) | null = null;
  function Host() {
    const [, bump] = React.useReducer((c: number) => c + 1, 0);
    React.useEffect(() => {
      forceUpdate = bump;
      return () => {
        forceUpdate = null;
      };
    }, []);
    return <PracticeTabFormScreen />;
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>,
  );
  return {
    ...result,
    forceRerender: () => {
      if (!forceUpdate) throw new Error("Host is not mounted (forceUpdate unavailable)");
      act(() => {
        forceUpdate!();
      });
    },
  };
}

beforeEach(() => {
  mocks.routeParams.practiceId = PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = undefined;
  mocks.routeParams.origin = undefined;
  mocks.currentUserId = ADMIN_VIEWER_ID;

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.popTo.mockReset();
  mocks.popToTop.mockReset();
  mocks.setOptions.mockReset();
  mocks.useTeamMembersQueryCalls.length = 0;

  mocks.getTeamScopedPracticeById.mockReset().mockResolvedValue(makePracticeFixture());
  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset().mockResolvedValue([]);
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.createMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.createLogMutateAsync.mockReset().mockResolvedValue({ id: "plog-new" });
  mocks.updateLogMutateAsync.mockReset().mockResolvedValue({});
  mocks.deletePracticeLog.mockReset().mockResolvedValue(undefined);
  mocks.replacePracticeTimes.mockReset().mockResolvedValue(undefined);
  mocks.refetchTeamMembers.mockReset().mockResolvedValue(undefined);
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({
    data: [
      { user_id: ADMIN_VIEWER_ID, role: "admin" },
      { user_id: OWNER_ID, role: "user" },
      { user_id: GENERAL_VIEWER_ID, role: "user" },
    ],
    isLoading: false,
  });

  vi.mocked(Alert.alert).mockClear();
});

// ===========================================================================
// SC-20 — 権限判定の取得失敗で ErrorView を出す
// ===========================================================================
describe("PracticeTabFormScreen — [SC-20 / D12] 権限判定の取得失敗で ErrorView を出す", () => {
  it("[PU-1] isError=true + origin + 編集モード + team_id あり: ErrorView が1件で、フォーム・保存ボタン・制限バナーがすべて不在", async () => {
    mocks.routeParams.origin = "teamAdmin";
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderScreen();

    await waitFor(() => expect(errorViewIconCount()).toBe(1));

    // 新規キーではなく大会側と共有の permissionCheckFailed を再利用している (D12-4)
    expect(screen.getByText(PERMISSION_CHECK_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.queryByDisplayValue(PRACTICE_TITLE)).toBeNull();
    expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
    // 「1件も書かずに閉じる」経路に入っていない
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.goBack).toHaveBeenCalledTimes(0);
    expect(mocks.popTo).toHaveBeenCalledTimes(0);
  });

  it("[PU-2] ErrorView の「再試行」を押すと refetch がちょうど1回呼ばれる", async () => {
    mocks.routeParams.origin = "teamAdmin";
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderScreen();

    await waitFor(() => expect(errorViewIconCount()).toBe(1));

    const retryButton = screen.getByText("再試行").closest("button");
    expect(retryButton, "ErrorView に再試行ボタンが無い (onRetry が渡っていない)").not.toBeNull();
    fireEvent.click(retryButton as HTMLButtonElement);

    expect(mocks.refetchTeamMembers).toHaveBeenCalledTimes(1);
  });

  it("[PU-3 / 対照] isError=true でも origin 無しなら ErrorView は出ない (個人画面を丸ごと使えなくしない)", async () => {
    mocks.routeParams.origin = undefined;
    mocks.currentUserId = GENERAL_VIEWER_ID;
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderScreen();

    await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    expect(screen.queryByText(PERMISSION_CHECK_FAILED_MESSAGE)).toBeNull();
    // 練習タブは従来どおり制限バナー付きの読み取り専用
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId("practice-tab-form-save")).toBeTruthy();
  });

  it("[PU-4 / 対照] isError=true + origin あり でも新規作成モードなら ErrorView は出ない (isEditMode 条件)", async () => {
    mocks.routeParams.practiceId = undefined;
    mocks.routeParams.teamId = TEAM_ID;
    mocks.routeParams.origin = "teamAdmin";
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderScreen();

    await waitFor(() => expect(screen.getByTestId("practice-tab-form-save")).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
  });

  it("[PU-5 / 対照] isError=true + origin あり でも個人練習 (team_id が null) なら ErrorView は出ない (practiceTeamId 条件)", async () => {
    mocks.routeParams.origin = "teamAdmin";
    mocks.currentUserId = OWNER_ID;
    mocks.getTeamScopedPracticeById.mockResolvedValue(makePracticeFixture({ team_id: null }));
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderScreen();

    await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
    expect(titleInput().disabled).toBe(false);
  });
});

// ===========================================================================
// SC-23 / 禁止1・禁止2 — 練習は大会 (M-3) と違い origin で絞ってはいけない
// ===========================================================================
describe("PracticeTabFormScreen — [SC-23 / D12 禁止1・2] origin 無しでも権限確定を待ち、メンバーを引き続ける", () => {
  it("[PU-6 / 禁止1] origin 無し + isLoading=true でも画面全体がローディングになる (isResolvingPracticePermission に origin を足していない)", async () => {
    mocks.routeParams.origin = undefined;
    mocks.currentUserId = GENERAL_VIEWER_ID;
    mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderScreen();

    await waitFor(() =>
      expect(mocks.getTeamScopedPracticeById).toHaveBeenCalledWith(PRACTICE_ID),
    );
    await act(async () => {
      await flushAsync();
    });

    // フォーム本体も保存ボタンも出ない = 全画面ローディング
    expect(screen.queryByDisplayValue(PRACTICE_TITLE)).toBeNull();
    expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
    // ErrorView でもない (isError ではなく isLoading の経路)
    expect(errorViewIconCount()).toBe(0);
  });

  it("[PU-7 / SC-23 / 禁止2] origin 無しでも useTeamMembersQuery が practiceTeamId で呼ばれ続ける (大会の M-3 を練習へ持ち込んでいない)", async () => {
    mocks.routeParams.origin = undefined;
    mocks.currentUserId = GENERAL_VIEWER_ID;

    renderScreen();

    await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());
    await act(async () => {
      await flushAsync();
    });

    // canEditPracticeLogs もメンバー一覧を消費するため、origin 無しでも引く必要がある
    expect(mocks.useTeamMembersQueryCalls).toContain(TEAM_ID);
    expect(
      mocks.useTeamMembersQueryCalls[mocks.useTeamMembersQueryCalls.length - 1],
      "最終レンダー時点で practiceTeamId が渡っていない (origin で絞られている疑い)",
    ).toBe(TEAM_ID);
  });
});

// ===========================================================================
// SC-21 / SC-22 — 保存の早期 return ガード
// ===========================================================================
describe("PracticeTabFormScreen — [SC-21 / SC-22 / D12] 権限喪失後の保存を無言で成功させない", () => {
  it("[PU-8 / SC-21] canEdit が true→false へ flip した状態で基本情報を変更して保存 → UPDATE 0回・画面が閉じない・空でないエラーが出る", async () => {
    // 【到達条件の実測メモ】練習の保存ボタンは
    //   disabled={isSaving || !canEditPracticeLogs}
    // であり、canEditPracticeLogs は owner/admin 判定 (origin を見ない)。
    // したがって「admin を失った第三者」はボタン自体が押せず、この早期 return には
    // 到達しない。**到達しうるのは canEditPracticeLogs が true のまま
    // canEditPracticeDetails だけが false に落ちる人 = 作成者本人 (owner)** である。
    // そこで currentUser を OWNER_ID にし、初期状態では admin ロールも持たせて
    // canEditPracticeDetails=true を作ってから、admin ロールだけを剥がす。
    mocks.routeParams.origin = "teamAdmin";
    mocks.currentUserId = OWNER_ID;
    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "admin" }],
      isLoading: false,
    });

    const { forceRerender } = renderScreen();

    await waitFor(() => expect(titleInput()).toBeTruthy());
    expect(titleInput().disabled).toBe(false);

    fireEvent.change(titleInput(), { target: { value: "PU8権限喪失前に入力したタイトル" } });

    // admin ロールだけを剥がす (owner のままなので保存ボタンは押せる)。
    // isError ではないので ErrorView には入らない = 事故の再現条件。
    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "user" }],
      isLoading: false,
    });
    forceRerender();

    await waitFor(() => expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.createMutateAsync).toHaveBeenCalledTimes(0);
    // 画面が閉じていない
    expect(mocks.goBack).toHaveBeenCalledTimes(0);
    expect(mocks.popTo).toHaveBeenCalledTimes(0);
    expect(mocks.popToTop).toHaveBeenCalledTimes(0);
    // 空でないエラーが練習用の文言で出ている (大会用キーを誤って使っていないこと)
    const banner = saveErrorBanner();
    expect(banner, "保存ブロック時にエラーバナーが描画されていない").toBeTruthy();
    expect((banner as HTMLElement).textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(screen.getByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeTruthy();
  });

  it("[PU-9 / SC-22 / 禁止3] 個人フローの非 admin (作成者本人) が『ログだけ』を編集して保存 → ブロックされず log の UPDATE が走る", async () => {
    // canEditPracticeDetails=false (チーム練習 + origin 無し) だが
    // canEditPracticeLogs=true (owner) の組み合わせ。practiceBasicChanged が false なので
    // 早期 return は発火してはならない。
    mocks.routeParams.origin = undefined;
    mocks.routeParams.initialTab = "log";
    mocks.currentUserId = OWNER_ID;

    renderScreen();

    const logNoteInput = (await screen.findByDisplayValue(LOG_NOTE)) as HTMLInputElement;
    expect(logNoteInput.disabled).toBe(false);
    fireEvent.change(logNoteInput, { target: { value: "PU9ログだけ編集した備考" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    // ブロックされていない
    expect(screen.queryByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    // 練習本体は canEditPracticeDetails=false なのでスキップされる (従来どおり)
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    // log は実際に書き込まれている (「ブロックされない」を no-op と区別する)
    const updatedLogIds = mocks.updateLogMutateAsync.mock.calls.map(
      (call: unknown[]) => (call[0] as { id: string }).id,
    );
    expect(updatedLogIds).toEqual([LOG_ID]);
    const [updateArg] = mocks.updateLogMutateAsync.mock.calls[0] as [
      { id: string; updates: Record<string, unknown> },
    ];
    expect(updateArg.updates.note).toBe("PU9ログだけ編集した備考");
    // 画面は閉じる
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("[PU-10 / PM 裁定確認] 動画 (log タブの持ち物) だけを変更した非 admin の保存はブロックされない", async () => {
    // pendingVideoAssetRef は practiceBasicChanged に含めない、という Developer の
    // 切り分けが正しいことを保存挙動で確認する。含めると SC-22 の導線が死ぬ。
    mocks.routeParams.origin = undefined;
    mocks.routeParams.initialTab = "log";
    mocks.currentUserId = OWNER_ID;

    renderScreen();

    await waitFor(() => expect(screen.getByText("動画を保留に追加")).toBeTruthy());
    fireEvent.click(screen.getByText("動画を保留に追加"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    expect(screen.queryByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("[PU-11 / PM 裁定確認] 画像 (練習タブの持ち物) を変更した後に canEdit が落ちた保存はブロックされる", async () => {
    // 画像は練習タブの持ち物なので practiceBasicChanged に含まれる。
    // ImageUploader は canEditPracticeDetails=false で disabled になるが、
    // 「編集可能なうちに画像を足してから権限が落ちた」経路は到達可能。
    // 到達条件は [PU-8] と同じ (保存ボタンが押せるのは owner/admin だけ)
    mocks.routeParams.origin = "teamAdmin";
    mocks.currentUserId = OWNER_ID;
    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "admin" }],
      isLoading: false,
    });

    const { forceRerender } = renderScreen();

    await waitFor(() => expect(titleInput()).toBeTruthy());
    // 権限があるうちは ImageUploader が有効
    expect(
      screen.getByTestId("image-uploader-disabled-flag").getAttribute("data-disabled"),
    ).toBe("false");
    fireEvent.click(screen.getByText("画像を1枚追加"));

    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "user" }],
      isLoading: false,
    });
    forceRerender();
    await waitFor(() => expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy());
    // 権限喪失後は ImageUploader が disabled (これ以上は追加できない)
    expect(
      screen.getByTestId("image-uploader-disabled-flag").getAttribute("data-disabled"),
    ).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    // 画像の追加は基本情報の変更として扱われ、ブロックされる
    expect(screen.getByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeTruthy();
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.uploadImagesViaApi).toHaveBeenCalledTimes(0);
    expect(mocks.goBack).toHaveBeenCalledTimes(0);
  });

  it("[PU-12 / 対照] flip しても何も変更していなければ早期 return しない (触っていない画面を閉じられる)", async () => {
    // 到達条件は [PU-8] と同じ (保存ボタンが押せるのは owner/admin だけ)
    mocks.routeParams.origin = "teamAdmin";
    mocks.currentUserId = OWNER_ID;
    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "admin" }],
      isLoading: false,
    });

    const { forceRerender } = renderScreen();

    await waitFor(() => expect(titleInput()).toBeTruthy());

    mocks.useTeamMembersQuery.mockReturnValue({
      data: [{ user_id: OWNER_ID, role: "user" }],
      isLoading: false,
    });
    forceRerender();
    await waitFor(() => expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    expect(screen.queryByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("[PU-13 / 禁止5] 既存値に前後空白があっても、ロード直後は practiceBasicChanged=false (snapshot と state 初期値が一致している)", async () => {
    // 片側だけに正規化 (.trim() 等) を入れると、一度も触っていないのに true になり、
    // SC-22 の「ログだけ保存」導線が個人フローでブロックされる。
    mocks.routeParams.origin = undefined;
    mocks.currentUserId = GENERAL_VIEWER_ID;
    mocks.getTeamScopedPracticeById.mockResolvedValue(
      makePracticeFixture({
        title: "  前後に空白のあるタイトル  ",
        place: "  前後に空白のある場所  ",
        note: "  前後に空白のある備考  ",
      }),
    );

    renderScreen();

    // RTL の getByDisplayValue は既定で空白を正規化するため placeholder で引いて value を見る
    await waitFor(() => {
      const input = screen.getByPlaceholderText("例: Swim, AM, 16:00") as HTMLInputElement;
      expect(input.value).toBe("  前後に空白のあるタイトル  ");
    });
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));
      await flushAsync();
    });

    expect(screen.queryByText(PRACTICE_SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(0);
  });
});
