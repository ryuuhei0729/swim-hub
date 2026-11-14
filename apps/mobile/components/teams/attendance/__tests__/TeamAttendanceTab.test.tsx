/**
 * TeamAttendanceTab — チームタブ「出欠」
 *
 * データの取得・保存のフック (@/hooks/useTeamAttendance) はモックにし、画面の振る舞いを確かめる。
 *   [AT-1] メンバー: 行の 出席 を押すと、その場で保存を呼ぶ (保存ボタンは無い)
 *   [AT-2] メンバー: 一覧の「＋備考」から備考を入力して保存できる (答えはそのまま)
 *   [AT-3] メンバー: 行を押すと全員の出欠のモーダルが開き、名前と備考が出る
 *   [AT-4] 管理者: 行の受付状態のプルダウンで「締切」を選ぶと、確認のうえそのイベントの受付状態を変える
 *   [AT-5] 管理者: 「まとめて変更」で選んだイベントをまとめて受付中 / 締切にする
 *   [AT-6] 過去のイベントは出さない (切り替えのボタンも無い)
 *   [AT-7] 管理者: モーダルの「変更」からメンバーの答えを直せる
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Alert } from "react-native";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { AttendanceListItem } from "@/utils/teamAttendance";

const mocks = vi.hoisted(() => ({
  items: [] as AttendanceListItem[],
  saveAnswer: vi.fn(),
  changeStatus: vi.fn(),
  editMemberAnswer: vi.fn(),
  rows: [] as unknown[],
  members: [] as { id: string; name: string }[],
}));

// 共通モックの TextInput は onChangeText をつないでいないため、このテストでは入力を流せる形にする
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({
      onChangeText,
      value,
      testID,
      autoFocus: _autoFocus,
      multiline: _multiline,
      placeholderTextColor: _placeholderTextColor,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        "data-testid": testID,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "me" }, supabase: {} }),
}));

vi.mock("@/hooks/useTeamAttendance", () => ({
  ATTENDANCE_NOTE_MAX_LENGTH: 500,
  useTeamAttendanceList: () => ({
    data: mocks.items,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMyAttendanceSaver: () => ({ saveAnswer: mocks.saveAnswer }),
  useAttendanceStatusChanger: () => ({ changeStatus: mocks.changeStatus, isChanging: false }),
  useTeamAttendanceMembers: () => ({
    data: mocks.members,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEventAttendanceRows: () => ({
    data: mocks.rows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMemberAnswerEditor: () => mocks.editMemberAnswer,
}));

import { TeamAttendanceTab } from "../TeamAttendanceTab";

const event = (
  id: string,
  date: string,
  extra: Partial<TeamEvent> = {},
): TeamEvent =>
  ({
    id,
    date,
    type: "practice",
    title: null,
    place: "文京区民プール",
    attendance_status: "open",
    ...extra,
  }) as TeamEvent;

const item = (ev: TeamEvent, status: "present" | "absent" | "other" | null = null, note = ""): AttendanceListItem => ({
  event: ev,
  myAttendance:
    status === null && !note
      ? null
      : ({
          id: `att-${ev.id}`,
          user_id: "me",
          practice_id: ev.id,
          competition_id: null,
          status,
          note: note || null,
          created_at: "",
          updated_at: "",
        } as AttendanceListItem["myAttendance"]),
});

/** TextInput のモックだけは testID を data-testid にする (__mocks__/react-native.ts) */
function inputByTestId(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  expect(el, testId).not.toBeNull();
  return el as HTMLInputElement;
}

function byTestId(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[testid="${testId}"]`);
  expect(el, testId).not.toBeNull();
  return el as HTMLElement;
}

describe("TeamAttendanceTab", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 14, 9, 0, 0)); // 2026-11-14
    mocks.saveAnswer.mockReset().mockResolvedValue(true);
    mocks.changeStatus.mockReset().mockResolvedValue(true);
    mocks.editMemberAnswer.mockReset().mockResolvedValue(true);
    vi.mocked(Alert.alert).mockReset();
    mocks.items = [
      item(event("past", "2026-11-10"), "present"),
      item(event("p-answered", "2026-11-18"), "present", "30分遅れます"),
      item(event("p-open", "2026-11-20")),
      item(event("c-open", "2026-11-22", { type: "competition", title: "東京都マスターズ" } as Partial<TeamEvent>)),
      item(event("p-closed", "2026-11-25", { attendance_status: "closed" })),
      item(event("p-dec", "2026-12-02")),
    ];
    mocks.rows = [];
    mocks.members = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[AT-1] メンバー: 行の 出席 を押すとその場で保存を呼ぶ", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);

    fireEvent.click(byTestId(container, "attendance-answer-p-open-present"));

    expect(mocks.saveAnswer).toHaveBeenCalledTimes(1);
    const [savedItem, change] = mocks.saveAnswer.mock.calls[0]!;
    expect((savedItem as AttendanceListItem).event.id).toBe("p-open");
    expect(change).toEqual({ status: "present", note: "" });
    // 月の見出しで区切られ、保存ボタンは無い
    expect(screen.getByText("2026年11月")).toBeTruthy();
    expect(screen.getByText("2026年12月")).toBeTruthy();
    expect(screen.queryByText("保存")).toBeNull();
  });

  it("[AT-1b] すでに選んでいる答えを押しても保存しない", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);
    fireEvent.click(byTestId(container, "attendance-answer-p-answered-present"));
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it("[AT-2] メンバー: 「＋備考」から備考を入力して保存できる (答えはそのまま)", async () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);
    // 受付中で未回答の件数 (締切・過去・回答済みは数えない)。まとめて出席にするボタンは無い
    expect(screen.getByText("未回答 3件")).toBeTruthy();
    expect(container.querySelector('[testid="attendance-answer-all"]')).toBeNull();

    // 備考の無い行は「＋備考」、ある行は備考そのものを出す
    expect(within(byTestId(container, "attendance-note-p-open")).getByText("＋備考")).toBeTruthy();
    expect(within(byTestId(container, "attendance-note-p-answered")).getByText("30分遅れます")).toBeTruthy();

    fireEvent.click(byTestId(container, "attendance-note-p-answered"));
    const input = inputByTestId(container, "attendance-note-input-p-answered");
    expect(input.value).toBe("30分遅れます");
    fireEvent.change(input, { target: { value: "  前半のみ参加  " } });
    fireEvent.click(byTestId(container, "attendance-note-save-p-answered"));

    expect(mocks.saveAnswer).toHaveBeenCalledTimes(1);
    const [savedItem, change] = mocks.saveAnswer.mock.calls[0]!;
    expect((savedItem as AttendanceListItem).event.id).toBe("p-answered");
    expect(change).toEqual({ status: "present", note: "前半のみ参加" });
    // 保存できたら入力欄を閉じる
    await screen.findByText("30分遅れます");
    expect(container.querySelector('[data-testid="attendance-note-input-p-answered"]')).toBeNull();
  });

  it("[AT-2b] メンバー: 備考の入力はキャンセルすると保存しない", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);
    fireEvent.click(byTestId(container, "attendance-note-p-open"));
    fireEvent.change(inputByTestId(container, "attendance-note-input-p-open"), { target: { value: "遅刻" } });
    fireEvent.click(byTestId(container, "attendance-note-cancel-p-open"));
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="attendance-note-input-p-open"]')).toBeNull();
  });

  it("[AT-3] メンバー: 行を押すと全員の出欠のモーダルが開き、名前と備考が出る", () => {
    mocks.members = [
      { id: "me", name: "自分" },
      { id: "u1", name: "田中" },
      { id: "u2", name: "佐藤" },
    ];
    mocks.rows = [
      { id: "r-me", user_id: "me", status: "present", note: "30分遅れます", user: { name: "自分" } },
      { id: "r-u1", user_id: "u1", status: "absent", note: "試験期間", user: { name: "田中" } },
    ];
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);

    fireEvent.click(byTestId(container, "attendance-row-p-answered"));

    expect(screen.getByText("全員の出欠")).toBeTruthy();
    expect(screen.getByText("出席 (1名)")).toBeTruthy();
    expect(screen.getByText("欠席 (1名)")).toBeTruthy();
    expect(screen.getByText("未回答 (1名)")).toBeTruthy();
    expect(screen.getByText("試験期間")).toBeTruthy();
    expect(screen.getByText("佐藤")).toBeTruthy();
    // メンバー表示では他の人の答えを変える導線は出ない
    expect(screen.queryByText("変更")).toBeNull();
  });

  it("[AT-4] 管理者: プルダウンで「締切」を選ぶと、確認のうえそのイベントの受付状態を変える", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView />);

    fireEvent.click(byTestId(container, "attendance-status-p-open"));
    // 選択肢は 受付中 / 締切 の 2 つ (今の状態にチェック)
    expect(container.querySelector('[testid="attendance-status-p-open-option-open"]')).not.toBeNull();
    fireEvent.click(byTestId(container, "attendance-status-p-open-option-closed"));

    // 大会のエントリー受付ステータスと同じく、変える前に確認する
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
    buttons.find((b) => b.text === "OK")!.onPress!();

    expect(mocks.changeStatus).toHaveBeenCalledTimes(1);
    const [events, status] = mocks.changeStatus.mock.calls[0]!;
    expect((events as TeamEvent[]).map((e) => e.id)).toEqual(["p-open"]);
    expect(status).toBe("closed");
    // 管理者表示の行には 出席 / 欠席 / その他 は出ない
    expect(container.querySelector('[testid="attendance-answer-p-open"]')).toBeNull();
  });

  it("[AT-4b] 管理者: 今と同じ受付状態を選んでも、確認も変更もしない", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView />);
    fireEvent.click(byTestId(container, "attendance-status-p-open"));
    fireEvent.click(byTestId(container, "attendance-status-p-open-option-open"));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("[AT-5] 管理者: まとめて変更で選んだイベントをまとめて締切にする", async () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView />);

    fireEvent.click(byTestId(container, "attendance-bulk-start"));
    fireEvent.click(byTestId(container, "attendance-row-p-open"));
    fireEvent.click(byTestId(container, "attendance-row-p-dec"));
    expect(screen.getByText("2件を選択中")).toBeTruthy();
    fireEvent.click(byTestId(container, "attendance-bulk-closed"));

    expect(mocks.changeStatus).toHaveBeenCalledTimes(1);
    const [events, status] = mocks.changeStatus.mock.calls[0]!;
    expect((events as TeamEvent[]).map((e) => e.id)).toEqual(["p-open", "p-dec"]);
    expect(status).toBe("closed");
  });

  it("[AT-6] 過去のイベントは出さず、切り替えのボタンも無い", () => {
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView={false} />);
    expect(container.querySelector('[testid="attendance-row-past"]')).toBeNull();
    expect(container.querySelector('[testid="attendance-past-toggle"]')).toBeNull();
  });

  it("[AT-7] 管理者: モーダルの「変更」からメンバーの答えを直せる", () => {
    mocks.members = [
      { id: "me", name: "自分" },
      { id: "u2", name: "佐藤" },
    ];
    mocks.rows = [];
    const { container } = render(<TeamAttendanceTab teamId="team-1" isAdminView />);

    fireEvent.click(byTestId(container, "attendance-row-p-open"));
    fireEvent.click(byTestId(container, "attendance-edit-member-u2"));
    const person = byTestId(container, "attendance-edit-member-u2").closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(person).getAllByText("欠席")[0]!);

    expect(mocks.editMemberAnswer).toHaveBeenCalledTimes(1);
    const [ev, target, status] = mocks.editMemberAnswer.mock.calls[0]!;
    expect((ev as TeamEvent).id).toBe("p-open");
    expect(target).toEqual({ userId: "u2", attendanceId: null, note: "" });
    expect(status).toBe("absent");
  });
});
