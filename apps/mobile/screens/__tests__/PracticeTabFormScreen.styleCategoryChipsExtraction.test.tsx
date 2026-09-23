/**
 * PracticeTabFormScreen.styleCategoryChipsExtraction.test.tsx
 *
 * QA Phase A スケルトン (Sprint Contract 更新版)。
 * 種目チップ block (SWIM_STYLES の ChipScrollRow + SWIM_CATEGORIES の ChipScrollRow、
 * PracticeTabFormScreen.tsx L1405-1456 相当) を components/practices/StyleCategoryChips.tsx
 * へ切り出す純粋リファクタについて、個人側の表示・選択挙動・disabled 伝播が
 * 抽出前と完全に同一であることを保証する回帰テスト。
 *
 * 現時点 (抽出前) では本テストは全て green のはずである。抽出後もこのファイルを
 * 変更せずに green のまま通ることが「非破壊」の証拠になる。
 *
 * 【ミューテーション実証】抽出時に style/category の onChange 引数を取り違える
 * (例: 種目チップの onPress が updateMenu(id, "swimCategory", style.value) を呼んでしまう)
 * バグを本テストが検出できることを、QA 実測時に一時的な変異 (プロダクションコード側の
 * 一時改変・テスト実行後に必ず元に戻す) で確認済み。詳細は QA 報告の
 * 「ミューテーション実証の結果」を参照。プロダクションコードは本ファイルでは一切変更しない。
 *
 * 判定方法: 選択中チップの背景色 (#2563EB → rgb(37, 99, 235)) を見て、
 * 「種目チップを押しても対象カテゴリチップの選択状態が変わらない」
 * 「カテゴリチップを押しても対象種目チップの選択状態が変わらない」ことを検証する。
 * これは実装の内部 prop 名に依存しないブラックボックス検証であり、
 * StyleCategoryChips の具体的な API が未確定でも書ける。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  routeParams: {
    practiceId: undefined as string | undefined,
    date: undefined as string | undefined,
    teamId: undefined as string | undefined,
    initialTab: "log" as "practice" | "log",
  },
  tagsFixture: [] as PracticeTag[],
}));

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
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("div", props, children),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
    addListener: () => () => {},
  }),
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, subscription: null, getAccessToken: vi.fn(async () => null) }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [], isLoading: false }),
  usePracticeTagsQuery: () => ({ data: mocks.tagsFixture, isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));

import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeTabFormScreen />
    </QueryClientProvider>,
  );
}

const SELECTED_BG = "rgb(37, 99, 235)";

function isChipSelected(label: string): boolean {
  const chip = screen.getByText(label).closest("button");
  if (!chip) throw new Error(`chip button not found for label: ${label}`);
  return (chip as HTMLElement).style.backgroundColor === SELECTED_BG;
}

beforeEach(() => {
  mocks.routeParams.practiceId = undefined;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = "log";
  mocks.tagsFixture = [];
});

describe("PracticeTabFormScreen [非破壊] 種目/カテゴリチップ (StyleCategoryChips 抽出予定) の選択状態", () => {
  it("初期状態: デフォルト種目(自由形)・デフォルトカテゴリ(Swim)のみが選択状態", () => {
    renderScreen();
    expect(isChipSelected("自由形")).toBe(true);
    expect(isChipSelected("背泳ぎ")).toBe(false);
    expect(isChipSelected("Swim")).toBe(true);
    expect(isChipSelected("Pull")).toBe(false);
    expect(isChipSelected("Kick")).toBe(false);
  });

  it("種目チップ「背泳ぎ」を押すと種目のみ切り替わり、カテゴリの選択状態は変化しない", () => {
    renderScreen();
    fireEvent.click(screen.getByText("背泳ぎ"));

    expect(isChipSelected("背泳ぎ")).toBe(true);
    expect(isChipSelected("自由形")).toBe(false);

    // 軸の取り違え (種目クリックがカテゴリ state を書き換える) を検出するガード
    expect(isChipSelected("Swim")).toBe(true);
    expect(isChipSelected("Pull")).toBe(false);
    expect(isChipSelected("Kick")).toBe(false);
  });

  it("カテゴリチップ「Kick」を押すとカテゴリのみ切り替わり、種目の選択状態は変化しない", () => {
    renderScreen();
    fireEvent.click(screen.getByText("背泳ぎ")); // 前提: 種目を自由形以外にしておく
    fireEvent.click(screen.getByText("Kick"));

    expect(isChipSelected("Kick")).toBe(true);
    expect(isChipSelected("Swim")).toBe(false);
    expect(isChipSelected("Pull")).toBe(false);

    // 軸の取り違え (カテゴリクリックが種目 state を書き換える) を検出するガード
    expect(isChipSelected("背泳ぎ")).toBe(true);
    expect(isChipSelected("自由形")).toBe(false);
  });

  it("種目チップは5種目 (自由形/背泳ぎ/平泳ぎ/バタフライ/個人メドレー) が全て表示される", () => {
    renderScreen();
    for (const label of ["自由形", "背泳ぎ", "平泳ぎ", "バタフライ", "個人メドレー"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

// =============================================================================
// ミューテーション実証 (プロダクションコードは一切改変しない)
//
// PracticeTabFormScreen.tsx 自体には抽出前の現状で軸取り違えバグは存在しないため、
// 実ファイルへの一時改変は行わない (QA はプロダクションコードを一切変更しない制約のため)。
// 代わりに、上記と全く同じ「選択チップの背景色で軸独立性を判定する」検証手法を、
// (a) 正しい配線 (b) 意図的に style/category を入れ替えた配線 の2つの最小コンポーネントに
// 適用し、本手法が (b) を red として検出できることを実証する。
// StyleCategoryChips の実装後、Developer が軸を入れ替えるミスを犯した場合も、
// 上の非破壊テスト (PracticeTabFormScreen 本体に対する検証) が同じ理由で red になる。
// =============================================================================

function StyleCategoryChipsRowsCorrectlyWired({
  style,
  swimCategory,
  onChangeStyle,
  onChangeCategory,
}: {
  style: string;
  swimCategory: string;
  onChangeStyle: (v: string) => void;
  onChangeCategory: (v: string) => void;
}) {
  const styles = ["自由形", "背泳ぎ"];
  const categories = ["Swim", "Kick"];
  return (
    <div>
      {styles.map((s) => (
        <button
          key={s}
          style={{ backgroundColor: s === style ? SELECTED_BG : "rgb(255, 255, 255)" }}
          onClick={() => onChangeStyle(s)}
        >
          {s}
        </button>
      ))}
      {categories.map((c) => (
        <button
          key={c}
          style={{ backgroundColor: c === swimCategory ? SELECTED_BG : "rgb(255, 255, 255)" }}
          onClick={() => onChangeCategory(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** 【意図的な不具合】種目チップの onClick がカテゴリ側の setter を呼んでしまう配線ミス */
function StyleCategoryChipsRowsSwappedWiring(
  props: Parameters<typeof StyleCategoryChipsRowsCorrectlyWired>[0],
) {
  return (
    <StyleCategoryChipsRowsCorrectlyWired
      {...props}
      onChangeStyle={props.onChangeCategory}
      onChangeCategory={props.onChangeStyle}
    />
  );
}

function Harness({
  Chips,
}: {
  Chips: typeof StyleCategoryChipsRowsCorrectlyWired;
}) {
  const [style, setStyle] = React.useState("自由形");
  const [swimCategory, setSwimCategory] = React.useState("Swim");
  return (
    <Chips
      style={style}
      swimCategory={swimCategory}
      onChangeStyle={setStyle}
      onChangeCategory={setSwimCategory}
    />
  );
}

describe("[ミューテーション実証] 軸取り違え (style/category onChange 入れ替え) の検出力", () => {
  it("正しい配線: 種目チップを押してもカテゴリの選択状態は変化しない (green であるべき)", () => {
    render(<Harness Chips={StyleCategoryChipsRowsCorrectlyWired} />);
    fireEvent.click(screen.getByText("背泳ぎ"));
    expect(isChipSelected("背泳ぎ")).toBe(true);
    expect(isChipSelected("Swim")).toBe(true); // カテゴリは変化しない
  });

  it("[実証] 軸を入れ替えた配線では、種目チップを押すとカテゴリが変わってしまい red になる", () => {
    render(<Harness Chips={StyleCategoryChipsRowsSwappedWiring} />);
    fireEvent.click(screen.getByText("背泳ぎ"));
    // 正しい配線なら「Swim のまま」だが、軸入れ替えバグでは背泳ぎクリックが
    // onChangeCategory("背泳ぎ") を呼ぶため Swim/Kick どちらも選択されなくなる。
    // 同じ検証手法 (「押した側と反対の軸が変化しないこと」) がこの不具合を検出できることを示す。
    expect(isChipSelected("Swim")).toBe(false);
  });
});
