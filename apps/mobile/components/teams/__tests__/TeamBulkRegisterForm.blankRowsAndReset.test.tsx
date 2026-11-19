/**
 * TeamBulkRegisterForm — 空行の扱いと、登録成功後のリセット範囲
 *
 * 背景 (UI レビュー照合で見つかった実害):
 *   1. 「+ 行を追加」の行には今日の日付が入っており、送信対象の絞り込みは日付だけだったため、
 *      何も入力していない行まで「今日の無題の練習」として登録されていた。
 *   2. 登録に成功すると練習・大会の両方のタブがリセットされ、送信していない側のタブの
 *      入力が黙って消えていた。
 *
 * 観測点: TeamBulkRegisterAPI.bulkRegister に渡った入力 (件数は厳密一致) と、画面に残る入力値。
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { format } from "date-fns";

const mocks = vi.hoisted(() => ({
  bulkRegister: vi.fn(),
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    // 共通モックの TextInput は onChange を onChangeText へ渡さないため差し替える
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

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {} }),
}));

vi.mock("@/hooks/useSafeInsets", () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@apps/shared/api/teams/bulkRegister", () => ({
  TeamBulkRegisterAPI: class {
    bulkRegister = mocks.bulkRegister;
  },
}));

import { TeamBulkRegisterForm } from "../TeamBulkRegisterForm";

const TODAY = format(new Date(), "yyyy-MM-dd");

function dateInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText("YYYY-MM-DD") as HTMLInputElement[];
}

function submit() {
  fireEvent.click(screen.getByText("一括登録"));
}

beforeEach(() => {
  mocks.bulkRegister.mockReset().mockResolvedValue({
    success: true,
    practicesCreated: 1,
    competitionsCreated: 0,
    errors: [],
  });
});

describe("TeamBulkRegisterForm 空行", () => {
  it("[BR-1] 「+ 行を追加」の行は日付が空で始まり、何も入力しなければ登録されない", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);

    fireEvent.click(screen.getByText("+ 行を追加"));
    const dates = dateInputs();
    expect(dates).toHaveLength(2);
    expect(dates[0]!.value).toBe(TODAY);
    expect(dates[1]!.value).toBe("");

    submit();

    await waitFor(() => expect(mocks.bulkRegister).toHaveBeenCalledTimes(1));
    const [teamId, input] = mocks.bulkRegister.mock.calls[0]!;
    expect(teamId).toBe("team-5501");
    expect(input.practices).toHaveLength(1);
    expect(input.practices[0]).toMatchObject({ date: TODAY });
    expect(input.competitions).toEqual([]);
  });

  it("[BR-2] 日付が空でも他の欄に入力がある行はエラーにして送信しない", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);

    fireEvent.click(screen.getByText("+ 行を追加"));
    const titles = screen.getAllByPlaceholderText("例: 朝練");
    fireEvent.change(titles[1]!, { target: { value: "午後練5502" } });

    submit();

    const errorText = await screen.findByText("2行目: 日付は必須です");
    expect(mocks.bulkRegister).not.toHaveBeenCalled();
    // エラーは登録ボタンの直上に出る (スクロール領域の先頭だと行が多いとき画面外になる)
    const errorBox = errorText.parentElement!;
    expect(errorBox.nextElementSibling?.textContent).toBe("一括登録");
  });

  it("[BR-3] 追加した行に日付を入れれば、その行も登録される", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);

    fireEvent.click(screen.getByText("+ 行を追加"));
    fireEvent.change(dateInputs()[1]!, { target: { value: "2026-11-03" } });

    submit();

    await waitFor(() => expect(mocks.bulkRegister).toHaveBeenCalledTimes(1));
    const input = mocks.bulkRegister.mock.calls[0]![1];
    expect(input.practices).toHaveLength(2);
    expect(input.practices[1]).toMatchObject({ date: "2026-11-03" });
  });
});

describe("TeamBulkRegisterForm 空行 (大会)", () => {
  it("[BR-5] 水路だけ 50m に変えた追加行は空行ではないので、黙って無視せずエラーにする", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);
    fireEvent.click(screen.getByText("大会"));
    fireEvent.click(screen.getByText("+ 行を追加"));

    // 2行目の「50m」を押す (1行目と2行目に 25m/50m が1組ずつある)
    fireEvent.click(screen.getAllByText("50m")[1]!);
    submit();

    expect(await screen.findByText("2行目: 開始日は必須です")).toBeTruthy();
    expect(mocks.bulkRegister).not.toHaveBeenCalled();
  });

  it("[BR-6] 何も触っていない追加行 (水路も既定の 25m のまま) は無視して登録する", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);
    fireEvent.click(screen.getByText("大会"));
    fireEvent.click(screen.getByText("+ 行を追加"));

    submit();

    await waitFor(() => expect(mocks.bulkRegister).toHaveBeenCalledTimes(1));
    const input = mocks.bulkRegister.mock.calls[0]![1];
    expect(input.competitions).toHaveLength(1);
    expect(input.practices).toEqual([]);
  });
});

describe("TeamBulkRegisterForm 登録成功後のリセット", () => {
  it("[BR-4] 練習タブで登録に成功しても、大会タブの入力は残る", async () => {
    render(<TeamBulkRegisterForm teamId="team-5501" />);

    // 大会タブで大会名を入力しておく
    fireEvent.click(screen.getByText("大会"));
    fireEvent.change(screen.getByPlaceholderText("大会名"), { target: { value: "秋季記録会5503" } });

    // 練習タブに戻って登録
    fireEvent.click(screen.getByText("練習"));
    fireEvent.change(screen.getByPlaceholderText("例: 朝練"), { target: { value: "朝練5504" } });
    submit();
    await waitFor(() => expect(mocks.bulkRegister).toHaveBeenCalledTimes(1));
    expect(mocks.bulkRegister.mock.calls[0]![1].competitions).toEqual([]);

    // 送信した練習タブはリセットされる
    await waitFor(() =>
      expect((screen.getByPlaceholderText("例: 朝練") as HTMLInputElement).value).toBe(""),
    );
    // 送信していない大会タブの入力は残っている
    fireEvent.click(screen.getByText("大会"));
    expect((screen.getByPlaceholderText("大会名") as HTMLInputElement).value).toBe("秋季記録会5503");
  });
});
