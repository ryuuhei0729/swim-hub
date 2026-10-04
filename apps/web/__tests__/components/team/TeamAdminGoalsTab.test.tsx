/**
 * 管理者「目標」タブ (web) — Sprint Contract v1 S8
 * 観点: 未選択 / ローディング / エラー(再試行・生文言非表示) / 空 / 選択肢が空 / 一覧、
 *       メンバー切替で前メンバーの目標が DOM に無い、非泳者除外、閲覧のみ(書き込み0回)、
 *       「—」のとき「0%」が出ない、大会NULLに水路ラベルが出ない、注記、振り返りの語が出ない。
 * Supabase は rpc / from を呼び出し記録つきスパイにして、書き込み系が呼ばれないことを実証する。
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamMemberGoals from "@/components/team/member-goals/TeamMemberGoals";
import type { TeamMemberGoal } from "@apps/shared/types/teamMemberGoals";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  members: [] as unknown[],
  membersState: { loading: false, error: null as string | null },
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: { rpc: h.rpc, from: h.from } }),
}));
vi.mock("@/components/team/member-management/hooks/useMembers", () => ({
  useMembers: () => ({
    members: h.members,
    loading: h.membersState.loading,
    error: h.membersState.error,
    loadMembers: vi.fn(),
  }),
}));

const TEAM = "team-1";
const member = (id: string, name: string, isSwimmer?: boolean) => ({
  id: `m-${id}`, user_id: id, role: "user", status: "approved", is_active: true,
  joined_at: "2026-01-01", is_swimmer: isSwimmer, users: { id, name },
});

function goal(over: Partial<TeamMemberGoal> & { id: string }): TeamMemberGoal {
  return {
    style_id: 1, target_time: 60, start_time: 70, status: "active", achieved_at: null,
    created_at: "2026-01-01T00:00:00Z", competition_id: "c1", competition_title: "県大会",
    competition_date: "2099-05-01", competition_pool_type: 1, current_best_time: 65, milestones: [],
    ...over,
  };
}

function tree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        <TeamMemberGoals teamId={TEAM} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { qc, ...render(tree(qc)) };
}

const T = messages.teamMemberGoals;
const select = () => screen.getByLabelText(T.memberLabel);

beforeEach(() => {
  h.rpc.mockReset();
  h.from.mockReset();
  h.from.mockImplementation(() => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq"]) b[m] = vi.fn(() => b);
    b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
    return b;
  });
  h.members = [member("A", "Alice"), member("B", "Bob"), member("N", "NonSwimmer", false)];
  h.membersState = { loading: false, error: null };
});
afterEach(() => vi.restoreAllMocks());

describe("選択肢", () => {
  it("非泳者(is_swimmer=false)は選択肢に無い。泳者と is_swimmer 未設定は出る", () => {
    h.members = [member("A", "Alice"), member("N", "NonSwimmer", false), member("U", "Undef", undefined)];
    renderTab();
    const names = within(select()).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual([T.memberPlaceholder, "Alice", "Undef"]);
    expect(names).not.toContain("NonSwimmer");
  });

  it("泳者が0人(非泳者のみ)なら「選択できるメンバーがいません」で select を出さない", () => {
    h.members = [member("N", "NonSwimmer", false)];
    renderTab();
    expect(screen.getByText(T.noSelectableMembers)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("メンバー一覧の読み込み中はスケルトン", () => {
    h.membersState = { loading: true, error: null };
    renderTab();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("メンバー一覧の取得エラーは alert", () => {
    h.membersState = { loading: false, error: "members failed" };
    renderTab();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("状態", () => {
  it("未選択: ヒントが出て rpc は呼ばれない。注記が出る", () => {
    renderTab();
    expect(screen.getByText(T.selectMemberHint)).toBeInTheDocument();
    expect(screen.getByText(T.snapshotNote)).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("選択すると rpc(get_team_member_goals, {p_team_id, p_member_id}) が呼ばれる", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc.mock.calls).toEqual([["get_team_member_goals", { p_team_id: TEAM, p_member_id: "A" }]]);
  });

  it("ローディング: 取得中は status スケルトン、まだ目標も空文言も出ない", async () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    renderTab();
    await userEvent.selectOptions(select(), "A");
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(T.empty)).toBeNull();
  });

  it("空: 目標0件なら空文言", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    expect(await screen.findByText(T.empty, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("エラー: 生のエラー文を出さず汎用文言 + 再試行で再取得", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "RAW_DB_SECRET not an approved active admin", code: "P0001" } });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("RAW_DB_SECRET");
    expect(alert.textContent).toContain(T.loadError);

    h.rpc.mockResolvedValueOnce({ data: [goal({ id: "g1", competition_title: "回復後の大会" })], error: null });
    await userEvent.click(screen.getByRole("button", { name: T.retry }));
    expect(await screen.findByText("回復後の大会")).toBeInTheDocument();
  });
});

describe("メンバー切替", () => {
  it("切替直後(新メンバー取得中)に旧メンバーの目標名が DOM に無い", async () => {
    h.rpc.mockImplementation((_n: string, a: { p_member_id: string }) =>
      a.p_member_id === "A"
        ? Promise.resolve({ data: [goal({ id: "gA", competition_title: "ALICE_MEET" })], error: null })
        : new Promise(() => {}),
    );
    renderTab();
    await userEvent.selectOptions(select(), "A");
    expect(await screen.findByText("ALICE_MEET")).toBeInTheDocument();

    await userEvent.selectOptions(select(), "B");
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("ALICE_MEET")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("A→B→A でも各メンバーのデータだけが表示される", async () => {
    h.rpc.mockImplementation((_n: string, a: { p_member_id: string }) =>
      Promise.resolve({
        data: [goal({ id: `g-${a.p_member_id}`, competition_title: `MEET_${a.p_member_id}` })],
        error: null,
      }),
    );
    renderTab();
    await userEvent.selectOptions(select(), "A");
    expect(await screen.findByText("MEET_A")).toBeInTheDocument();
    await userEvent.selectOptions(select(), "B");
    expect(await screen.findByText("MEET_B")).toBeInTheDocument();
    expect(screen.queryByText("MEET_A")).toBeNull();
  });
});

describe("表示内容", () => {
  async function showGoals(goals: TeamMemberGoal[]) {
    h.rpc.mockResolvedValue({ data: goals, error: null });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    await screen.findByRole("heading", { level: 2, name: T.title });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  }

  it("達成率: start=70 target=60 best=65 は 50% で progressbar の値も 50", async () => {
    await showGoals([goal({ id: "g1" })]);
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("大会NULL: 達成率は「—」で「0%」は出ない。水路ラベル(短水路/長水路)も大会日も出ない", async () => {
    await showGoals([
      goal({
        id: "gN", competition_id: null, competition_title: null, competition_date: null,
        competition_pool_type: null, current_best_time: null,
      }),
    ]);
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(new RegExp(messages.common.poolTypeShort))).toBeNull();
    expect(screen.queryByText(new RegExp(messages.common.poolTypeLong))).toBeNull();
    expect(screen.getByRole("article").textContent).toContain(messages.goals.list.competitionInfoUnavailable);
  });

  it("大会あり・ベストなしは 0% (「—」ではない)", async () => {
    await showGoals([goal({ id: "g0", current_best_time: null })]);
    expect(await screen.findByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("水路ラベル: 短水路(0)と長水路(1)が正しく出る", async () => {
    await showGoals([
      goal({ id: "gs", competition_title: "SHORT", competition_pool_type: 0, competition_date: "2099-01-01" }),
      goal({ id: "gl", competition_title: "LONG", competition_pool_type: 1, competition_date: "2099-02-01", style_id: 2 }),
    ]);
    const short = (await screen.findByText("SHORT")).closest("article")!;
    const long = screen.getByText("LONG").closest("article")!;
    expect(short.textContent).toContain(messages.common.poolTypeShort);
    expect(long.textContent).toContain(messages.common.poolTypeLong);
  });

  it("セクション順: 今後 → 過去 → 大会情報なし。過去・達成済みの目標も出る", async () => {
    await showGoals([
      goal({ id: "gn", competition_id: null, competition_title: null, competition_date: null, competition_pool_type: null, current_best_time: null }),
      goal({ id: "gp", competition_title: "PAST", competition_date: "2020-01-01", status: "achieved", achieved_at: "2020-01-02T00:00:00Z" }),
      goal({ id: "gf", competition_title: "FUTURE", competition_date: "2099-01-01" }),
    ]);
    await screen.findByText("FUTURE");
    const heads = screen.getAllByRole("heading", { level: 3 }).map((e) => e.textContent);
    const idx = (s: string) => heads.indexOf(s);
    for (const k of ["upcoming", "past", "noCompetition"] as const) {
      expect(idx(T.section[k]), `${k} の見出しが無い`).toBeGreaterThanOrEqual(0);
    }
    expect(idx(T.section.upcoming)).toBeLessThan(idx(T.section.past));
    expect(idx(T.section.past)).toBeLessThan(idx(T.section.noCompetition));
    expect(screen.getByText("PAST")).toBeInTheDocument();
    expect(screen.getByText(T.status.goal.achieved)).toBeInTheDocument();
  });

  it("マイルストーン: タイトル・状態・期限が出て、編集/削除/振り返りの操作と文言が無い", async () => {
    await showGoals([
      goal({
        id: "gm",
        milestones: [
          { id: "m1", title: "MS_TITLE", type: "time", params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
            deadline: "2099-03-01", status: "in_progress", achieved_at: null },
        ],
      }),
    ]);
    expect(await screen.findByText("MS_TITLE")).toBeInTheDocument();
    const li = screen.getByText("MS_TITLE").closest("li")!;
    expect(li.textContent).toContain(T.status.milestone.in_progress);
    expect(screen.getByText(new RegExp(messages.goals.milestone.deadlineLabel))).toBeInTheDocument();
    // 閲覧のみ: ボタンは「再試行」以外存在しない (今は一覧表示中なのでボタン0)
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/振り返り|reflection|削除|編集/);
  });

  it("書き込み系: rpc は get_team_member_goals のみ、from() は styles 読み取りの select だけで insert/update/delete/upsert を一切呼ばない", async () => {
    const writes = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() };
    h.from.mockImplementation(() => {
      const b: Record<string, unknown> = { ...writes };
      for (const m of ["select", "order", "eq"]) b[m] = vi.fn(() => b);
      b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return b;
    });
    await showGoals([goal({ id: "g1", milestones: [] })]);
    await screen.findByText("50%");
    for (const spy of Object.values(writes)) expect(spy).not.toHaveBeenCalled();
    expect(new Set(h.rpc.mock.calls.map((c) => c[0]))).toEqual(new Set(["get_team_member_goals"]));
  });
});

describe("付録B: W1/W4", () => {
  it("W4: 選択中メンバーが候補から消えたら未選択に戻る (旧メンバーの目標を出し続けない)", async () => {
    h.rpc.mockResolvedValue({ data: [goal({ id: "gA", competition_title: "ALICE_MEET" })], error: null });
    const view = renderTab();
    await userEvent.selectOptions(select(), "A");
    expect(await screen.findByText("ALICE_MEET")).toBeInTheDocument();

    h.members = [member("B", "Bob")]; // Alice が候補から消えた
    view.rerender(tree(view.qc)); // 同じ QueryClient を使い回す (キャッシュに Alice のデータが残っていても出ないこと)
    await waitFor(() => expect(screen.queryByText("ALICE_MEET")).toBeNull());
    expect(screen.getByText(T.selectMemberHint)).toBeInTheDocument();
  });

  it("W1: 達成日は status が achieved のときだけ出る (目標・マイルストーンとも)", async () => {
    h.rpc.mockResolvedValue({
      data: [
        goal({
          id: "g1", status: "active", achieved_at: "2026-02-03T00:00:00Z",
          milestones: [
            { id: "m1", title: "MS_ACTIVE", type: "time", params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
              deadline: null, status: "in_progress", achieved_at: "2026-02-04T00:00:00Z" },
          ],
        }),
      ],
      error: null,
    });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    await screen.findByText("MS_ACTIVE");
    expect(document.body.textContent).not.toContain(messages.goals.milestone.achievedDateLabel);
  });

  it("W1: achieved の目標・マイルストーンには達成日が出る", async () => {
    h.rpc.mockResolvedValue({
      data: [
        goal({
          id: "g1", status: "achieved", achieved_at: "2026-02-03T00:00:00Z",
          milestones: [
            { id: "m1", title: "MS_DONE", type: "time", params: { style: "Fr", distance: 50, target_time: 30.5 } as never,
              deadline: null, status: "achieved", achieved_at: "2026-02-04T00:00:00Z" },
          ],
        }),
      ],
      error: null,
    });
    renderTab();
    await userEvent.selectOptions(select(), "A");
    await screen.findByText("MS_DONE");
    const n = document.body.textContent!.split(messages.goals.milestone.achievedDateLabel).length - 1;
    expect(n).toBe(2);
  });
});

