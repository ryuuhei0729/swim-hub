/**
 * apps/web/__tests__/goals/goalsUiRegressions.test.tsx
 *
 * 目標管理 (goals) の Sprint Contract 文面には明示されていないが、実装時に
 * 踏みがちな回帰ポイントを固定する。
 *
 * 注意: 種目選択は `<select>` ではなく、練習・大会入力と同じ共通 `SelectChips`
 * (apps/web/components/forms/practice-log/components/SelectChips.tsx) を使う
 * チップ UI になっている。そのため本ファイルでは「chip (button) の描画順序」を
 * data-testid ベースで検証する。
 *
 * [V-UI-CONST-01] goals/_components/constants.ts の SWIM_STYLES 順序バグ
 *   goals 用の SWIM_STYLES (goals/_components/constants.ts) は
 *   apps/shared/types/common.ts の canonical な SWIM_STYLES (["Fr", "Br", "Ba", "Fly", "IM"])
 *   から導出しているはずだが、独自に ["Fr", "Ba", "Br", "Fly", "IM"] のように
 *   Ba/Br の順序を取り違えて再定義してしまう回帰がありうる。値の集合一致ではなく
 *   **順序も含めて** canonical と一致することを固定する。
 *
 * [V-UI-NULLGUARD-01] goal.competition が null のときに例外を投げない
 *   大会削除・チーム脱退により goal.competition が null になりうる
 *   (competition_id 自体は nullable)。非 null 前提でアクセスするとクラッシュしうる
 *   箇所 (要 null ガード): GoalDetail.tsx / GoalSetCalculatorModal.tsx /
 *   GoalReflectionModal.tsx
 *
 * [V-UI-NULLCOMP-EDIT] GoalList.tsx は `goal.competition?.title` でクラッシュしない。
 *   `useGoalsQuery` (apps/shared/hooks/queries/goals.ts の select) が対象大会を
 *   見つけられない場合 `competition: null` を返し (型も `| null`)、GoalList/GoalDetail
 *   はこれを `goal.competition === null` で判定して「大会情報なし」表示・編集ボタン
 *   非表示を行う。select が返す値と GoalList 側の判定基準が噛み合っていないと
 *   (例: 片方が undefined を返す) この分岐が発火しなくなるため、実データ形
 *   (`null`) で検証する。`useGoalsQuery` の select ロジック自体を経由する統合テストは
 *   `goalListUseGoalsQueryIntegration.test.tsx` に分離した (往復での噛み合わせ崩れを
 *   継続的に検出するため)。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWIM_STYLES as CANONICAL_SWIM_STYLES } from "@apps/shared/types/common";
import { SWIM_STYLES as GOALS_SWIM_STYLES } from "../../app/[locale]/(authenticated)/goals/_components/constants";
import type { GoalWithMilestones, Style } from "@apps/shared/types";

// ---------------------------------------------------------------------------
// 共通モック (next-intl / @/contexts / GoalAPI / 子コンポーネント)
// 文言の翻訳結果自体は検証対象ではないため passthrough (key をそのまま返す) にする。
// ---------------------------------------------------------------------------
vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) =>
      ((key: string, values?: Record<string, unknown>) => {
        const full = namespace ? `${namespace}.${key}` : key;
        return values ? `${full}:${JSON.stringify(values)}` : full;
      }) as unknown as ReturnType<typeof original.useTranslations>,
  };
});

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, subscription: null }),
}));

// GoalReflectionModal / ReflectionModal が使う next-intl の Link (createNavigation)
// は NextIntlClientProvider を要求するため、素の <a> スタブに差し替える。
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, onClick, className }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserProfileQuery: () => ({ data: null, isLoading: false }),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    // competition が null (水路不明) の目標は達成率が計算不能 (null) を返す。
    // 本ファイルの [V-UI-NULLGUARD-01]/[V-UI-NULLCOMP-EDIT] は competition null の
    // goal しか扱わないため、実際の本番挙動 (null) に揃える (0 にすると ProgressBar
    // 非表示の検証ができない)。
    calculateGoalProgress: vi.fn().mockResolvedValue(null),
    updateGoal: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock(
  "../../app/[locale]/(authenticated)/goals/_components/MilestoneList",
  () => ({ default: () => <div data-testid="milestone-list-stub" /> }),
);
vi.mock(
  "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal",
  () => ({ default: () => null }),
);

import GoalDetail from "../../app/[locale]/(authenticated)/goals/_components/GoalDetail";
import GoalSetCalculatorModal from "../../app/[locale]/(authenticated)/goals/_components/GoalSetCalculatorModal";
import GoalReflectionModal from "../../app/[locale]/(authenticated)/goals/_components/GoalReflectionModal";
import GoalList from "../../app/[locale]/(authenticated)/goals/_components/GoalList";
import StyleSelector from "../../app/[locale]/(authenticated)/goals/_components/shared/StyleSelector";

const baseStyle: Style = { id: 1, name_jp: "自由形", name: "Freestyle", style: "Fr", distance: 100 };

function createGoalWithNullCompetition(overrides: Partial<GoalWithMilestones> = {}): GoalWithMilestones {
  return {
    id: "goal-1",
    user_id: "user-1",
    competition_id: null,
    style_id: 1,
    target_time: 60,
    start_time: 70,
    status: "active",
    achieved_at: null,
    reflection_note: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    competition: null,
    style: baseStyle,
    milestones: [],
    ...overrides,
  };
}

describe("[V-UI-CONST-01] constants.ts SWIM_STYLES は canonical から導出される", () => {
  it("goals/_components/constants.ts の SWIM_STYLES が apps/shared/types/common.ts の SWIM_STYLES と*順序も含めて*完全一致する", () => {
    const goalsOrder = GOALS_SWIM_STYLES.map((s) => s.value);
    expect(goalsOrder).toEqual([...CANONICAL_SWIM_STYLES]);
    // 回帰防止のため具体値でも固定する (canonical 自体が将来変わっても意図的な変更として気づけるように)
    expect(goalsOrder).toEqual(["Fr", "Br", "Ba", "Fly", "IM"]);
  });

  it("StyleSelector (マイルストーン種目チップ) が描画するチップの順序が [Fr,Br,Ba,Fly,IM] の順である (現状は Ba/Br が入れ替わっている回帰を防ぐ)", () => {
    render(<StyleSelector value="Fr" onChange={() => {}} />);

    const chipRow = screen.getByTestId("chiprow-goal-milestone-style");
    const buttons = Array.from(chipRow.querySelectorAll("button"));
    const testIds = buttons.map((b) => b.getAttribute("data-testid"));

    expect(testIds).toEqual([
      "goal-milestone-style-Fr",
      "goal-milestone-style-Br",
      "goal-milestone-style-Ba",
      "goal-milestone-style-Fly",
      "goal-milestone-style-IM",
    ]);
  });
});

describe("[V-UI-NULLGUARD-01] goal.competition が null でも例外を投げない", () => {
  it("GoalDetail に competition: null を含む goal を渡してもレンダリングが例外を投げず、大会名/日付は所定のフォールバック文言で表示される", async () => {
    const goal = createGoalWithNullCompetition();

    let container!: HTMLElement;
    expect(() => {
      ({ container } = render(
        <GoalDetail
          goal={goal}
          styles={[baseStyle]}
          onUpdate={async () => {}}
          onDelete={async () => {}}
        />,
      ));
    }).not.toThrow();

    // goal.competition が null のときの表示文言は全画面で
    // list.competitionInfoUnavailable に統一されている (competitionFallback は
    // competition はあるが title が空のときだけ使う別のキー)。
    // GoalDetail は見出し (大会名相当。単独ノードとして一致) と日付欄
    // (「種目名 | goals.list.competitionInfoUnavailable」の複合テキストの一部として
    // 出現するため getByText の完全一致では拾えない。textContent の出現回数で数える)
    // の両方にこのキーを表示する。
    await screen.findByText("goals.list.competitionInfoUnavailable");
    const occurrences = (
      container.textContent?.match(/goals\.list\.competitionInfoUnavailable/g) ?? []
    ).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // 達成率が計算不能 (null) のときは目標本体の ProgressBar 自体を
    // 描画しない (0% バーが出ると「達成率0%」と誤解されるため)。「未設定」文言のみを表示する。
    // GoalDetail は「達成率」と「マイルストーン達成率」の2本の ProgressBar を持つため、
    // 本体側が非表示になれば描画本数は1本 (マイルストーン側のみ) に減ることで確認する
    // (マイルストーン側は goal.milestones から独立に計算されるため null-guard の対象外)。
    expect(screen.getByText("goals.detail.notSet")).toBeInTheDocument();
    expect(container.querySelectorAll(".bg-blue-600.h-2")).toHaveLength(1);
  });

  it("GoalSetCalculatorModal は goal.competition が null のとき計算結果に「大会情報なし」フォールバックを表示し、TypeError で画面全体が落ちない", () => {
    const goal = createGoalWithNullCompetition();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    expect(() =>
      render(
        <GoalSetCalculatorModal
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          goal={goal}
          style={baseStyle}
        />,
      ),
    ).not.toThrow();

    // pool_type ラベル欄・計算結果欄の両方が "list.competitionInfoUnavailable" にフォールバックする
    const unavailableNodes = screen.getAllByText("goals.list.competitionInfoUnavailable");
    expect(unavailableNodes.length).toBeGreaterThanOrEqual(2);
  });

  it("GoalReflectionModal (期限切れ振り返り) は goal.competition が null でも「達成した！」「達成できなかった」の操作自体は成立する", () => {
    const goal = createGoalWithNullCompetition();

    expect(() =>
      render(
        <GoalReflectionModal
          isOpen={true}
          onClose={() => {}}
          goal={goal}
          onSave={async () => {}}
        />,
      ),
    ).not.toThrow();

    // 達成/未達成の選択肢ボタン自体は competition の有無に関わらず描画される
    expect(screen.getByText("goals.goalReflection.achievedButton")).toBeInTheDocument();
    expect(screen.getByText("goals.goalReflection.notAchievedButton")).toBeInTheDocument();
    // 大会情報表示部分は goalReflection.competitionFallback ではなく
    // list.competitionInfoUnavailable に統一されている。
    expect(screen.getByText("goals.list.competitionInfoUnavailable")).toBeInTheDocument();
  });

  it("[退行防止] GoalList.tsx は goal.competition (存在しない場合は useGoalsQuery が null を返す) への直アクセスで例外を投げない", async () => {
    // 実際に useGoalsQuery の select が返す実データ形 (competition: null) で
    // GoalList を render し、クラッシュしないことを直接確認する。
    const goalWithNullCompetition = {
      id: "goal-null-competition",
      user_id: "user-1",
      competition_id: "comp-deleted",
      style_id: 1,
      target_time: 60,
      start_time: 70,
      status: "active" as const,
      achieved_at: null,
      reflection_note: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      // useGoalsQuery の select (apps/shared/hooks/queries/goals.ts:66) が
      // 該当する大会を見つけられなかった場合に実際に返す形 (null)。
      competition: null,
      style: { name_jp: "自由形" },
    };

    expect(() =>
      render(
        <GoalList
          goals={[goalWithNullCompetition]}
          selectedGoalId={null}
          onSelectGoal={() => {}}
          onDeleteGoal={async () => {}}
          onEditGoal={() => {}}
        />,
      ),
    ).not.toThrow();

    // GoalList 内部の calculateGoalProgress (非同期) が完了して state 更新が
    // 落ち着くまで待つ (act() 警告防止。他のテストと同じ settle パターン)。
    await screen.findByText("goals.list.competitionInfoUnavailable");
  });

  /**
   * [V-UI-NULLCOMP-INTEGRATION] `useGoalsQuery` の select が返す `competition: null` と
   * GoalList (`=== null` 判定) が噛み合っていることの確認。往復での噛み合わせ自体は
   * `goalListUseGoalsQueryIntegration.test.tsx` で別途固定する。
   */
  it("useGoalsQuery が返す競技会未解決の goal (competition: null) で、編集ボタンが無く『大会情報なし』文言が表示される", async () => {
    const goalWithNullCompetition = {
      id: "goal-null-competition-2",
      user_id: "user-1",
      competition_id: "comp-deleted",
      style_id: 1,
      target_time: 60,
      start_time: 70,
      status: "active" as const,
      achieved_at: null,
      reflection_note: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      competition: null,
      style: { name_jp: "自由形" },
    };

    render(
      <GoalList
        goals={[goalWithNullCompetition]}
        selectedGoalId={null}
        onSelectGoal={() => {}}
        onDeleteGoal={async () => {}}
        onEditGoal={() => {}}
      />,
    );

    // GoalAPI.calculateGoalProgress (モック) の非同期解決を待って act 警告を避ける
    await screen.findByText("自由形");
    expect(screen.queryByLabelText("goals.list.edit")).not.toBeInTheDocument();
    expect(screen.getByText("goals.list.editUnavailableReason")).toBeInTheDocument();
    expect(screen.getByText("goals.list.competitionInfoUnavailable")).toBeInTheDocument();
  });
});

describe("[V-UI-NULLCOMP-EDIT] goal.competition が null の目標は編集不可・削除は可能", () => {
  it("competition が null の目標カードには編集ボタンが無く、削除ボタンはあり、理由文言 (editUnavailableReason) が表示される", async () => {
    const nullGoal = createGoalWithNullCompetition({ id: "goal-null" });

    const { container } = render(
      <GoalList
        goals={[nullGoal]}
        selectedGoalId={null}
        onSelectGoal={() => {}}
        onDeleteGoal={async () => {}}
        onEditGoal={() => {}}
      />,
    );

    // GoalAPI.calculateGoalProgress (モック) の非同期解決を待って act 警告を避ける
    await screen.findByText("goals.list.editUnavailableReason");
    expect(screen.queryByLabelText("goals.list.edit")).not.toBeInTheDocument();
    expect(screen.getByLabelText("goals.list.delete")).toBeInTheDocument();
    // 達成率が計算不能 (null) のときは ProgressBar 自体を描画しない
    expect(screen.getByText("goals.detail.notSet")).toBeInTheDocument();
    expect(container.querySelector(".bg-blue-600.h-2")).toBeNull();
  });

  it("[非退行] competition がある目標カードには従来どおり編集ボタンが表示される", async () => {
    const normalGoal = createGoalWithNullCompetition({
      id: "goal-with-competition",
      competition: { id: "comp-1", title: "テスト大会", date: "2026-01-01", pool_type: 1 } as never,
    });

    render(
      <GoalList
        goals={[normalGoal]}
        selectedGoalId={null}
        onSelectGoal={() => {}}
        onDeleteGoal={async () => {}}
        onEditGoal={() => {}}
      />,
    );

    await screen.findByLabelText("goals.list.edit");
    expect(screen.queryByText("goals.list.editUnavailableReason")).not.toBeInTheDocument();
  });
});
