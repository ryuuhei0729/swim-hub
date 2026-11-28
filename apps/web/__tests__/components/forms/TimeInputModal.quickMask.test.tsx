/**
 * TimeInputModal: 2本目以降のクイック入力 (マスク入力)
 *
 * 2026-11-28 に mobile (PracticeTimeFormScreen) に揃えた仕様 (swimhub-tasks #80):
 *   - 1本目は従来どおり自由入力 (「1.05.3」「33-2」など)
 *   - 2本目以降は入力欄にフォーカスした時点で、前の本の十の位 (1分以上なら「分.十の位」) を先に入れておく
 *   - 続けて数字だけを打てばよく、十の位+一の位の後の「.」は自動で入る
 *   - Enter で次のセルへ移る
 *   - 「3-2」のように区切り文字を打つと自由入力に切り替わり、従来どおり十の位を引き継いで解釈される
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import TimeInputModal from "@/components/forms/TimeInputModal";

type SubmittedTime = { setNumber: number; repNumber: number; time: number };

// initialTimes の既定値 (= []) は描画ごとに新しい配列になり初期化の effect が回り続けるため、
// 呼び出し側 (PracticeTabModal) と同じく参照が変わらない値を渡す
const NO_INITIAL_TIMES: Array<SubmittedTime & { id: string }> = [];

const renderModal = (repCount = 3) => {
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TimeInputModal
        isOpen
        onClose={vi.fn()}
        onSubmit={onSubmit}
        setCount={1}
        repCount={repCount}
        initialTimes={NO_INITIAL_TIMES}
      />
    </NextIntlClientProvider>,
  );
  const cell = (rep: number) => screen.getByTestId(`time-input-1-${rep}`) as HTMLInputElement;
  return { onSubmit, cell };
};

const submittedTimes = (onSubmit: ReturnType<typeof vi.fn>): number[] =>
  (onSubmit.mock.calls[0]![0] as SubmittedTime[])
    .sort((a, b) => a.repNumber - b.repNumber)
    .map((t) => Math.round(t.time * 100) / 100);

describe("TimeInputModal - 2本目以降のクイック入力 (マスク入力)", () => {
  it("1本目を確定して Enter で次へ移ると、2本目には前の本の十の位が先に入っている", async () => {
    const user = userEvent.setup();
    const { cell } = renderModal();

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");

    expect(cell(2)).toHaveFocus();
    expect(cell(2).value).toBe("3");
  });

  it("2本目は数字だけを打てば「.」が自動で入り、Enter で3本目へ移るとまた十の位が入っている", async () => {
    const user = userEvent.setup();
    const { cell, onSubmit } = renderModal();

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");
    await user.keyboard("4");
    expect(cell(2).value).toBe("34.");
    await user.keyboard("5{Enter}");
    expect(cell(2).value).toBe("34.5");
    expect(cell(3)).toHaveFocus();
    expect(cell(3).value).toBe("3");
    await user.keyboard("51");

    await user.click(screen.getByTestId("save-times-button"));
    expect(submittedTimes(onSubmit)).toEqual([33.2, 34.5, 35.1]);
  });

  it("1分以上のタイムの次は「分.十の位」が入り、続きの数字だけで分つきのタイムになる", async () => {
    const user = userEvent.setup();
    const { cell, onSubmit } = renderModal(2);

    await user.click(cell(1));
    await user.keyboard("1.05.3{Enter}");
    expect(cell(2).value).toBe("1.0");
    await user.keyboard("83");
    expect(cell(2).value).toBe("1.08.3");

    await user.click(screen.getByTestId("save-times-button"));
    expect(submittedTimes(onSubmit)).toEqual([65.3, 68.3]);
  });

  it("自動で入った「.」と同じ位置で「.」を打っても二重にならない", async () => {
    const user = userEvent.setup();
    const { cell } = renderModal();

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");
    await user.keyboard("4.5");

    expect(cell(2).value).toBe("34.5");
  });

  it("Backspace は打った数字 → 引き継いだ数字の順に1桁ずつ戻す", async () => {
    const user = userEvent.setup();
    const { cell } = renderModal();

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");
    await user.keyboard("4");
    expect(cell(2).value).toBe("34.");
    await user.keyboard("{Backspace}");
    expect(cell(2).value).toBe("3");
    await user.keyboard("{Backspace}");
    expect(cell(2).value).toBe("");
  });

  it("従来の「3-2」形式も使える (区切り文字を打つと自由入力になり、十の位を引き継いで解釈される)", async () => {
    const user = userEvent.setup();
    const { cell, onSubmit } = renderModal(2);

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");
    await user.keyboard("3-2");
    expect(cell(2).value).toBe("3-2");
    await user.keyboard("{Enter}");
    expect(cell(2).value).toBe("33.2");

    await user.click(screen.getByTestId("save-times-button"));
    expect(submittedTimes(onSubmit)).toEqual([33.2, 33.2]);
  });

  it("1本目は自由入力のまま (フォーカスしても何も入らない)", async () => {
    const user = userEvent.setup();
    const { cell } = renderModal();

    await user.click(cell(1));
    expect(cell(1).value).toBe("");
    await user.keyboard("1:12.3");
    expect(cell(1).value).toBe("1:12.3");
  });

  it("何も打たずに離れたセルは、引き継いだ数字だけが残らず空に戻る", async () => {
    const user = userEvent.setup();
    const { cell } = renderModal();

    await user.click(cell(1));
    await user.keyboard("33.2{Enter}");
    expect(cell(2).value).toBe("3");
    await user.click(cell(1));

    expect(cell(2).value).toBe("");
  });
});
