/**
 * TeamBulkRegisterForm (カレンダー型の一括登録)
 *
 * 観測点: TeamBulkRegisterAPI.bulkRegister に渡った入力と、画面に出る件数・シート。
 * 今日は 2026-11-17 (火) に固定する。登録済みの予定は 11/18 の練習と 11/26 の大会。
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Alert } from "react-native";

const mocks = vi.hoisted(() => ({
  bulkRegister: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    // 共通モックの TextInput は onChange を onChangeText へ渡さないため差し替える
    TextInput: ({
      onChangeText,
      value,
      multiline: _multiline,
      autoFocus: _autoFocus,
      placeholderTextColor: _p,
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

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {} }),
}));

vi.mock("@/hooks/useSafeInsets", () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamPracticesQuery: () => ({ data: [{ date: "2026-11-18" }] }),
  useTeamCompetitionsQuery: () => ({ data: [{ date: "2026-11-26", end_date: null }] }),
}));

// DatePickerField は内部カレンダーのモーダルを持つため、日付を直接入れられる入力欄に置き換える
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement("input", {
      type: "text",
      "data-testid": "schedule-date",
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}));

vi.mock("@apps/shared/api/teams/bulkRegister", () => ({
  TeamBulkRegisterAPI: class {
    bulkRegister = mocks.bulkRegister;
  },
}));

import { TeamBulkRegisterForm } from "../TeamBulkRegisterForm";

function byLabel(container: HTMLElement, label: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[accessibilitylabel="${label}"]`);
  if (!el) throw new Error(`accessibilitylabel="${label}" が見つからない`);
  return el;
}

/** カレンダーの日付セル (ラベルは "2026年11月24日") */
const tapDay = (container: HTMLElement, day: number, month = 11) =>
  fireEvent.click(byLabel(container, `2026年${month}月${day}日`));

const input = (placeholder: string, index = 0) =>
  screen.getAllByPlaceholderText(placeholder)[index] as HTMLInputElement;

async function confirmAndSubmit(confirmText: string) {
  fireEvent.click(screen.getByText(confirmText));
  await act(async () => {});
  fireEvent.click(await screen.findByText(/件を登録する$/));
  await waitFor(() => expect(mocks.bulkRegister).toHaveBeenCalledTimes(1));
  return mocks.bulkRegister.mock.calls[0]![1];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 17, 9, 0, 0));
  mocks.bulkRegister.mockReset().mockImplementation(async (_teamId, i) => ({
    success: true,
    practicesCreated: i.practices.length,
    competitionsCreated: i.competitions.length,
    errors: [],
  }));
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("練習タブ", () => {
  it("日付をタップして選び、共通のタイトルで登録する。登録後は選択がリセットされる", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    expect(screen.getByText("登録する予定を選んでください")).toBeTruthy();

    tapDay(container, 24);
    tapDay(container, 25);
    expect(screen.getByText("選択中 2日")).toBeTruthy();
    // 月ごとの日数は丸数字 (「11月 2日」だと日付に読めるため)
    expect(screen.getByText("11月 ②")).toBeTruthy();

    fireEvent.change(input("例: 朝練"), { target: { value: "朝練" } });
    fireEvent.change(input("例: 市民プール"), { target: { value: "市民プール" } });

    const sent = await confirmAndSubmit("練習2 を登録");
    expect(mocks.bulkRegister.mock.calls[0]![0]).toBe("team-1");
    expect(sent.practices).toEqual([
      { date: "2026-11-24", title: "朝練", place: "市民プール", note: null },
      { date: "2026-11-25", title: "朝練", place: "市民プール", note: null },
    ]);
    expect(sent.competitions).toEqual([]);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("2件を登録しました"));
    expect(screen.getByText("カレンダーで練習日を選んでください")).toBeTruthy();
    expect(input("例: 朝練").value).toBe("");
  });

  it("曜日の見出しをタップするとその月の同じ曜日をまとめて選び、もう一度で外す", () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);

    fireEvent.click(byLabel(container, "火曜日をまとめて選択"));
    expect(screen.getByText("選択中 4日")).toBeTruthy();
    expect(screen.getByText("11月 ④")).toBeTruthy();

    fireEvent.click(byLabel(container, "火曜日をまとめて選択"));
    expect(screen.getByText("カレンダーで練習日を選んでください")).toBeTruthy();
  });

  it("「＋ メモ」でメモ欄が出て、日ごとに変えた内容は共通の内容より優先される", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    tapDay(container, 24);
    tapDay(container, 25);
    fireEvent.change(input("例: 朝練"), { target: { value: "通常練習" } });

    // 共通のメモ
    expect(screen.queryByPlaceholderText("メモ")).toBeNull();
    fireEvent.click(screen.getByText("＋ メモ"));
    fireEvent.change(input("メモ"), { target: { value: "持ち物: フィン" } });

    // 日ごとに変える: 25日だけタイトルとメモを上書き
    fireEvent.click(screen.getByText("日ごとに変える ›"));
    await screen.findByText("空欄の項目は共通の内容になります。");
    fireEvent.change(input("通常練習", 1), { target: { value: "記録会" } });
    fireEvent.click(screen.getAllByText("＋ メモ")[1]!);
    fireEvent.change(input("持ち物: フィン"), { target: { value: "8時集合" } });
    fireEvent.click(screen.getByText("閉じる"));

    expect(screen.getByText("※ 1日分は日ごとの内容が優先されます")).toBeTruthy();
    const sent = await confirmAndSubmit("練習2 を登録");
    expect(sent.practices).toEqual([
      { date: "2026-11-24", title: "通常練習", place: null, note: "持ち物: フィン" },
      { date: "2026-11-25", title: "記録会", place: null, note: "8時集合" },
    ]);
  });

  it("登録済みの大会と同じ日を選ぶと注意が出る", () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    tapDay(container, 26);
    expect(screen.getByText("⚠ 大会と同じ日 1日")).toBeTruthy();
  });
});

describe("大会タブ", () => {
  it("初日をタップ → シートで日数・大会名・水路・メモを入れて追加し、登録する", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    fireEvent.click(screen.getByText("大会"));

    tapDay(container, 28);
    expect(await screen.findByText("大会を追加")).toBeTruthy();
    fireEvent.change(input("大会名"), { target: { value: "都民大会" } });
    fireEvent.click(byLabel(container, "日数を増やす"));
    expect(screen.getByText("2日間")).toBeTruthy();
    fireEvent.click(screen.getByText("長水路 (50m)"));
    fireEvent.click(screen.getByText("＋ メモ"));
    fireEvent.change(input("メモ"), { target: { value: "招集 8:00" } });
    fireEvent.click(screen.getByText("追加"));

    expect(await screen.findByText("追加する大会 1件")).toBeTruthy();
    expect(screen.getByText("都民大会")).toBeTruthy();

    const sent = await confirmAndSubmit("大会1 を登録");
    expect(sent.practices).toEqual([]);
    expect(sent.competitions).toEqual([
      { date: "2026-11-28", end_date: "2026-11-29", title: "都民大会", place: null, pool_type: 1, note: "招集 8:00" },
    ]);
  });

  it("タップした日が日程に入り、シートの日程から別の日に変えられる", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    fireEvent.click(screen.getByText("大会"));
    tapDay(container, 28);
    const dateField = (await screen.findByTestId("schedule-date")) as HTMLInputElement;
    expect(dateField.value).toBe("2026-11-28");

    fireEvent.change(dateField, { target: { value: "2026-12-05" } });
    fireEvent.click(screen.getByText("追加"));

    // 変えた日の月へカレンダーが移り、帯が見える
    expect(await screen.findByText("2026年12月")).toBeTruthy();
    const sent = await confirmAndSubmit("大会1 を登録");
    expect(sent.competitions[0]).toMatchObject({ date: "2026-12-05", end_date: null });
  });

  it("登録済みの大会と期間が重なると警告が出る", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    fireEvent.click(screen.getByText("大会"));
    tapDay(container, 26);
    expect(await screen.findByText("この期間には既に大会が登録されています")).toBeTruthy();
  });

  it("追加した大会の期間内の日付をタップすると編集シートが開き、削除できる", async () => {
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);
    fireEvent.click(screen.getByText("大会"));
    tapDay(container, 28);
    fireEvent.click(byLabel(container, "日数を増やす"));
    fireEvent.click(await screen.findByText("追加"));
    await screen.findByText("追加する大会 1件");

    tapDay(container, 29);
    expect(await screen.findByText("大会を編集")).toBeTruthy();
    fireEvent.click(screen.getByText("削除"));
    expect(await screen.findByText("追加する大会 0件")).toBeTruthy();
  });
});

describe("練習と大会をまとめて登録", () => {
  it("タブを切り替えても入力は残り、両方まとめて送る。一部失敗したら失敗した側の入力を残す", async () => {
    const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    mocks.bulkRegister.mockReset().mockResolvedValue({
      success: false,
      practicesCreated: 1,
      competitionsCreated: 0,
      errors: ["大会の登録に失敗しました"],
    });
    const { container } = render(<TeamBulkRegisterForm teamId="team-1" />);

    tapDay(container, 24);
    fireEvent.click(screen.getByText("大会"));
    tapDay(container, 28);
    fireEvent.click(await screen.findByText("追加"));
    await screen.findByText("追加する大会 1件");

    const sent = await confirmAndSubmit("練習1・大会1 を登録");
    expect(sent.practices).toHaveLength(1);
    expect(sent.competitions).toHaveLength(1);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // 練習は全件登録できたのでリセット、大会は失敗したので残る
    expect(screen.getByText("大会1 を登録")).toBeTruthy();
    alertSpy.mockRestore();
  });
});
