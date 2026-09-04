/**
 * PracticeTabFormScreen.practiceScopeRowWipe.test.tsx
 *
 * 回帰テスト: 「編集対象の練習が usePracticesQuery の一覧スコープ (user_id=自分 かつ
 * 直近365日) に含まれない場合、旧実装は `.find()` が外れて初期化をスキップし、
 * practiceTab が初期値 (title/place/note が空・image_paths=[]) のまま編集可能になり、
 * 保存すると既存の title/place/note/image_paths が空値で丸ごと上書きされる」データ損失バグ。
 *
 * 到達経路 (PM 実測):
 *   1. チーム無関係: カレンダーの月単位クエリで 365 日超の自分の練習を開いて編集
 *   2. チーム管理者: useDayDetailHandlers.ts が所有者チェックなしで他メンバーの
 *      team_practice を編集可能に配線
 *
 * 修正 (App Developer 実装、鵜呑みにせず実測):
 *   1. 初期化を `practices.find()` から `PracticeAPI.getPracticeById(id)` 単独に一本化
 *      (getPracticeById は日付でスコープしない user_id 直指定取得のため、経路1は解消する)
 *   2. getPracticeById が null → Alert + navigation.goBack() で画面離脱 (経路2:
 *      他メンバーのチーム練習は "拒否して止める" が正しい挙動)。例外時も同様に離脱
 *   3. 保存直前に `.select("image_paths").eq("id", id).single()` で権威ある値を再取得し、
 *      失敗時は throw して image_paths を含む update 自体を送らない
 *
 * 追加仕様 (2026-09-02, QA 実測): 「チーム管理者も他メンバーの練習を編集できる」仕様に伴い、
 * 初期化の取得元が `getPracticeById` (user_id スコープ) から
 * **`getTeamScopedPracticeById`** (id 直指定のみ・practices SELECT RLS がそのままスコープ:
 * 所有者本人 OR チームメンバー) に変更された。上記 [P-1]〜[P-10] の検証観点自体は不変のため、
 * モックの対象メソッド名のみ `getTeamScopedPracticeById` に追従させている
 * (下記 [P-11]〜[P-15] が新規追加分)。
 *
 * Sprint Contract 検証観点:
 *   [P-1] 一覧に対象練習が含まれない状態で getTeamScopedPracticeById が実データを返すとき、
 *         practiceTab の title/place/note が実データで初期化される
 *   [P-2] 同状態で保存したとき、updatePracticeMutation に渡る title/place/note が
 *         null にならない (本バグの核心。厳密一致で assert)
 *   [P-3] 画像を実際に1枚追加したとき、updates.image_paths が権威データの既存2件+
 *         新規1件=3件になる (厳密一致)
 *   [P-4] getTeamScopedPracticeById が null を返す場合 (経路2)、update が一切呼ばれない
 *   [P-5] getTeamScopedPracticeById が例外を投げる場合も同様
 *   [P-6] 画像を実際に変更したうえで保存直前の image_paths 再取得が失敗した場合、
 *         image_paths を含む update が一切送られない (image_paths キーの不在で判定。
 *         回数0だけでは他フィールドの update と区別できないため)
 *   [P-7] 非退行: 一覧に含まれる通常の練習でも title/place/note は従来どおり保存
 *         できる (image_paths の期待は P-9 に分離。理由は下記 PM 裁定を参照)
 *   [P-8] 画像を実際に1枚削除したとき、削除対象以外の既存画像パスが保持される (厳密一致)
 *   [P-9] 画像を一切変更していないテキストのみの編集では、updates に image_paths
 *         キー自体が含まれない (部分更新なので既存値は DB 側にそのまま残る)
 *   [P-10] 同条件で、image_paths の再取得クエリ自体が発行されない
 *   [P-11] チーム練習・他メンバーが作成者・自分がチーム管理者の場合、フォームが実データで
 *          初期化され、保存が成功する (updatePracticeMutation に実 title/place/note が渡る)
 *   [P-12] チーム練習・他メンバーが作成者・自分は一般メンバーの場合、データは表示されるが
 *          保存は実行されない (updatePracticeMutation が呼ばれない)。画面に権限メッセージが
 *          出ていることも合わせて検証する (呼び出し回数0だけでは「まだ描画中」と区別できないため)
 *   [P-13] チーム練習・他メンバーが作成者・権限判定が未確定 (useTeamMembersQuery が
 *          isLoading) の場合、編集可能 UI を出さず保存も実行されない
 *   [P-14] 個人練習 (team_id が null)・自分が作成者の場合、従来どおり編集・保存できる (非退行)
 *   [P-15] チーム練習・自分が作成者の場合、管理者でなくても編集・保存できる
 *
 * PM 裁定 (2026-09-02): [P-3]/[P-7] は元々「画像を一切操作しなくても updates.image_paths
 * が権威データと厳密一致する」ことを要求していたが、これは ImageUploader を
 * `() => null` にモックし onImagesChange を一度も発火させない fixture 選択の結果、
 * 現在の実装の「保存直前に無条件で image_paths を再取得し常に updates に含める」という
 * 挙動をなぞっただけで、実際の画像追加・削除を一度も検証していなかった
 * (「ガードを避ける fixture を選ぶと全 green のまま無保護になる」という本リポジトリで
 * 過去に事故化したパターン)。Reviewer 指摘のとおり、この無条件再取得は画像を一切
 * 触っていないテキストのみの編集 (メモの誤字修正・日付変更) でも余分なラウンドトリップに
 * 依存し、失敗すると画像と無関係な title/place/note/date の変更まで含めて保存全体が
 * 中止される。参照実装 (RecordFormScreen.tsx:533 の
 * `deletedImageIds.length > 0 || newImageFiles.length > 0` ゲート、
 * PracticeTabModal.tsx:486-489 の `hasImageChanges`) はいずれもゲートしている。
 * よって [P-9]/[P-10] を「画像未変更ならゲートして再取得もしない」という**あるべき設計**
 * として新設した。App Developer がまだこのゲートを実装していないため、[P-9]/[P-10] は
 * 現行実装に対して red になるのが正しい (これ自体が無条件再取得というバグの証明)。
 * [P-3]/[P-8] は「画像を実際に変更した」ケースに書き換え、ImageUploader モックを
 * onImagesChange を実発火できる形に変更した (詳細は下記モック構成メモ)。
 *
 * トートロジー防止メモ: executeSave 内の式をコピーして検証するのではなく、実際に
 * PracticeTabFormScreen を render → 保存ボタン押下 → updatePracticeMutation.mutateAsync
 * に渡された実引数を検証する。fixture の title/place/note/place は互いに部分文字列
 * 関係にならない固有の文字列にしている。
 *
 * navigation.goBack() のモック化について (P-4/P-5 の設計判断):
 *   実際の react-navigation では goBack() はスタック pop であり、画面コンポーネントは
 *   アンマウントされる。素朴に goBack を vi.fn() のまま放置すると、jsdom 上では画面が
 *   居座り続け「Alert+goBack が呼ばれた後も保存ボタンを押せば update が飛ぶ」という
 *   テストアーティファクトが発生し、正しい実装を red 判定してしまう (逆に、実装2 の
 *   ガードを無効化した場合と区別がつかなくなる)。そのため Host コンポーネントで
 *   goBack() を「実際に画面を外す」動作として模倣し、"呼び出し回数0" だけでなく
 *   "保存ボタンへ物理的に到達できない" ことも合わせて検証する。
 *
 * クエリ引数を捨てない: 保存直前の image_paths 再取得は table/columns/id を
 * imagePathsFetchCalls に記録し、対象の id に対して実際にクエリが発行されたことを
 * 確認できるようにする (RecordFormScreen.competitionScopeImagePaths.test.tsx と同型)。
 *
 * モック構成は PracticeTabFormScreen.tagModalRace.test.tsx (react-native / navigation /
 * queries の基本モック) と RecordFormScreen.competitionScopeImagePaths.test.tsx
 * (supabase の id 直指定クエリの記録・mergeImagePaths は実装をそのまま使う設計) を流用。
 * ImageUploader のモックも RecordFormScreen.competitionScopeImagePaths.test.tsx と
 * 同型 (`grep -rl "ImageUploader" apps/mobile --include="*.test.tsx"` で確認した唯一の
 * 「実際に onImagesChange を発火させる」既存パターン): `() => null` ではなく、押すと
 * onImagesChange(newFiles, deletedIds) を実発火するボタンを描画するコンポーネントに
 * 差し替える。ImageUploader の props (`existingImages` / `onImagesChange` / `maxImages` /
 * `disabled` / `label`) と handleImagesChange のシグネチャ
 * (`(newFiles: ImageFile[], deletedIds: string[]) => void`。setState で全置換であり
 * 累積ではない) は apps/mobile/components/shared/ImageUploader.tsx と
 * apps/mobile/screens/PracticeTabFormScreen.tsx を実測して確認した。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, configure } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeWithLogs } from "@apps/shared/types";

// React Native の Pressable/View 等は `testID` (RN 規約) を渡すが、jsdom はこれを
// `data-testid` ではなく `testid` 属性として反映する。RTL のデフォルトは `data-testid`
// を探すため、このファイルに限定して属性名を切り替える
// (apps/mobile/__tests__/screens/CompetitionTabFormScreen.test.tsx と同じ対処)。
configure({ testIdAttribute: "testID" });

const mocks = vi.hoisted(() => {
  const imagePathsResponses: Record<
    string,
    { data: { image_paths: string[] } | null; error: unknown }
  > = {};
  const imagePathsFetchCalls: Array<{ table: string; columns: string; id: string }> = [];

  function makeSupabase() {
    return {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (_column: string, id: string) => {
            imagePathsFetchCalls.push({ table, columns, id });
            return {
              single: () =>
                Promise.resolve(
                  imagePathsResponses[id] ?? {
                    data: null,
                    error: new Error(`no mock response for ${table}:${id}`),
                  },
                ),
            };
          },
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
    },
    practicesListFixture: [] as Array<{ id: string; date: string }>,
    // ImageUploader モック (下記 vi.mock) のボタンから発火する固定 fixture。
    // 対象練習の image_paths は tuple 型で持ち、後続の targetPracticeFixture.image_paths
    // が同じ配列を参照する唯一の定義元にする (二重管理を避ける)。
    newImageFileFixture: {
      uri: "file://new-upload-delta.jpg",
      base64: "base64-content-delta",
      fileExtension: "jpg",
    },
    targetExistingImagePaths: ["practice/77/existing-alpha.jpg", "practice/77/existing-beta.jpg"] as [
      string,
      string,
    ],
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
    getAccessToken: vi.fn(),
    // 編集モードの初期化取得元 (getPracticeById は仕様追加で getTeamScopedPracticeById に
    // 置き換わった。P-1〜P-10 の検証観点は変えず、対象メソッド名だけ追従させる)
    getTeamScopedPracticeById: vi.fn(),
    getUniquePlaces: vi.fn(),
    resolveGalleryImages: vi.fn(),
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createLogMutateAsync: vi.fn(),
    updateLogMutateAsync: vi.fn(),
    // ログイン中ユーザー (canEditPracticeDetails の判定に使う)。既存 P-1〜P-10 は
    // team_id を持たない個人練習の fixture のため、この値には依存しない。
    currentUserId: "user-1" as string,
    // チームメンバー一覧 (P-11〜P-15 の編集権限判定用)。CompetitionTabFormScreen.test.tsx の
    // h.mockUseTeamMembersQuery と同型 (`{ data, isLoading }` を返す vi.fn())。
    useTeamMembersQuery: vi.fn(),
    imagePathsResponses,
    imagePathsFetchCalls,
    supabase: makeSupabase(),
  };
});

// KeyboardAvoidingView / Dimensions / Keyboard は __mocks__/react-native.ts に存在しないため、
// この画面 (トップレベルで KeyboardAvoidingView を使う) 用に補完する
// (PracticeTabFormScreen.tagModalRace.test.tsx と同じ対処)。
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
      ...props
    }: { onChangeText?: (text: string) => void; value?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
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
    // canEditPracticeDetails (所有者本人 or チーム管理者判定) が参照するログインユーザー。
    user: { id: mocks.currentUserId },
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

// useTeamMembersQuery (canEditPracticeDetails の判定用)。CompetitionTabFormScreen.test.tsx
// の h.mockUseTeamMembersQuery と同型のモック構成を流用する。
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: mocks.useTeamMembersQuery,
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  // 一覧スコープ (対象練習を含む/含まないをテストごとに切り替える)
  usePracticesQuery: () => ({ data: mocks.practicesListFixture, isLoading: false }),
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

// getTeamScopedPracticeById (ID 直指定・practices SELECT RLS スコープ = 所有者本人 OR
// チームメンバー) を唯一の取得元として制御する。getPracticeById (旧 user_id スコープ版) は
// 現在の PracticeTabFormScreen からは呼ばれなくなったが、他の呼び出し元との互換のため
// クラス自体には残す (未使用の vi.fn() で十分)。
// getUniquePlaces (場所サジェスト用) はこのテストの検証対象外。
vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPracticeById = vi.fn();
    getTeamScopedPracticeById = mocks.getTeamScopedPracticeById;
    getUniquePlaces = mocks.getUniquePlaces;
    deletePracticeLog = vi.fn();
    replacePracticeTimes = vi.fn();
  },
}));

// mergeImagePaths は本番実装をそのまま使う。resolveGalleryImages/uploadImagesViaApi/
// deleteImagesViaApi は実ネットワークアクセスを伴うためモックに差し替える
// (RecordFormScreen.competitionScopeImagePaths.test.tsx と同じ設計)。
vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return {
    ...actual,
    resolveGalleryImages: mocks.resolveGalleryImages,
    uploadImagesViaApi: mocks.uploadImagesViaApi,
    deleteImagesViaApi: mocks.deleteImagesViaApi,
  };
});

// ImageUploader は実際の画像追加・削除を検証するため、押すと onImagesChange を実発火する
// ボタンを描画するモックに差し替える (RecordFormScreen.competitionScopeImagePaths.test.tsx
// と同型)。handleImagesChange は setState で全置換 (累積ではない) なので、モックのボタンも
// 呼び出しごとに完全な newFiles/deletedIds を渡す。動画UIはこのテストの検証対象外。
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
      <button onClick={() => onImagesChange([mocks.newImageFileFixture], [])}>画像を1枚追加</button>
      <button onClick={() => onImagesChange([], [mocks.targetExistingImagePaths[0]])}>
        既存画像1枚目を削除
      </button>
    </>
  ),
}));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));

// DatePickerField は t("common.datePicker.weekdays", { returnObjects: true }) で配列を要求するが、
// vitest.setup.ts のグローバル react-i18next モックは returnObjects 非対応で文字列キーを返してしまい
// `weekdays.map is not a function` で落ちる (DashboardScreen.refreshDrift.test.tsx のコメント、
// apps/mobile/__tests__/screens/CompetitionTabFormScreen.test.tsx で確立済みの回避と同じ対処)。
// 日付ピッカー自体はこのテストの検証対象外 (date は毎回有効な文字列のままで validatePracticeTab は
// 通過する) なので、丸ごとモックする。
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

const TARGET_PRACTICE_ID = "practice-77";
// P-3 で追加する新規画像のアップロード先パス。既存 (alpha/beta) と部分文字列関係にならない
// 固有の名前にする。
const NEW_IMAGE_PATH = "practice/77/new-upload-delta.jpg";
// usePracticesQuery の一覧スコープ (直近365日・自分の行) に含まれない練習を模す。
// title/place/note は互いに・他の fixture とも部分文字列関係にならない固有の文字列にする。
// image_paths は mocks.targetExistingImagePaths (ImageUploader モックのボタンが参照する
// 配列と同一の定義元) をそのまま使い、二重管理を避ける。
const targetPracticeFixture = {
  id: TARGET_PRACTICE_ID,
  user_id: "user-1",
  date: "2024-01-15",
  title: "遠征合宿本大会前調整メニュー",
  place: "国立競技場水泳場",
  note: "コーチ指示コンディション調整重視",
  image_paths: mocks.targetExistingImagePaths,
  created_at: "2024-01-15T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

const NORMAL_PRACTICE_ID = "practice-12";
// [P-7] 非退行用: usePracticesQuery の一覧スコープに含まれる通常の練習
const normalPracticeFixture = {
  id: NORMAL_PRACTICE_ID,
  user_id: "user-1",
  date: "2026-08-20",
  title: "月次定期練習水中動作確認",
  place: "市営屋内プール棟",
  note: "通常メニュー消化良好",
  image_paths: ["practice/12/normal-gamma.jpg"],
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

// --- [P-11]〜[P-15] 「チーム管理者も他メンバーの練習を編集できる」仕様追加分の fixture ---
// user_id/team_id/role は互いに部分文字列関係にならない固有の値にする
// (CLAUDE.md/PM 指示: fixture 名が期待値の部分文字列になると toContain 系判定が壊れる事故の前科)。
const PRACTICE_EDIT_TEAM_ID = "team-9601";
// チーム練習の作成者本人 (P-11/P-12/P-13 で「他メンバー」役)。閲覧者とは別ユーザー。
const OTHER_MEMBER_OWNER_ID = "roster-owner-9602";
// P-11: 閲覧者=チーム管理者
const TEAM_ADMIN_VIEWER_ID = "roster-admin-9603";
// P-12: 閲覧者=一般メンバー
const TEAM_GENERAL_VIEWER_ID = "roster-general-9604";
// P-14/P-15: 閲覧者=自分自身が作成者
const SELF_CREATOR_ID = "roster-self-9605";

const TEAM_OWNED_PRACTICE_ID = "practice-601";
// [P-11]/[P-12]/[P-13] 共通: 他メンバーが作成したチーム練習
const teamOwnedByOtherFixture = {
  id: TEAM_OWNED_PRACTICE_ID,
  user_id: OTHER_MEMBER_OWNER_ID,
  team_id: PRACTICE_EDIT_TEAM_ID,
  date: "2026-02-10",
  title: "強化合宿ハイパフォーマンス測定会",
  place: "県立総合水泳センター",
  note: "外部コーチ帯同フォーム分析実施",
  image_paths: [],
  created_at: "2026-02-10T00:00:00Z",
  updated_at: "2026-02-10T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

const PERSONAL_SELF_PRACTICE_ID = "practice-602";
// [P-14] 非退行用: team_id が null の個人練習・自分が作成者
const personalSelfPracticeFixture = {
  id: PERSONAL_SELF_PRACTICE_ID,
  user_id: SELF_CREATOR_ID,
  team_id: null,
  date: "2026-03-05",
  title: "自主練習ドリル強化週間メニュー",
  place: "近隣スポーツクラブプール",
  note: "フォーム動画チェック実施済み",
  image_paths: [],
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

const TEAM_SELF_PRACTICE_ID = "practice-603";
// [P-15] チーム練習・自分が作成者 (管理者ではない)
const teamOwnedBySelfFixture = {
  id: TEAM_SELF_PRACTICE_ID,
  user_id: SELF_CREATOR_ID,
  team_id: PRACTICE_EDIT_TEAM_ID,
  date: "2026-03-12",
  title: "自主提出チーム練習週次記録会",
  place: "地域総合体育館屋内プール",
  note: "セット別タイム測定込み記録",
  image_paths: [],
  created_at: "2026-03-12T00:00:00Z",
  updated_at: "2026-03-12T00:00:00Z",
  practice_logs: [],
} satisfies PracticeWithLogs;

const EDIT_RESTRICTED_MESSAGE = "この練習の情報はチーム管理者のみ編集できます";

// クリックが React イベント系に伝播する猶予を与えるための明示的な待機。
// disabled=true の Pressable は React 側で onClick リスナー自体を除外するため
// (react-dom の getListener: button/input/select/textarea は props.disabled で
// リスナー自体を無効化する)、fireEvent.click 直後の同期的な assert でも十分ではあるが、
// 将来 UI 側の disabled 配線だけが崩れて executeSave 内部の非同期処理が実際に
// 開始されてしまう回帰を拾えるよう、余裕を持って待ってから判定する。
function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // navigation.goBack() を「スタックから画面が実際に取り除かれる」動作として模倣する Host。
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

function imagePathsUpdateCalls() {
  return mocks.updateMutateAsync.mock.calls.filter(([arg]) => {
    const updates = (arg as { updates?: Record<string, unknown> } | undefined)?.updates;
    return !!updates && Object.prototype.hasOwnProperty.call(updates, "image_paths");
  });
}

beforeEach(() => {
  mocks.routeParams.practiceId = TARGET_PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = "practice";
  mocks.practicesListFixture = [];

  // 既存 P-1〜P-10 の fixture は team_id を持たない個人練習のため、この既定値には
  // 依存しない。P-11〜P-15 は各テストで明示的に上書きする。
  mocks.currentUserId = "user-1";

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.setOptions.mockReset();
  mocks.getTeamScopedPracticeById.mockReset();
  mocks.createMutateAsync.mockReset();
  mocks.createLogMutateAsync.mockReset();
  mocks.updateLogMutateAsync.mockReset();

  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset().mockResolvedValue([]);
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: TARGET_PRACTICE_ID });
  // 既定: チームメンバー取得は空配列・非ローディング (個人練習の P-1〜P-10 には影響しない)。
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({ data: [], isLoading: false });

  Object.keys(mocks.imagePathsResponses).forEach((k) => delete mocks.imagePathsResponses[k]);
  mocks.imagePathsFetchCalls.length = 0;
  // デフォルト: 保存直前の権威ある image_paths 再取得は既存パスをそのまま返す
  mocks.imagePathsResponses[TARGET_PRACTICE_ID] = {
    data: { image_paths: [...targetPracticeFixture.image_paths] },
    error: null,
  };
  mocks.imagePathsResponses[NORMAL_PRACTICE_ID] = {
    data: { image_paths: [...normalPracticeFixture.image_paths] },
    error: null,
  };

  vi.mocked(Alert.alert).mockClear();
});

describe("PracticeTabFormScreen — 練習一覧スコープ外の練習を編集すると title/place/note/image_paths が上書きされるデータ損失バグの回帰", () => {
  it(
    "[P-1] usePracticesQuery一覧に対象練習が含まれない状態でも、getTeamScopedPracticeById の実データで" +
      "practiceTab (title/place/note) が初期化される",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(targetPracticeFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );
      expect(screen.getByDisplayValue(targetPracticeFixture.place as string)).toBeTruthy();
      expect(screen.getByDisplayValue(targetPracticeFixture.note as string)).toBeTruthy();

      expect(mocks.getTeamScopedPracticeById).toHaveBeenCalledWith(TARGET_PRACTICE_ID);
    },
    15000,
  );

  it(
    "[P-2] 保存時、updatePracticeMutation に渡る updates の title/place/note が null にならない " +
      "(本バグの核心。厳密一致で assert)",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByTestId("practice-tab-form-save")).toBeTruthy();
        },
        { timeout: 15000 },
      );

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(id).toBe(TARGET_PRACTICE_ID);
      expect(updates.title).toBe(targetPracticeFixture.title);
      expect(updates.place).toBe(targetPracticeFixture.place);
      expect(updates.note).toBe(targetPracticeFixture.note);
    },
    15000,
  );

  it(
    "[P-3] 画像を実際に1枚追加すると、updates.image_paths は権威データの既存2件+新規1件=3件になる " +
      "(厳密一致)",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));
      mocks.uploadImagesViaApi.mockResolvedValueOnce([{ path: NEW_IMAGE_PATH }]);

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByText("画像を1枚追加")).toBeTruthy();
        },
        { timeout: 15000 },
      );
      fireEvent.click(screen.getByText("画像を1枚追加"));

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(updates.image_paths).toEqual([...mocks.targetExistingImagePaths, NEW_IMAGE_PATH]);
      expect(updates.image_paths).toHaveLength(3);

      expect(mocks.uploadImagesViaApi).toHaveBeenCalledTimes(1);

      // クエリ引数を捨てない: 対象 id への image_paths 直指定クエリが実際に発行されたこと
      expect(
        mocks.imagePathsFetchCalls.some(
          (c) =>
            c.table === "practices" && c.id === TARGET_PRACTICE_ID && c.columns.includes("image_paths"),
        ),
      ).toBe(true);
    },
    15000,
  );

  it(
    "[P-4] getTeamScopedPracticeById が null を返す場合 (経路2: 他メンバーのチーム練習)、" +
      "update は一切呼ばれず、画面もスタックから除去され保存ボタンへ到達できない",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(null);

      renderScreen();

      await waitFor(
        () => {
          expect(mocks.goBack).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      expect(vi.mocked(Alert.alert)).toHaveBeenCalledWith(
        "エラーが発生しました",
        "練習記録が見つかりませんでした",
        [{ text: "OK" }],
      );

      // 画面が実際に除去され、保存ボタンへ物理的に到達できないこと自体が
      // 「保存を試みても送れない」ことの証明 (単なる呼び出し回数0より強い)
      expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "[P-5] getTeamScopedPracticeById が例外を投げる場合も同様に update は一切呼ばれず、画面が除去される",
    async () => {
      mocks.getTeamScopedPracticeById.mockRejectedValue(new Error("RLS denied: network error"));

      renderScreen();

      await waitFor(
        () => {
          expect(mocks.goBack).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      expect(vi.mocked(Alert.alert)).toHaveBeenCalledWith(
        "エラーが発生しました",
        "練習記録の取得に失敗しました",
        [{ text: "OK" }],
      );

      expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "[P-6] 画像を実際に変更したうえで保存直前の image_paths 再取得が失敗した場合、" +
      "image_paths を含む update は一切送られない (image_paths キーの不在で判定。" +
      "回数0だけでは他フィールドの update と区別できないため)",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));
      mocks.imagePathsResponses[TARGET_PRACTICE_ID] = {
        data: null,
        error: new Error("RLS denied: cannot read practices row"),
      };

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByText("画像を1枚追加")).toBeTruthy();
        },
        { timeout: 15000 },
      );
      // 画像を実際に変更しておく (未変更だと本来ゲートされ、再取得失敗経路自体を
      // 通らなくなるため、失敗経路の検証にならない)
      fireEvent.click(screen.getByText("画像を1枚追加"));

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      // 保存自体は例外で中断するため、何かしらの結果 (エラーダイアログ) を待ってから判定する
      await waitFor(
        () => {
          expect(vi.mocked(Alert.alert).mock.calls.length).toBeGreaterThan(0);
        },
        { timeout: 15000 },
      );

      expect(imagePathsUpdateCalls()).toHaveLength(0);
    },
    15000,
  );

  it(
    "[P-7 / 非退行] usePracticesQuery一覧に含まれる通常の練習は title/place/note を従来どおり" +
      "初期化・保存できる (image_paths の期待は P-9 に分離)",
    async () => {
      mocks.routeParams.practiceId = NORMAL_PRACTICE_ID;
      mocks.practicesListFixture = [{ id: NORMAL_PRACTICE_ID, date: normalPracticeFixture.date }];
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(normalPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(normalPracticeFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(id).toBe(NORMAL_PRACTICE_ID);
      expect(updates.title).toBe(normalPracticeFixture.title);
      expect(updates.place).toBe(normalPracticeFixture.place);
      expect(updates.note).toBe(normalPracticeFixture.note);
    },
    15000,
  );

  it(
    "[P-8] 画像を実際に1枚削除すると、削除対象以外の既存画像パスが保持される (厳密一致)",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByText("既存画像1枚目を削除")).toBeTruthy();
        },
        { timeout: 15000 },
      );
      fireEvent.click(screen.getByText("既存画像1枚目を削除"));

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(updates.image_paths).toEqual([mocks.targetExistingImagePaths[1]]);
      expect(updates.image_paths).toHaveLength(1);
    },
    15000,
  );

  it(
    "[P-9] 画像を一切変更していないテキストのみの編集では、updates に image_paths キー自体が" +
      "含まれない (部分更新なので既存値は DB 側にそのまま残る想定)",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByTestId("practice-tab-form-save")).toBeTruthy();
        },
        { timeout: 15000 },
      );

      // 画像ボタンには一切触れず、テキストのみの編集として保存する
      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(Object.prototype.hasOwnProperty.call(updates, "image_paths")).toBe(false);
    },
    15000,
  );

  it(
    "[P-10] 画像を一切変更していないテキストのみの編集では、image_paths の再取得クエリ自体が" +
      "発行されない",
    async () => {
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(targetPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByTestId("practice-tab-form-save")).toBeTruthy();
        },
        { timeout: 15000 },
      );

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      expect(mocks.imagePathsFetchCalls.filter((c) => c.columns.includes("image_paths"))).toHaveLength(
        0,
      );
    },
    15000,
  );

  it(
    "[P-11] チーム練習・他メンバーが作成者・自分がチーム管理者の場合、フォームが実データで" +
      "初期化され、保存が成功する (updatePracticeMutation に実 title/place/note が渡る)",
    async () => {
      mocks.currentUserId = TEAM_ADMIN_VIEWER_ID;
      mocks.routeParams.practiceId = TEAM_OWNED_PRACTICE_ID;
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: TEAM_ADMIN_VIEWER_ID, role: "admin" },
          { user_id: OTHER_MEMBER_OWNER_ID, role: "user" },
        ],
        isLoading: false,
      });
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(teamOwnedByOtherFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(teamOwnedByOtherFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );
      expect(screen.getByDisplayValue(teamOwnedByOtherFixture.place as string)).toBeTruthy();
      expect(screen.getByDisplayValue(teamOwnedByOtherFixture.note as string)).toBeTruthy();
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(id).toBe(TEAM_OWNED_PRACTICE_ID);
      expect(updates.title).toBe(teamOwnedByOtherFixture.title);
      expect(updates.place).toBe(teamOwnedByOtherFixture.place);
      expect(updates.note).toBe(teamOwnedByOtherFixture.note);
    },
    15000,
  );

  it(
    "[P-12] チーム練習・他メンバーが作成者・自分は一般メンバーの場合、データは表示されるが" +
      "保存は実行されず、権限メッセージが画面に表示される",
    async () => {
      mocks.currentUserId = TEAM_GENERAL_VIEWER_ID;
      mocks.routeParams.practiceId = TEAM_OWNED_PRACTICE_ID;
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: TEAM_GENERAL_VIEWER_ID, role: "user" },
          { user_id: OTHER_MEMBER_OWNER_ID, role: "user" },
        ],
        isLoading: false,
      });
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(teamOwnedByOtherFixture));

      renderScreen();

      // データ自体は表示される (閲覧は許可)
      await waitFor(
        () => {
          expect(screen.getByDisplayValue(teamOwnedByOtherFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );

      // 呼び出し回数0だけでは「まだ描画中」と区別できないため、権限メッセージが
      // 実際に画面へ出ていることも合わせて確認する。
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

      const saveButton = screen.getByTestId("practice-tab-form-save");
      fireEvent.click(saveButton);

      // disabled な保存ボタンへのクリックは同期的に無視されるが、UI 側の disabled 配線が
      // 崩れて executeSave 内部の非同期処理が起動してしまう回帰を拾えるよう、
      // 猶予を持って待ってから判定する。executeSave 側のガードが先に働く場合は
      // Alert.alert が呼ばれてから return するため、Alert の有無は問わず
      // 「保存が実行されない (updatePracticeMutation が呼ばれない)」ことのみを assert する。
      await flushAsync();

      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "[P-13] チーム練習・他メンバーが作成者・権限判定が未確定 (useTeamMembersQuery が" +
      "isLoading) の場合、編集可能 UI を出さず保存も実行されない",
    async () => {
      mocks.currentUserId = TEAM_ADMIN_VIEWER_ID;
      mocks.routeParams.practiceId = TEAM_OWNED_PRACTICE_ID;
      mocks.useTeamMembersQuery.mockReturnValue({ data: undefined, isLoading: true });
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(teamOwnedByOtherFixture));

      renderScreen();

      // 練習データ自体の取得は完了しているが、権限確定待ちのためフォームは出さない。
      await waitFor(
        () => {
          expect(mocks.getTeamScopedPracticeById).toHaveBeenCalledWith(TEAM_OWNED_PRACTICE_ID);
        },
        { timeout: 15000 },
      );
      // 取得完了後の state 更新 (practiceOwnerId/practiceTeamId/loadingExisting) が
      // コミットされる猶予を与える。
      await flushAsync();

      expect(screen.queryByDisplayValue(teamOwnedByOtherFixture.title as string)).toBeNull();
      expect(screen.queryByTestId("practice-tab-form-save")).toBeNull();
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
      expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    },
    15000,
  );

  it(
    "[P-14 / 非退行] 個人練習 (team_id が null)・自分が作成者の場合、従来どおり編集・保存できる",
    async () => {
      mocks.currentUserId = SELF_CREATOR_ID;
      mocks.routeParams.practiceId = PERSONAL_SELF_PRACTICE_ID;
      mocks.useTeamMembersQuery.mockReturnValue({ data: [], isLoading: false });
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(personalSelfPracticeFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(personalSelfPracticeFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(id).toBe(PERSONAL_SELF_PRACTICE_ID);
      expect(updates.title).toBe(personalSelfPracticeFixture.title);
      expect(updates.place).toBe(personalSelfPracticeFixture.place);
      expect(updates.note).toBe(personalSelfPracticeFixture.note);
    },
    15000,
  );

  it(
    "[P-15] チーム練習・自分が作成者の場合、管理者でなくても編集・保存できる",
    async () => {
      mocks.currentUserId = SELF_CREATOR_ID;
      mocks.routeParams.practiceId = TEAM_SELF_PRACTICE_ID;
      mocks.useTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: SELF_CREATOR_ID, role: "user" },
          { user_id: OTHER_MEMBER_OWNER_ID, role: "admin" },
        ],
        isLoading: false,
      });
      mocks.getTeamScopedPracticeById.mockResolvedValue(structuredClone(teamOwnedBySelfFixture));

      renderScreen();

      await waitFor(
        () => {
          expect(screen.getByDisplayValue(teamOwnedBySelfFixture.title as string)).toBeTruthy();
        },
        { timeout: 15000 },
      );
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      fireEvent.click(screen.getByTestId("practice-tab-form-save"));

      await waitFor(
        () => {
          expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 },
      );

      const [{ id, updates }] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(id).toBe(TEAM_SELF_PRACTICE_ID);
      expect(updates.title).toBe(teamOwnedBySelfFixture.title);
      expect(updates.place).toBe(teamOwnedBySelfFixture.place);
      expect(updates.note).toBe(teamOwnedBySelfFixture.note);
    },
    15000,
  );
});
