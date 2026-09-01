/**
 * AdminMonthlyAttendance — 出欠4グループ化（未回答メンバー可視化）テスト（Phase B 本実装）
 *
 * C-2 対応: apps/mobile/components/teams/AdminMonthlyAttendance.tsx
 *   - 親(AdminMonthlyAttendance)で fetchTeamMembers を teamId 単位に1回だけ取得し、
 *     EventCard へ prop 配布する
 *   - EventCard 展開時、useAttendanceGrouping(attendanceQuery.data, teamMembers) で
 *     出席/欠席/その他/未回答の4グループに分類する
 *   参照実装: apps/web/components/admin-attendance/AttendanceGroupingDisplay.tsx
 *
 * 既存テスト apps/mobile/components/teams/__tests__/AdminMonthlyAttendance.test.tsx
 * ([S4-V-04]〜[S4-V-09]) とは別ファイルにして責務分離。
 *
 * Sprint Contract 検証観点:
 *   [V-15] EventCard 展開時、出席/欠席/その他/未回答の4グループが件数付きヘッダーで表示される
 *   [V-16] 未回答グループに「チーム全メンバー」-「回答済み(attendanceData)」の差分メンバーが
 *          正しく列挙される
 *   [V-17] 全員が回答済みのとき、未回答グループは0件（空表記）になる
 *   [V-18] チームメンバーが0人のとき、4グループとも0件表示になりクラッシュしない
 *   [V-19] fetchTeamMembers が失敗(reject)したとき、出席/欠席/その他グループは表示され続け、
 *          未回答セクションには控えめなエラー行が出る（PM裁定: 黙って0件表示は禁止）
 *   [V-20] 複数の EventCard を展開しても、fetchTeamMembers は teamId 単位で1回だけ呼ばれる
 *   [V-21] EventCard を折りたたんでから再度展開しても fetchTeamMembers は再呼び出しされない
 *   [V-34] (Reviewer W-3 対応の追加検証) 未回答セクションのエラー行に再試行ボタンが表示され、
 *          押下で fetchTeamMembers が再度呼ばれ、成功すれば未回答セクションが正常表示に
 *          復帰する。新規 i18n キーは追加されておらず、既存の common.retry を再利用する。
 *
 * 2026-07-28 Reviewer Warning 対応 (W-1〜W-4) 再検証メモ:
 *   - W-1 (titleStyle: object → StyleProp<TextStyle>): 型のみの変更のため本ファイルの
 *     既存アサーション(V-15 等の見出し色に依存しないテキスト検証)に影響なし。tsc で確認。
 *   - W-3 (loadTeamMembers を useCallback 化 + onRetryTeamMembers 追加): V-19/V-20/V-21 の
 *     既存アサーションが変更なしで通ることを再確認し、[V-34] を新規追加した。
 *
 * トートロジー防止メモ:
 *   4グループの件数表示・未回答差分ロジックの期待値は
 *   apps/shared/hooks/useAttendanceGrouping.ts（既存の共有フック、web と共通利用）と
 *   apps/web/components/admin-attendance/AttendanceGroupingDisplay.tsx の描画仕様、
 *   および PM 裁定(fetchTeamMembers 失敗時は「未回答」にエラー行を出し0件表示にしない)
 *   から導出したものであり、mobile 実装コードの diff を読んでコピーしたものではない。
 *   useAttendanceGrouping 自体は純粋関数として既存実装を信頼し、モック化せず実物を使う。
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  updateStatusMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined as unknown,
  },
  useUpdateAttendanceStatusMutation: vi.fn(),
  useAttendanceByPracticeQuery: vi.fn(),
  useAttendanceByCompetitionQuery: vi.fn(),
  fetchTeamMembers: vi.fn(),
  supabase: {} as Record<string, unknown>,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateAttendanceStatusMutation: mocks.useUpdateAttendanceStatusMutation,
  useAttendanceByPracticeQuery: mocks.useAttendanceByPracticeQuery,
  useAttendanceByCompetitionQuery: mocks.useAttendanceByCompetitionQuery,
}));

vi.mock("@apps/shared/utils/team", () => ({
  fetchTeamMembers: mocks.fetchTeamMembers,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@/hooks/useDateLocale", () => ({
  useDateLocale: vi.fn(() => undefined),
}));

import { AdminMonthlyAttendance } from "../AdminMonthlyAttendance";

// -----------------------------------------------------------------------
// フィクスチャ
// -----------------------------------------------------------------------

const makePracticeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-12-01",
  title: null,
  place: "メインプール",
  note: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_paths: [],
  attendance_status: null,
  type: "practice" as const,
  ...overrides,
});

const makeCompetitionEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  user_id: "user-1",
  team_id: "team-1",
  date: "2026-12-15",
  title: "春季大会",
  place: "競泳プール",
  note: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  pool_type: 1,
  attendance_status: "open" as const,
  type: "competition" as const,
  ...overrides,
});

const makeQueryBuilder = (data: unknown[], error: { message: string } | null = null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data, error }),
});

const setupMockSupabase = (practicesData: unknown[] = [], competitionsData: unknown[] = []) => {
  mocks.supabase = {
    from: vi.fn((table: string) => {
      if (table === "practices") return makeQueryBuilder(practicesData);
      if (table === "competitions") return makeQueryBuilder(competitionsData);
      return makeQueryBuilder([]);
    }),
  };
};

const makeMember = (id: string, name: string) => ({ id, name });

const makeAttendance = (userId: string, status: "present" | "absent" | "other", name: string) => ({
  id: `att-${userId}`,
  user_id: userId,
  status,
  user: { name },
});

const successQuery = (data: unknown[]) => ({
  isLoading: false,
  isError: false,
  isSuccess: true,
  data,
  fetchStatus: "idle",
});
const idleQuery = {
  isLoading: false,
  isError: false,
  isSuccess: false,
  data: undefined,
  fetchStatus: "idle",
};

/** イベントカードを展開する（chevron アイコンの親 button を押下） */
async function expandFirstEventCard() {
  await waitFor(() => {
    expect(screen.getAllByTestId("icon-chevron-down").length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByTestId("icon-chevron-down")[0]!.closest("button")!); // 直前の toBeGreaterThan(0) で存在は保証済み
}

describe("AdminMonthlyAttendance attendance grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateStatusMutation.mutateAsync = vi.fn().mockResolvedValue(undefined);
    mocks.updateStatusMutation.isPending = false;
    mocks.updateStatusMutation.variables = undefined;
    mocks.useUpdateAttendanceStatusMutation.mockReturnValue(mocks.updateStatusMutation);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(idleQuery);
    mocks.useAttendanceByCompetitionQuery.mockReturnValue(idleQuery);
    mocks.fetchTeamMembers.mockResolvedValue([]);
    setupMockSupabase();
  });

  it("[V-15] 展開時、出席/欠席/その他/未回答の4見出しが件数付きで表示される", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockResolvedValue([
      makeMember("u1", "田中"),
      makeMember("u2", "佐藤"),
      makeMember("u3", "鈴木"),
    ]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([makeAttendance("u1", "present", "田中")]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("出席 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("欠席 (0名)")).toBeTruthy();
    expect(screen.getByText("その他 (0名)")).toBeTruthy();
    expect(screen.getByText("未回答 (2名)")).toBeTruthy();
  });

  it("[V-16] 回答0件・メンバー3名のとき、未回答グループに3名とも列挙される", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockResolvedValue([
      makeMember("u1", "田中"),
      makeMember("u2", "佐藤"),
      makeMember("u3", "鈴木"),
    ]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(successQuery([]));

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("未回答 (3名)")).toBeTruthy();
    });
    expect(screen.getByText("田中")).toBeTruthy();
    expect(screen.getByText("佐藤")).toBeTruthy();
    expect(screen.getByText("鈴木")).toBeTruthy();
  });

  it("[V-16'] present 1名・absent 1名が回答済みのとき、未回答グループはその2名を除いた1名のみになる", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockResolvedValue([
      makeMember("u1", "田中"),
      makeMember("u2", "佐藤"),
      makeMember("u3", "鈴木"),
    ]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([makeAttendance("u1", "present", "田中"), makeAttendance("u2", "absent", "佐藤")]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("未回答 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("鈴木")).toBeTruthy();
  });

  it("[V-17] 全メンバー分の回答が揃っているとき、未回答グループは0件(空表記)になる", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockResolvedValue([makeMember("u1", "田中"), makeMember("u2", "佐藤")]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([makeAttendance("u1", "present", "田中"), makeAttendance("u2", "absent", "佐藤")]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("未回答 (0名)")).toBeTruthy();
    });
    // 4グループ分の空表記("なし")のうち、未回答セクションにも含まれる
    expect(screen.getAllByText("なし").length).toBeGreaterThan(0);
  });

  it("[V-18] チームメンバーが0人のとき、4グループとも0件表示になりクラッシュしない", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockResolvedValue([]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(successQuery([]));

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("出席 (0名)")).toBeTruthy();
    });
    expect(screen.getByText("欠席 (0名)")).toBeTruthy();
    expect(screen.getByText("その他 (0名)")).toBeTruthy();
    expect(screen.getByText("未回答 (0名)")).toBeTruthy();
  });

  it("[V-19] fetchTeamMembers が失敗するとき、出席/欠席/その他グループは表示され続け、未回答にはエラー行が出る（0件表示にしない）", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockRejectedValue(new Error("network error"));
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([makeAttendance("u1", "present", "田中")]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("出席 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("田中")).toBeTruthy();
    expect(screen.getByText("欠席 (0名)")).toBeTruthy();
    expect(screen.getByText("その他 (0名)")).toBeTruthy();

    // 未回答は「0名」の見出しにならず、専用のエラー行が表示される
    expect(screen.queryByText(/^未回答 \(/)).toBeNull();
    expect(screen.getByText("メンバー一覧を取得できませんでした")).toBeTruthy();
  });

  it("[V-34] 未回答セクションのエラー行に再試行ボタンが表示され、押下で再フェッチが走り成功すれば正常表示に復帰する", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockRejectedValueOnce(new Error("network error"));
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([makeAttendance("u1", "present", "田中")]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("メンバー一覧を取得できませんでした")).toBeTruthy();
    });
    expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);

    // 再試行ボタンが表示される（common.retry を再利用、新規 i18n キーなし）
    const retryButton = screen.getByText("再試行").closest("button");
    expect(retryButton).toBeTruthy();

    // 次回は成功させて押下する
    mocks.fetchTeamMembers.mockResolvedValueOnce([makeMember("u1", "田中"), makeMember("u2", "佐藤")]);
    fireEvent.click(retryButton!);

    await waitFor(() => {
      expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText("メンバー一覧を取得できませんでした")).toBeNull();
    });
    await waitFor(() => {
      // present(田中)が回答済みなので、未回答は佐藤の1名のみに復帰する
      expect(screen.getByText("未回答 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("佐藤")).toBeTruthy();
    // 出席/欠席/その他グループの表示も引き続き壊れていない
    expect(screen.getByText("出席 (1名)")).toBeTruthy();
    expect(screen.getByText("田中")).toBeTruthy();
  });

  it("[V-34 関連] 再試行前は出席/欠席/その他グループの表示に影響が無い（エラーは未回答セクションに限定される）", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.fetchTeamMembers.mockRejectedValue(new Error("network error"));
    mocks.useAttendanceByPracticeQuery.mockReturnValue(
      successQuery([
        makeAttendance("u1", "present", "田中"),
        makeAttendance("u2", "absent", "佐藤"),
        makeAttendance("u3", "other", "鈴木"),
      ]),
    );

    render(<AdminMonthlyAttendance teamId="team-1" />);
    await expandFirstEventCard();

    await waitFor(() => {
      expect(screen.getByText("出席 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("欠席 (1名)")).toBeTruthy();
    expect(screen.getByText("その他 (1名)")).toBeTruthy();
    expect(screen.getByText("田中")).toBeTruthy();
    expect(screen.getByText("佐藤")).toBeTruthy();
    expect(screen.getByText("鈴木")).toBeTruthy();
  });

  it("[V-20] 2つの EventCard を両方展開しても、fetchTeamMembers 呼び出しは1回だけ", async () => {
    setupMockSupabase([makePracticeEvent({ id: "p-1" })], [makeCompetitionEvent({ id: "c-1" })]);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(successQuery([]));
    mocks.useAttendanceByCompetitionQuery.mockReturnValue(successQuery([]));

    render(<AdminMonthlyAttendance teamId="team-1" />);

    await waitFor(() => {
      expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("icon-chevron-down").length).toBe(2);
    });
    const chevrons = screen.getAllByTestId("icon-chevron-down");
    fireEvent.click(chevrons[0]!.closest("button")!); // 直前の toBe(2) で存在は保証済み
    fireEvent.click(chevrons[1]!.closest("button")!);

    await waitFor(() => {
      expect(screen.getAllByText("出席 (0名)").length).toBe(2);
    });
    expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
  });

  it("[V-21] EventCard を折りたたんで再展開しても fetchTeamMembers が再度呼ばれない", async () => {
    setupMockSupabase([makePracticeEvent()], []);
    mocks.useAttendanceByPracticeQuery.mockReturnValue(successQuery([]));

    render(<AdminMonthlyAttendance teamId="team-1" />);

    await waitFor(() => {
      expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
    });

    // 展開 → 折りたたみ → 再展開
    await expandFirstEventCard();
    await waitFor(() => {
      expect(screen.getByText("出席 (0名)")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("icon-chevron-up").closest("button")!);
    await waitFor(() => {
      expect(screen.queryByText("出席 (0名)")).toBeNull();
    });
    fireEvent.click(screen.getByTestId("icon-chevron-down").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("出席 (0名)")).toBeTruthy();
    });

    expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
  });

  it("[既存回帰] イベント単位のステータスバッジ(受付中/締切/未設定)は引き続き表示される", async () => {
    setupMockSupabase([makePracticeEvent({ attendance_status: "open" })], []);
    render(<AdminMonthlyAttendance teamId="team-1" />);

    await waitFor(() => {
      expect(screen.getByText("受付中")).toBeTruthy();
    });
  });
});
