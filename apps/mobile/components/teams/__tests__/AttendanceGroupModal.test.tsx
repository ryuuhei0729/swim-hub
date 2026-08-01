/**
 * AttendanceGroupModal.test.tsx — Sprint Contract Phase B 本実装検証
 *
 * 対象: apps/mobile/components/teams/AttendanceGroupModal.tsx
 * T-5b(MyMonthlyAttendance)/T-6(DayDetailModal の PracticeLogDetail・RecordDetail)の
 * 3箇所から再利用される一般メンバー向け「誰が来るか」閲覧専用モーダル。
 *
 * Sprint Contract 検証観点:
 *   [V-T5-07] チーム名簿(fetchTeamMembers)取得失敗時、「未回答」グループが黙って0件に
 *             ならず、専用のエラー行 + 再試行ボタンが表示される
 *             (AdminMonthlyAttendance.attendanceGrouping.test.tsx [V-19] と同一方針)
 *   [V-T6-01] 出欠データ取得中は「読み込み中」、取得失敗時はエラー+再試行が表示される
 *   [V-T6-02] showChangeLink=true のときのみフッターの「出欠を変更する」導線が表示される
 *   [V-T6-03] visible ガードによる名簿取得の遅延: T-6 は DayDetailModal 内のカードごとに
 *             AttendanceGroupModal を配置するため、同じ日に複数のチームイベントカードが
 *             あっても、ユーザーがどれも開いていない(全インスタンス visible=false)間は
 *             fetchTeamMembers が一切呼ばれない。ユーザーが1枚のカードを開いた
 *             (そのインスタンスだけ visible=true になり、兄弟は visible=false のまま)
 *             ときだけ、そのインスタンスの分だけ fetchTeamMembers がちょうど1回呼ばれる。
 *             (AttendanceGroupModal.tsx:81-85 の `useEffect(() => { if (visible) {...} },
 *             [visible, loadTeamMembers])` ガードの仕様固定。このガードが将来外されると
 *             本テストの1つ目のアサーション(0回)が落ちる)
 *
 * トートロジー防止メモ: 期待するUI文言・呼び出し回数はテスト側でハードコードしており、
 * AttendanceGroupModal.tsx の実装コードをコピーしていない。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getAttendanceByPractice: vi.fn(),
  getAttendanceByCompetition: vi.fn(),
  fetchTeamMembers: vi.fn(),
}));

vi.mock("@swim-hub/shared/api/attendance", () => ({
  AttendanceAPI: class {
    getAttendanceByPractice = mocks.getAttendanceByPractice;
    getAttendanceByCompetition = mocks.getAttendanceByCompetition;
  },
}));

vi.mock("@apps/shared/utils/team", () => ({
  fetchTeamMembers: mocks.fetchTeamMembers,
}));

import { AttendanceGroupModal } from "../AttendanceGroupModal";

const makeAttendance = (userId: string, status: "present" | "absent" | "other", name: string) => ({
  id: `att-${userId}`,
  user_id: userId,
  status,
  user: { name },
});

const defaultProps = {
  visible: true,
  onClose: vi.fn(),
  supabase: {} as never,
  teamId: "team-1",
  eventId: "practice-1",
  eventType: "practice" as const,
  eventDate: "2026-08-01",
  locale: "ja" as const,
};

describe("AttendanceGroupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAttendanceByPractice.mockResolvedValue([]);
    mocks.fetchTeamMembers.mockResolvedValue([]);
  });

  it("[V-T6-01] 出欠取得中は読み込み中の表示になる", async () => {
    mocks.getAttendanceByPractice.mockReturnValue(new Promise(() => {})); // pending 永続
    render(<AttendanceGroupModal {...defaultProps} />);

    expect(await screen.findByText("読み込み中...")).toBeTruthy();
  });

  it("[V-T6-01b] 出欠取得に失敗すると、エラーメッセージ+再試行ボタンが表示される", async () => {
    mocks.getAttendanceByPractice.mockRejectedValue(new Error("network error"));
    render(<AttendanceGroupModal {...defaultProps} />);

    expect(await screen.findByText("再試行")).toBeTruthy();
  });

  it("[V-15 相当] 出欠・名簿取得成功時、4グループが件数付きで表示される", async () => {
    mocks.getAttendanceByPractice.mockResolvedValue([
      makeAttendance("u1", "present", "田中"),
    ]);
    mocks.fetchTeamMembers.mockResolvedValue([
      { id: "u1", name: "田中" },
      { id: "u2", name: "佐藤" },
    ]);

    render(<AttendanceGroupModal {...defaultProps} />);

    expect(await screen.findByText("出席 (1名)")).toBeTruthy();
    expect(screen.getByText("欠席 (0名)")).toBeTruthy();
    expect(screen.getByText("未回答 (1名)")).toBeTruthy();
    expect(screen.getByText("佐藤")).toBeTruthy();
  });

  it("[V-T5-07] 名簿取得に失敗すると、未回答グループが0件表示にならずエラー行+再試行が出る", async () => {
    mocks.getAttendanceByPractice.mockResolvedValue([makeAttendance("u1", "present", "田中")]);
    mocks.fetchTeamMembers.mockRejectedValue(new Error("network error"));

    render(<AttendanceGroupModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("出席 (1名)")).toBeTruthy();
    });
    // 「未回答 (0名)」という見出しにはならない(黙って0件表示は禁止)
    expect(screen.queryByText(/^未回答 \(/)).toBeNull();
    expect(screen.getByText("メンバー一覧を取得できませんでした")).toBeTruthy();
    expect(screen.getByText("再試行")).toBeTruthy();
  });

  it("[V-T5-07b] 名簿取得の再試行が成功すると、未回答グループが正常表示に復帰する", async () => {
    mocks.getAttendanceByPractice.mockResolvedValue([makeAttendance("u1", "present", "田中")]);
    mocks.fetchTeamMembers.mockRejectedValueOnce(new Error("network error"));

    render(<AttendanceGroupModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("メンバー一覧を取得できませんでした")).toBeTruthy();
    });

    mocks.fetchTeamMembers.mockResolvedValueOnce([
      { id: "u1", name: "田中" },
      { id: "u2", name: "佐藤" },
    ]);
    fireEvent.click(screen.getByText("再試行").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("未回答 (1名)")).toBeTruthy();
    });
    expect(screen.getByText("佐藤")).toBeTruthy();
  });

  it("[V-T6-02] showChangeLink=false(デフォルト)のとき、変更導線フッターは表示されない", async () => {
    render(<AttendanceGroupModal {...defaultProps} />);
    await waitFor(() => {
      expect(mocks.getAttendanceByPractice).toHaveBeenCalled();
    });
    expect(screen.queryByText("出欠を変更する")).toBeNull();
  });

  it("[V-T6-02b] showChangeLink=true のとき、変更導線フッターが表示され押下でハンドラが呼ばれる", async () => {
    const onChangeLinkPress = vi.fn();
    render(
      <AttendanceGroupModal
        {...defaultProps}
        showChangeLink
        onChangeLinkPress={onChangeLinkPress}
      />,
    );

    const link = await screen.findByText("出欠を変更する");
    fireEvent.click(link.closest("button")!);
    expect(onChangeLinkPress).toHaveBeenCalledTimes(1);
  });

  it("[V-T6-03] 非表示インスタンスは名簿取得を遅延し、開いたインスタンスのみ1回だけ取得する(visibleガードの仕様固定)", async () => {
    // T-6 の本番形状: 同じ日に複数のチームイベントカードがあり、カードごとに
    // AttendanceGroupModal がマウントされる。ユーザーがまだどれもタップしていない間は
    // 全インスタンスが visible=false のまま存在する。
    const { rerender } = render(
      <>
        <AttendanceGroupModal {...defaultProps} visible={false} eventId="practice-1" />
        <AttendanceGroupModal {...defaultProps} visible={false} eventId="practice-2" />
      </>,
    );

    // 1. どちらも visible=false の間は、マウントされているだけで fetchTeamMembers は
    //    1回も呼ばれない(遅延取得。visible ガードが外れると即座に破綻する)。
    expect(mocks.fetchTeamMembers).not.toHaveBeenCalled();

    // 2. ユーザーが1枚目のカードをタップして開いた状態を再現する。
    //    兄弟(practice-2)は依然として visible=false のまま(=タップされていないカード)。
    rerender(
      <>
        <AttendanceGroupModal {...defaultProps} visible eventId="practice-1" />
        <AttendanceGroupModal {...defaultProps} visible={false} eventId="practice-2" />
      </>,
    );

    // 開かれたインスタンスの分だけ、ちょうど1回 fetchTeamMembers が呼ばれる
    await waitFor(() => {
      expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
    });
    expect(mocks.fetchTeamMembers).toHaveBeenCalledWith(expect.anything(), "team-1");

    // 兄弟(practice-2)を開かない限り、追加の呼び出しは発生しない(再レンダー後も1回のまま)
    rerender(
      <>
        <AttendanceGroupModal {...defaultProps} visible eventId="practice-1" />
        <AttendanceGroupModal {...defaultProps} visible={false} eventId="practice-2" />
      </>,
    );
    expect(mocks.fetchTeamMembers).toHaveBeenCalledTimes(1);
  });
});
