/**
 * TeamMemberGoalsTab (mobile) — Sprint Contract v1 S8 / v2 (初期タイム全廃) SC6 / SC7 / SC7b / D1 / D2
 * 状態 / 切替で旧データが無い / 非泳者除外 / 候補は approved & is_active のみ /
 * 大会NULLに水路ラベルが出ない / 閲覧のみ (書き込み0回)。
 * v2: 達成率はマイルストーン達成率だけ (0件は「未設定」で % もバーも出さない。大会NULLでも「—」にしない)。
 *     目標タイムの横に Best 差 (目標 − current_best_time。null なら出さない)。初期タイムは出さない。
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamMemberGoalsTab } from "../TeamMemberGoalsTab";
import { TeamMemberGoalCard } from "../TeamMemberGoalCard";
import ja from "../../../../../shared/messages/ja.json";
import type { TeamMemberGoal } from "@apps/shared/types/teamMemberGoals";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  // computeMilestoneRatio の差し替え口。既定は本物をそのまま呼ぶ (配線の検証だけセンチネルを返す)
  ratio: vi.fn(),
  actualRatio: null as null | ((milestones: ReadonlyArray<{ status: string }>) => number | null),
}));
vi.mock("@/components/goals/GoalProgressBar", () => ({
  GoalProgressBar: ({ progress }: { progress: number }) => <div data-testid="goal-progress-bar" data-progress={String(progress)} />,
}));
vi.mock("@apps/shared/utils/milestoneRatio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apps/shared/utils/milestoneRatio")>();
  h.actualRatio = actual.computeMilestoneRatio;
  h.ratio.mockImplementation(actual.computeMilestoneRatio);
  return { ...actual, computeMilestoneRatio: h.ratio };
});
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { rpc: h.rpc, from: h.from }, user: { id: "admin" } }),
}));

const T = ja.teamMemberGoals;
const TEAM = "team-1";

const mem = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({
    id: `m-${id}`, user_id: id, role: "user", status: "approved", is_active: true,
    is_swimmer: true, users: { id, name }, ...over,
  }) as never;

function goal(over: Partial<TeamMemberGoal> & { id: string }): TeamMemberGoal {
  return {
    style_id: 1, target_time: 60, status: "active", achieved_at: null,
    created_at: "2026-01-01T00:00:00Z", competition_id: "c1", competition_title: "県大会",
    competition_date: "2099-05-01", competition_pool_type: 1, current_best_time: 65, milestones: [],
    ...over,
  };
}

const MEMBERS = [mem("A", "Alice"), mem("B", "Bob")];

function treeOf(qc: QueryClient, members: unknown[]) {
  return (
    <QueryClientProvider client={qc}>
      <TeamMemberGoalsTab teamId={TEAM} members={members as never} />
    </QueryClientProvider>
  );
}

function renderTab(members: unknown[] = MEMBERS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { qc, ...render(treeOf(qc, members)) };
}

beforeEach(() => {
  h.ratio.mockReset();
  if (h.actualRatio) h.ratio.mockImplementation(h.actualRatio);
  h.rpc.mockReset();
  h.from.mockReset();
  h.from.mockImplementation(() => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq"]) b[m] = vi.fn(() => b);
    b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
    return b;
  });
});

describe("メンバー選択", () => {
  it("非泳者・未承認・非アクティブ・is_active=null は候補に出ない", () => {
    renderTab([
      mem("A", "Alice"),
      mem("N", "NonSwimmer", { is_swimmer: false }),
      mem("P", "Pending", { status: "pending" }),
      mem("I", "Inactive", { is_active: false }),
      mem("U", "NullActive", { is_active: null }),
    ]);
    expect(screen.getByText("Alice")).toBeTruthy();
    for (const n of ["NonSwimmer", "Pending", "Inactive", "NullActive"]) expect(screen.queryByText(n)).toBeNull();
  });

  it("候補が0人なら「選択できるメンバーがいません」", () => {
    renderTab([mem("N", "NonSwimmer", { is_swimmer: false })]);
    expect(screen.getByText(T.noSelectableMembers)).toBeTruthy();
  });

  it("未選択ではヒントが出て rpc は呼ばれない", () => {
    renderTab();
    expect(screen.getByText(T.selectMemberHint)).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("状態と切替", () => {
  it("選択すると rpc が {p_team_id, p_member_id} で呼ばれる", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls).toEqual([["get_team_member_goals", { p_team_id: TEAM, p_member_id: "A" }]]);
  });

  it("ローディング中はスピナー文言、空文言は出ない", async () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText(ja.common.loading)).toBeTruthy();
    expect(screen.queryByText(T.empty)).toBeNull();
  });

  it("空: 目標0件", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText(T.empty)).toBeTruthy();
  });

  it("エラー: 生文言は出さず汎用文言 + 再試行で復帰", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "RAW_DB_SECRET", code: "P0001" } });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText(T.loadError)).toBeTruthy();
    expect(screen.queryByText(/RAW_DB_SECRET/)).toBeNull();
    h.rpc.mockResolvedValueOnce({ data: [goal({ id: "g1", competition_title: "回復後" })], error: null });
    fireEvent.click(screen.getByText(T.retry));
    expect(await screen.findByText("回復後")).toBeTruthy();
  });

  it("切替直後(新メンバー取得中)に旧メンバーの目標名が無い", async () => {
    h.rpc.mockImplementation((_n: string, a: { p_member_id: string }) =>
      a.p_member_id === "A"
        ? Promise.resolve({ data: [goal({ id: "gA", competition_title: "ALICE_MEET" })], error: null })
        : new Promise(() => {}),
    );
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText("ALICE_MEET")).toBeTruthy();
    fireEvent.click(screen.getByText("Bob"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("ALICE_MEET")).toBeNull();
    expect(screen.getByText(ja.common.loading)).toBeTruthy();
  });
});

describe("表示内容", () => {
  async function show(goals: TeamMemberGoal[]) {
    h.rpc.mockResolvedValue({ data: goals, error: null });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => expect(screen.queryByText(ja.common.loading)).toBeNull());
  }

  const MS = (id: string, status: "achieved" | "in_progress" | "expired" | "not_started") => ({
    id, title: `MS_${id}`, type: "time" as const, params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
    deadline: null, status, achieved_at: status === "achieved" ? "2026-02-04T00:00:00Z" : null,
  });
  const text = () => document.body.textContent ?? "";
  const bars = () => Array.from(document.querySelectorAll('[data-testid="goal-progress-bar"]')) as HTMLElement[];
  // 初期タイムと「達成率を計算できません」の文言 (どちらも v2 で撤去。キー削除後も文字列で探す)
  const REMOVED_TEXTS = ["初期タイム", "大会情報がないため達成率を計算できません"];

  it("[SC7] 達成率はマイルストーン達成率: 2件中1件達成で 50% (ベストや目標タイムに依存しない)。注記が出る", async () => {
    await show([goal({ id: "g1", current_best_time: 59, milestones: [MS("a", "achieved"), MS("b", "in_progress")] })]);
    expect(await screen.findByText("50%")).toBeTruthy();
    expect(bars().map((b) => b.dataset.progress)).toEqual(["50"]);
    expect(screen.getByText(T.snapshotNote)).toBeTruthy();
  });

  it("[D8] 達成率の見出しは「マイルストーン達成率」(goals.detail.milestoneRatio) で、「達成率」単独の見出しは無い (0件でも同じ)", async () => {
    await show([
      goal({ id: "g1", competition_title: "HAS_MS", milestones: [MS("a", "achieved"), MS("b", "in_progress")] }),
      goal({ id: "g0", competition_title: "NO_MS", competition_date: "2099-06-01", milestones: [] }),
    ]);
    await screen.findByText("HAS_MS");
    expect(screen.getAllByText(ja.goals.detail.milestoneRatio)).toHaveLength(2);
    expect(screen.queryByText("達成率")).toBeNull();
  });

  it("[SC7] 全件達成は 100%、達成0件 (1件以上あり) は 0% (「未設定」ではない)", async () => {
    await show([
      goal({ id: "gA", competition_title: "ALL_DONE", milestones: [MS("a", "achieved"), MS("b", "achieved")] }),
      goal({ id: "gZ", competition_title: "NONE_DONE", competition_date: "2099-06-01", milestones: [MS("c", "expired")] }),
    ]);
    expect(await screen.findByText("100%")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(text()).not.toContain(ja.goals.detail.notSet);
  });

  it("[D2] マイルストーン0件: 「未設定」を出し、% もバーも出さない", async () => {
    await show([goal({ id: "g0", milestones: [] })]);
    expect(await screen.findByText(ja.goals.detail.notSet)).toBeTruthy();
    expect(text()).not.toMatch(/%/);
    expect(bars()).toHaveLength(0);
  });

  it("[SC7] 大会NULL: 水路ラベル・Best 差は出さないが、達成率はマイルストーンから出す (「—」にしない)", async () => {
    await show([
      goal({
        id: "gN", competition_id: null, competition_title: null, competition_date: null, competition_pool_type: null,
        current_best_time: null, milestones: [MS("a", "achieved"), MS("b", "in_progress")],
      }),
    ]);
    expect(await screen.findByText("50%")).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
    expect(text()).not.toContain(ja.common.poolTypeShort);
    expect(text()).not.toContain(ja.common.poolTypeLong);
    expect(text()).not.toMatch(/Best/);
  });

  it("[SC7b] 目標タイムの横に Best 差 (目標 1:00.00 − ベスト 65.00 = (Best-5.00)) を出す", async () => {
    await show([goal({ id: "g1", target_time: 60, current_best_time: 65 })]);
    const diff = await screen.findByText(/\(Best-5\.00\)/);
    const block = diff.parentElement as HTMLElement;
    expect(block.textContent).toContain("1:00.00");
    expect(block.textContent!.indexOf("1:00.00")).toBeLessThan(block.textContent!.indexOf("(Best-5.00)"));
    expect(block.textContent).not.toContain(ja.goals.detail.milestoneSection);
  });

  it.each([
    ["目標がベストより遅い (既に上回っている)", 60, 58.5, "(Best+1.50)"],
    ["目標とベストが同タイム", 60, 60, "(Best+0.00)"],
    ["浮動小数の端数を出さない", 23.79, 23.8, "(Best-0.01)"],
  ])("[SC7b] %s: %s − %s は %s", async (_label, target, best, expected) => {
    await show([goal({ id: "g1", target_time: target, current_best_time: best })]);
    expect(await screen.findByText(new RegExp(expected.replace(/[()+.]/g, "\\$&")))).toBeTruthy();
  });

  it("[SC7b] 大会あり・ベストなし (current_best_time=null): Best 差を出さない。達成率はマイルストーンで決まる", async () => {
    await show([goal({ id: "g0", current_best_time: null, milestones: [MS("a", "achieved")] })]);
    expect(await screen.findByText("100%")).toBeTruthy();
    expect(text()).not.toMatch(/Best/);
    expect(text()).toContain("1:00.00");
  });

  it("[SC6] 初期タイムと「達成率を計算できません」の文言を出さない (大会あり・大会NULL・マイルストーン0件のいずれでも)", async () => {
    await show([
      goal({ id: "g1", competition_title: "WITH_COMP" }),
      goal({ id: "gN", competition_id: null, competition_title: null, competition_date: null, competition_pool_type: null, current_best_time: null }),
    ]);
    await screen.findByText("WITH_COMP");
    for (const removed of REMOVED_TEXTS) expect(text()).not.toContain(removed);
  });

  it("水路ラベルは短水路(0)/長水路(1)で正しい", async () => {
    await show([
      goal({ id: "gs", competition_title: "SHORT", competition_pool_type: 0, competition_date: "2099-01-01" }),
      goal({ id: "gl", competition_title: "LONG", competition_pool_type: 1, competition_date: "2099-02-01", style_id: 2 }),
    ]);
    await screen.findByText("SHORT");
    expect(document.body.textContent).toContain(ja.common.poolTypeShort);
    expect(document.body.textContent).toContain(ja.common.poolTypeLong);
  });

  it("セクション順 今後→過去→大会情報なし。過去・達成済みも出る", async () => {
    await show([
      goal({ id: "gn", competition_id: null, competition_title: null, competition_date: null, competition_pool_type: null, current_best_time: null }),
      goal({ id: "gp", competition_title: "PAST", competition_date: "2020-01-01", status: "achieved", achieved_at: "2020-01-02T00:00:00Z" }),
      goal({ id: "gf", competition_title: "FUTURE", competition_date: "2099-01-01" }),
    ]);
    await screen.findByText("FUTURE");
    const text = document.body.textContent ?? "";
    for (const k of ["upcoming", "past", "noCompetition"] as const) {
      expect(text.indexOf(T.section[k]), `${k} の見出しが無い`).toBeGreaterThanOrEqual(0);
    }
    expect(text.indexOf(T.section.upcoming)).toBeLessThan(text.indexOf(T.section.past));
    expect(text.indexOf(T.section.past)).toBeLessThan(text.indexOf(T.section.noCompetition));
    expect(screen.getByText("PAST")).toBeTruthy();
  });

  it("マイルストーン: タイトル・期限が出て、振り返り/編集/削除の文言が無い", async () => {
    await show([
      goal({
        id: "gm",
        milestones: [{ id: "m1", title: "MS_TITLE", type: "time", params: { style: "Fr", distance: 50, target_time: 30.5 } as never, deadline: "2099-03-01", status: "in_progress", achieved_at: null }],
      }),
    ]);
    expect(await screen.findByText("MS_TITLE")).toBeTruthy();
    expect(document.body.textContent).toContain(ja.goals.milestone.deadlineLabel);
    expect(document.body.textContent).not.toMatch(/振り返り|reflection|削除|編集/);
  });

  it("書き込み系: rpc は get_team_member_goals のみ、insert/update/delete/upsert は0回", async () => {
    const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() };
    h.from.mockImplementation(() => {
      const b: Record<string, unknown> = { ...writes };
      for (const m of ["select", "order", "eq"]) b[m] = vi.fn(() => b);
      b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return b;
    });
    await show([goal({ id: "g1", competition_title: "WRITE_CHECK" })]);
    await screen.findByText("WRITE_CHECK");
    for (const spy of Object.values(writes)) expect(spy).not.toHaveBeenCalled();
    expect(new Set(h.rpc.mock.calls.map((c) => c[0]))).toEqual(new Set(["get_team_member_goals"]));
  });
});

describe("付録B: W1/W2", () => {
  const ms = (status: "in_progress" | "achieved") => ({
    id: "m1", title: "MS_X", type: "time" as const,
    params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
    deadline: null, status, achieved_at: "2026-02-04T00:00:00Z",
  });

  it("W1: 注記は選択後は常に表示 (ローディング中)", async () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText(ja.common.loading);
    expect(screen.getByText(T.snapshotNote)).toBeTruthy();
  });

  it("W1: 注記は空状態でも表示", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText(T.empty);
    expect(screen.getByText(T.snapshotNote)).toBeTruthy();
  });

  it("W1: 注記はエラー状態でも表示", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "x", code: "P0001" } });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText(T.loadError);
    expect(screen.getByText(T.snapshotNote)).toBeTruthy();
  });

  it("W1: 未選択では注記を出さない (選択後のみ)", () => {
    renderTab();
    expect(screen.queryByText(T.snapshotNote)).toBeNull();
  });

  it("W1: 達成日は status=achieved のときだけ (active 目標 + in_progress マイルストーンには出ない)", async () => {
    h.rpc.mockResolvedValue({
      data: [goal({ id: "g1", status: "active", achieved_at: "2026-02-03T00:00:00Z", milestones: [ms("in_progress")] })],
      error: null,
    });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText("MS_X");
    expect(document.body.textContent).not.toContain(ja.goals.milestone.achievedDateLabel);
  });

  it("W1: achieved の目標とマイルストーンには達成日が出る (2箇所)", async () => {
    h.rpc.mockResolvedValue({
      data: [goal({ id: "g1", status: "achieved", achieved_at: "2026-02-03T00:00:00Z", milestones: [ms("achieved")] })],
      error: null,
    });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText("MS_X");
    expect(document.body.textContent!.split(ja.goals.milestone.achievedDateLabel).length - 1).toBe(2);
  });

  it("W1: 大会ありの判定は competition_id (date が無くても大会タイトルを出す)", async () => {
    h.rpc.mockResolvedValue({
      data: [goal({ id: "g1", competition_id: "c9", competition_title: "ID_ONLY_MEET", competition_date: null })],
      error: null,
    });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText("ID_ONLY_MEET")).toBeTruthy();
  });

  it("W2: 選択中メンバー名が結果の上に固定表示される (チップとは別に、選択後は名前が2箇所)", async () => {
    h.rpc.mockResolvedValue({ data: [goal({ id: "g1", competition_title: "W2_MEET" })], error: null });
    renderTab();
    fireEvent.click(screen.getByText("Alice"));
    await screen.findByText("W2_MEET");
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Bob/).length).toBe(1); // 未選択の Bob はチップのみ
  });
});

describe("付録B: W4 相当 (選択中が候補から消えたら未選択に戻る)", () => {
  it("選択中の Alice が候補から消えると、Alice の目標は出ず未選択のヒントに戻る", async () => {
    h.rpc.mockResolvedValue({ data: [goal({ id: "gA", competition_title: "ALICE_MEET" })], error: null });
    const view = renderTab();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText("ALICE_MEET")).toBeTruthy();

    view.rerender(treeOf(view.qc, [mem("B", "Bob")])); // 同じ QueryClient (キャッシュに Alice が残る)
    await waitFor(() => expect(screen.queryByText("ALICE_MEET")).toBeNull());
    expect(screen.getByText(T.selectMemberHint)).toBeTruthy();
    expect(screen.queryByText(T.snapshotNote)).toBeNull();
  });
});

describe("[SC7 単一定義] TeamMemberGoalCard の達成率は computeMilestoneRatio の結果をそのまま出す", () => {
  const ms = (id: string, status: "achieved" | "in_progress") => ({
    id, title: `MS_${id}`, type: "time" as const, params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
    deadline: null, status, achieved_at: null,
  });
  const g = goal({ id: "g1", milestones: [ms("a", "achieved"), ms("b", "in_progress")] });

  it("センチネル 37 を返すと 37% を出し、目標のマイルストーンを渡している", () => {
    h.ratio.mockReturnValue(37);
    render(<TeamMemberGoalCard goal={g} styleName="100m 自由形" />);
    expect(screen.getByText("37%")).toBeTruthy();
    expect(screen.queryByText("50%")).toBeNull();
    expect(h.ratio).toHaveBeenCalledWith(g.milestones);
  });

  it("null を返すと「未設定」で % を出さない (マイルストーンが2件あっても関数の結果に従う)", () => {
    h.ratio.mockReturnValue(null);
    render(<TeamMemberGoalCard goal={g} styleName="100m 自由形" />);
    expect(screen.getByText(ja.goals.detail.notSet)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
  });
});
