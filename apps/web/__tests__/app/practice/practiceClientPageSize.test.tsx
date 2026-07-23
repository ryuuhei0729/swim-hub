/**
 * PracticeClient pageSize 整合性テスト (Sprint Contract D1)
 *
 * バグ: practice/_client/PracticeClient.tsx が usePracticesQuery(supabase, { initialData })
 * を pageSize 未指定 (既定 20) で呼んでいるため、保存/編集/削除後の refetch で
 * created_at 降順の先頭20件に一覧が縮小する。SSR (PracticeDataLoader) は過去1年全件を
 * 取得するため、初回表示とミューテーション後で件数が食い違う。
 *
 * 手本 = 大会側の既完了修正 (CompetitionClient.tsx が useRecordsQuery(supabase, { pageSize: 1000 })
 * を明示している)。本ファイルは PracticeClient が同様に usePracticesQuery を
 * 「全件相当の pageSize」で呼び出していることを、実際にモジュールをスパイして検証する。
 *
 * Sprint Contract 検証観点:
 *   [V-D1-01] PracticeClient マウント時、usePracticesQuery が pageSize>=1000 (もしくは
 *             SSR 側 PracticeDataLoader の取得件数と矛盾しない十分大きい値) で呼ばれる
 *   [V-D1-02] 既定の pageSize=20 のまま (未指定) で呼ばれていないこと (退行防止の核心)
 *
 * 【Bug B (TZ 二重フェッチ) 修正に伴う後始末】旧 [V-D1-03] (`initialData`/`initialPractices` の
 * SSR 注入を検証) は削除した。HydrationBoundary + prefetchQuery 方式への移行により、
 * PracticeClient の `initialPractices` prop 自体が production コードから完全撤去され、
 * 検証対象の概念(initialData 配線)がコード上に存在しなくなったため。
 *
 * 【jsdom 描画リスクに関するメモ】
 * PracticeClient は react-query の usePracticesQuery/useXxxMutation 群 + Zustand
 * usePracticeStore + 複数の重量モーダル (PracticeTabModal 等) に依存する。本リポジトリでは
 * 「react-query + @supabase/ssr + symlink 解決」の組み合わせで jsdom がハングする既知の
 * 問題が (PracticeLogTemplateCreateModal.test.tsx 等に) 記録されている。
 * この既知の踏み抜きを避けるため、本テストは:
 *   - "@apps/shared/hooks/queries/practices" を丸ごとモックし、実際の useQuery は一切
 *     実行しない (usePracticesQuery をスパイ関数に差し替え、引数だけを捕捉する)
 *   - "@/contexts" (useAuth) をモックし、実 AuthProvider / 実 supabase クライアントを
 *     生成しない
 *   - PracticeTabModal / PracticeDetailModal / SortBottomSheet / FilterBottomSheet /
 *     ListToolbar / PracticeLogCard など子の重量コンポーネントは軽量スタブに差し替える
 * を行う。それでも Phase B で実装差し替え後に environment error (ハング/OOM) が再発する場合は、
 * このテストを削除し、PracticeClient 側で「クエリオプション構築」を
 * `getPracticeQueryOptions()` のような純粋関数として抽出したうえで、その関数だけを
 * ユニットテストする方式にフォールバックすること (PracticeLogTemplateCreateModal.test.tsx
 * が採用したのと同じ回避パターン)。その場合も [V-D1-01]〜[V-D1-02] の検証内容自体は変えない。
 *
 * 【Phase A 時点の実行結果】上記のモック方針で jsdom ハングは発生しないことを実測済み
 * (2026-07-23)。ただし現時点では D1 未実装のため [V-D1-01]/[V-D1-02] は意図的に FAIL する
 * (pageSize 未指定=20相当で呼ばれるため)。Phase B で Developer が pageSize を
 * 十分large な値 (recordKeys 同様 1000 目安) に変更すると green になる想定。
 */

import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  usePracticesQuery: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: mocks.usePracticesQuery,
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    supabase: {},
  }),
}));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

// 子の重量コンポーネントはこのテストの関心事(usePracticesQueryの呼び出し引数)ではないため
// 軽量スタブに差し替える。
vi.mock("../../../app/[locale]/(authenticated)/practice/_components/PracticeLogCard", () => ({
  default: () => <div data-testid="practice-log-card-stub" />,
}));
vi.mock("../../../app/[locale]/(authenticated)/practice/_components/PracticeDetailModal", () => ({
  default: () => null,
}));
vi.mock("@/components/forms/PracticeTabModal", () => ({
  default: () => null,
}));
vi.mock("@/components/history/ListToolbar", () => ({
  default: () => <div data-testid="list-toolbar-stub" />,
}));
vi.mock("@/components/history/SortBottomSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/history/FilterBottomSheet", () => ({
  default: () => null,
}));

import PracticeClient from "../../../app/[locale]/(authenticated)/practice/_client/PracticeClient";

describe("PracticeClient — usePracticesQuery pageSize 整合性 (D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePracticesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("[V-D1-01] usePracticesQuery が pageSize>=1000 で呼ばれる (大会側 pageSize:1000 と同水準)", () => {
    render(<PracticeClient styles={[]} tags={[]} />);

    // usePracticeStore への render 中の setAvailableTags 呼び出し (既存実装) により
    // 複数回レンダーされ得るため、呼び出し回数そのものは固定しない。
    // 直近(最終)の呼び出し引数で検証する。
    expect(mocks.usePracticesQuery).toHaveBeenCalled();
    const lastCall = mocks.usePracticesQuery.mock.calls.at(-1)!;
    const options = lastCall[1];
    expect(options?.pageSize ?? 20).toBeGreaterThanOrEqual(1000);
  });

  it("[V-D1-02] 退行防止: pageSize が既定値20のまま(未指定)で呼ばれていない", () => {
    render(<PracticeClient styles={[]} tags={[]} />);

    const lastCall = mocks.usePracticesQuery.mock.calls.at(-1)!;
    const options = lastCall[1];
    expect(options?.pageSize).not.toBe(20);
    expect(options?.pageSize).toBeDefined();
  });

  it(
    "[V-D1-04] regression (E2E 相当メモ): mutation 後の refetch でも一覧が20件に縮まないことは" +
      " このユニットテストの範囲外。ブラウザ実機/E2E で「練習を1件保存 → 21件以上表示されたままか」を" +
      " 必ず確認すること (usePracticesQuery 自体は shared/__tests__/hooks/queries/practices.test.ts で" +
      " pageSize が正しく offset/limit に反映されることを検証済みのため、ここでは呼び出し引数のみを保証する)",
    () => {
      expect(true).toBe(true);
    },
  );
});
