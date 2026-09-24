/**
 * PracticeTabFormScreen.teamAdminOriginEdit.test.tsx
 *
 * Sprint Contract #PM-1 Phase B — 実装完了後の実アサーション。
 *
 * ■ バグ
 *   チーム管理者が管理者ビュー (TeamPracticeList) の鉛筆ボタンから編集を開いても、
 *   旧 `canEditPracticeDetails = isEditMode ? !practiceTeamId : true` には「チーム管理者
 *   ビューから来た」信号が無いため、admin であっても basicData (日付/タイトル/場所/メモ/画像)
 *   が全て disabled になり、forms.tabModal.practiceEditRestricted バナーが出る。
 *
 * ■ 実装 (PM 実測済み・Developer 停止済み)
 *   route params に `origin?: "teamAdmin"` が追加され、TeamPracticeList → PracticeFormScreen
 *   (シム) → PracticeTabFormScreen まで引き回される。
 *     canEditPracticeDetails:
 *       !isEditMode → true
 *       !practiceTeamId → true
 *       origin === "teamAdmin" && isCurrentUserPracticeTeamAdmin → true
 *       それ以外 → false
 *   保存ガード (:614) は `if (canEditPracticeDetails && !isResolvingPracticePermission)`。
 *
 * ■ PM 裁定 (Critical-1 レビュー後)
 *   - 保存ボタンの disabled は `isSaving || !canEditPracticeLogs` であり、
 *     canEditPracticeDetails ではない (pre-existing・本スプリント無変更)。そのため
 *     「admin だが origin 無し」ケースでも canEditPracticeLogs (owner/admin 判定) が true な
 *     限りボタン自体はクリックできる。ただし executeSave 内の :614 ガードが基本情報の
 *     UPDATE を個別にスキップするため、updatePracticeMutation は呼ばれない
 *     (practiceScopeRowWipe.test.tsx の [P-11] と同型)。
 *   - isResolvingPracticePermission=true の間は画面全体が LoadingSpinner に置き換わる
 *     (:1168 `if (loadingExisting || isResolvingPracticePermission) return ...`) ため、
 *     保存ボタン自体が DOM に存在しない。TAO-8 は「ガードを壊しても赤くならない」性質の
 *     defense-in-depth であることを PM が承認済み。Critical としては扱わない。
 *
 * ■ モック設計
 *   PracticeTabFormScreen.practiceScopeRowWipe.test.tsx と同型の構成を流用する。
 *   fixture の id/name は互いに部分文字列関係にならない固有の値にする。
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
      initialTab: "practice" as "practice" | "log",
      origin: undefined as "teamAdmin" | undefined,
    },
    navigate: vi.fn(),
    goBack: vi.fn(),
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
    currentUserId: "user-1" as string,
    useTeamMembersQuery: vi.fn(),
    useTeamMembersQueryCalls: [] as Array<string | undefined>,
    supabase: makeSupabase(),
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
        // RN の `editable={false}` は実機で入力不可を意味する。jsdom の <input> には
        // 対応する属性が無いため、ここで `disabled` (実 DOM プロパティ) へ変換する。
        // これをしないと `.disabled` の assert が常に false になり、canEditPracticeDetails
        // の述語がどう壊れても検出できないテストになる。
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

// 引数を捨てないラッパー: canEditPracticeLogs/canEditPracticeDetails が正しい
// practiceTeamId で useTeamMembersQuery を呼んでいることを実測できるようにする
// (feedback_swimhub_test_mock_discards_query_args)。
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    mocks.useTeamMembersQueryCalls.push(teamId);
    return mocks.useTeamMembersQuery(teamId);
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

// testID (RTL の testIdAttribute 設定は HTML 属性の大文字小文字を区別しないため
// "testid" として解決される。data-testid など別属性名は拾われないので使わない)。
// intrinsic な <span> の型には無い属性なので、素通し用の緩い props 型を介して渡す。
function TestFlag(props: { testID: string; "data-disabled": string }) {
  return React.createElement("span", props);
}

vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({ disabled }: { disabled?: boolean }) => (
    <TestFlag testID="image-uploader-disabled-flag" data-disabled={String(!!disabled)} />
  ),
}));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({ disabled }: { disabled?: boolean }) => (
    <TestFlag testID="date-picker-disabled-flag" data-disabled={String(!!disabled)} />
  ),
}));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

const EDIT_RESTRICTED_MESSAGE = "この練習の情報はチーム管理者のみ編集できます";

const PRACTICE_ID = "practice-9701";
const TEAM_ID = "team-9702";
const ADMIN_VIEWER_ID = "roster-admin-9703";
const GENERAL_VIEWER_ID = "roster-general-9704";
const OWNER_ID = "roster-owner-9705";

const teamPracticeFixture = {
  id: PRACTICE_ID,
  user_id: OWNER_ID,
  team_id: TEAM_ID,
  date: "2026-04-10",
  title: "管理者ビュー鉛筆編集検証メニュー",
  place: "検証用市民プール",
  note: "origin付き編集導線の確認用備考",
  image_paths: [],
  created_at: "2026-04-10T00:00:00Z",
  updated_at: "2026-04-10T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // useTeamMembersQuery は素朴な vi.fn() でモックしており、mockReturnValue を
  // 差し替えただけでは React が自発的に再レンダーしない (実物の react-query なら
  // 内部 state 更新で再レンダーされる)。RTL の `rerender(同一要素)` は
  // ReactDOM 側で実質的な差分無しと判定されて子の再評価が起きないことを実測したため、
  // Host 自身に強制再レンダー用の useReducer を持たせ、外部から明示的に
  // dispatch できるようにする (isLoading 解決後の再評価を確認する TAO-9 用)。
  let forceUpdate: (() => void) | null = null;

  function Host() {
    const [mounted, setMounted] = React.useState(true);
    const [, bump] = React.useReducer((c: number) => c + 1, 0);
    React.useEffect(() => {
      mocks.goBack.mockImplementation(() => setMounted(false));
      forceUpdate = bump;
      return () => {
        forceUpdate = null;
      };
    }, []);
    if (!mounted) return null;
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
      forceUpdate();
    },
  };
}

beforeEach(() => {
  mocks.routeParams.practiceId = PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = "practice";
  mocks.routeParams.origin = undefined;
  mocks.currentUserId = ADMIN_VIEWER_ID;

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.setOptions.mockReset();
  mocks.getTeamScopedPracticeById.mockReset().mockResolvedValue(structuredClone(teamPracticeFixture));
  mocks.createMutateAsync.mockReset();
  mocks.createLogMutateAsync.mockReset();
  mocks.updateLogMutateAsync.mockReset();
  mocks.useTeamMembersQueryCalls.length = 0;

  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset().mockResolvedValue([]);
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({ data: [], isLoading: false });

  vi.mocked(Alert.alert).mockClear();
});

describe("PracticeTabFormScreen — origin=teamAdmin による basicData 編集許可 (Sprint Contract #PM-1)", () => {
  describe("[SC1] admin かつ origin=teamAdmin: 全 basicData フィールドが編集可能・バナー非表示", () => {
    it("[TAO-1/2/3] 日付・画像が disabled でなく、制限バナーも表示されない", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
          { user_id: OWNER_ID, role: "user" },
        ],
        isLoading: false,
      });

      renderScreen();

      await waitFor(() => {
        expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
      });

      // [TAO-1] タイトル/場所/メモ入力欄 (input 要素) が disabled でない
      const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
      const placeInput = screen.getByDisplayValue(teamPracticeFixture.place as string) as HTMLInputElement;
      const noteInput = screen.getByDisplayValue(teamPracticeFixture.note as string) as HTMLInputElement;
      expect(titleInput.disabled).toBe(false);
      expect(placeInput.disabled).toBe(false);
      expect(noteInput.disabled).toBe(false);

      // [TAO-2] 制限バナーが表示されない
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      // [TAO-3] ImageUploader が disabled=false で描画される
      const imageFlag = screen.getByTestId("image-uploader-disabled-flag");
      expect(imageFlag.getAttribute("data-disabled")).toBe("false");
    });
  });

  describe("[SC6] origin=teamAdmin でも実 admin でなければ編集不可 (UI が RLS より広がらない)", () => {
    it("[TAO-4] origin=teamAdmin + 一般メンバー: basicData は disabled のまま、バナーが表示される", async () => {
      mocks.currentUserId = GENERAL_VIEWER_ID;
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: GENERAL_VIEWER_ID, role: "user" },
          { user_id: OWNER_ID, role: "user" },
        ],
        isLoading: false,
      });

      renderScreen();

      await waitFor(() => {
        expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
      });

      const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
      expect(titleInput.disabled).toBe(true);
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

      await act(async () => {
        fireEvent.click(screen.getByTestId("practice-tab-form-save"));
        await flushAsync();
      });
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    });

    it("[TAO-5] origin=teamAdmin + 作成者本人 (owner) だが admin ではない: 依然として編集不可 (owner 判定は使わない)", async () => {
      mocks.currentUserId = OWNER_ID;
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: OWNER_ID, role: "user" },
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
        ],
        isLoading: false,
      });

      renderScreen();

      await waitFor(() => {
        expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
      });

      const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
      expect(titleInput.disabled).toBe(true);
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
    });
  });

  describe(
    "[差分実験] origin パラメータの有無だけを変えた対照ケース (TAO-1 とペアで『origin を消すと壊れる』ことを保証する)",
    () => {
      it("[TAO-6] admin だが origin 未指定: basicData は編集不可のまま (practiceScopeRowWipe [P-11] と同値)", async () => {
        mocks.routeParams.origin = undefined; // 明示的に「無し」
        mocks.useTeamMembersQuery.mockReturnValue({
          data: [
            { user_id: ADMIN_VIEWER_ID, role: "admin" },
            { user_id: OWNER_ID, role: "user" },
          ],
          isLoading: false,
        });

        renderScreen();

        await waitFor(() => {
          expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
        });

        const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
        expect(titleInput.disabled).toBe(true);
        expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

        await act(async () => {
          fireEvent.click(screen.getByTestId("practice-tab-form-save"));
          await flushAsync();
        });
        expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
      });
    },
  );

  describe("[SC7] 権限解決中 (useTeamMembersQuery isLoading=true) はバナー非表示・保存不可", () => {
    it("[TAO-7/8] isLoading=true の間、画面全体がローディング表示に置き換わり、バナーも保存ボタンも DOM に存在しない", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: true });

      renderScreen();

      await waitFor(() => {
        expect(mocks.getTeamScopedPracticeById).toHaveBeenCalledWith(PRACTICE_ID);
      });
      await flushAsync();

      // フォーム本体 (basicData タイトル欄) が描画されていないことで、画面全体が
      // ローディング表示に置き換わっていることを確認する
      expect(screen.queryByDisplayValue(teamPracticeFixture.title as string)).toBeNull();
      // 制限バナー (「権限なし」の誤表示) が出ていないこと ([SC7] 前半の検証観点)
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
      // 保存ボタン自体が存在しない = 保存を物理的に実行できない ([SC7] 後半。
      // PM 裁定: このガードは isResolvingPracticePermission による画面全体のローディング
      // ゲートと二重になっており「到達不能な defense-in-depth」。壊れても即 Critical には
      // ならないが、ここで構造的な到達不能性そのものを実測しておく)
      expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    });

    it("[TAO-9] isLoading が false に解決した後、admin+origin=teamAdmin なら編集可能になり保存できる", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: true });

      const { forceRerender } = renderScreen();

      await waitFor(() => {
        expect(mocks.getTeamScopedPracticeById).toHaveBeenCalledWith(PRACTICE_ID);
      });
      // getTeamScopedPracticeById の Promise 解決 (setPracticeTeamId 等) を確実に
      // flush してから isLoading を切り替える (でないと practiceTeamId 未設定のまま
      // rerender してしまい isResolvingPracticePermission の再評価対象がずれる)
      await act(async () => {
        await flushAsync();
      });
      expect(screen.queryByDisplayValue(teamPracticeFixture.title as string)).toBeNull();

      // ローディング解決 → 明示的に rerender して再評価させる (vi.fn() モックの
      // 戻り値変更は自発的な再レンダーを引き起こさないため)
      act(() => {
        mocks.useTeamMembersQuery.mockReturnValue({
          data: [
            { user_id: ADMIN_VIEWER_ID, role: "admin" },
            { user_id: OWNER_ID, role: "user" },
          ],
          isLoading: false,
        });
        forceRerender();
      });

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
        },
        { timeout: 5000 },
      );

      const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
      expect(titleInput.disabled).toBe(false);
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      fireEvent.change(titleInput, { target: { value: "編集後タイトル-TAO9" } });
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(() => {
        expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      });
      const [{ updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(updates.title).toBe("編集後タイトル-TAO9");
    });
  });

  describe(
    "[SC2] 保存時、親 UPDATE が実際に呼ばれ、編集後の値が payload に乗る (無言スキップの検出)",
    () => {
      it("[TAO-10] origin=teamAdmin + admin: タイトルを編集して保存 → updatePracticeMutation に編集後の値が厳密一致で乗る", async () => {
        mocks.routeParams.origin = "teamAdmin";
        mocks.useTeamMembersQuery.mockReturnValue({
          data: [
            { user_id: ADMIN_VIEWER_ID, role: "admin" },
            { user_id: OWNER_ID, role: "user" },
          ],
          isLoading: false,
        });

        renderScreen();

        await waitFor(() => {
          expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
        });

        const titleInput = screen.getByDisplayValue(teamPracticeFixture.title as string) as HTMLInputElement;
        fireEvent.change(titleInput, { target: { value: "TAO10編集後タイトル固有文字列" } });

        fireEvent.click(screen.getByTestId("practice-tab-form-save"));

        await waitFor(() => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        });
        const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
          { id: string; updates: Record<string, unknown> },
        ];
        expect(id).toBe(PRACTICE_ID);
        expect(updates.title).toBe("TAO10編集後タイトル固有文字列");
        expect(updates.place).toBe(teamPracticeFixture.place);
        expect(updates.note).toBe(teamPracticeFixture.note);
      });
    },
  );

  describe(
    "[SC4 非退行] canEditPracticeLogs (log タブ) は origin の影響を受けない",
    () => {
      it("[TAO-11] origin=teamAdmin + 一般メンバー: basicData 用の origin は log タブに波及しない (2判定変数が独立していること)", async () => {
        mocks.currentUserId = GENERAL_VIEWER_ID;
        mocks.routeParams.origin = "teamAdmin";
        mocks.routeParams.initialTab = "log";
        mocks.useTeamMembersQuery.mockReturnValue({
          data: [
            { user_id: GENERAL_VIEWER_ID, role: "user" },
            { user_id: OWNER_ID, role: "user" },
          ],
          isLoading: false,
        });

        renderScreen();

        await waitFor(() => {
          expect(screen.getByTestId("practicelog-item-tabs")).toBeTruthy();
        });

        // 一般メンバーは owner でも admin でもないため、origin=teamAdmin であっても
        // log タブの「メニュー追加」ボタンは従来どおり非表示のまま
        expect(screen.queryByTestId("item-tab-add")).toBeNull();
        expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
      });
    },
  );

  describe("[引数を捨てない検証] useTeamMembersQuery が正しい teamId で呼ばれていること", () => {
    it("useTeamMembersQuery が practiceTeamId (取得した練習の team_id) で呼ばれる", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
        isLoading: false,
      });

      renderScreen();

      await waitFor(() => {
        expect(screen.getByDisplayValue(teamPracticeFixture.title as string)).toBeTruthy();
      });

      expect(mocks.useTeamMembersQueryCalls).toContain(TEAM_ID);
    });
  });
});

/**
 * ■ Sprint Contract #PM-1 Verification Checklist ↔ 検証手段 対応表 (このファイル分)
 *
 * SC1 → TAO-1/2/3 (PASS 見込み・下記 Phase B 実行結果参照)
 * SC2 → TAO-10
 * SC4 → TAO-11 + 既存 practiceScopeRowWipe.test.tsx [SC2-1]〜[SC2-4] (無変更)
 * SC6 → TAO-4/5
 * SC7 → TAO-7/8 (前半バナー・後半保存不可) + TAO-9 (解決後に正しく編集可能へ遷移)
 * SC3 → このファイルでは扱わない。既存 practiceScopeRowWipe.test.tsx [P-11]/[P-13]/[P-15]
 *        (origin 未設定=個人フロー相当) が非退行としてカバーする。
 * SC5 → テスト不能。`git diff --stat` で実測 (別途報告)。
 */
