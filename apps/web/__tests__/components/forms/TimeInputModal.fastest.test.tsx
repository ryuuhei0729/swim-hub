/**
 * TimeInputModal: 全体平均に加えて「最速」を出す (swimhub-tasks #117。mobile PracticeTimeFormScreen に揃える)
 */

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import TimeInputModal from "@/components/forms/TimeInputModal";

type InitialTime = { id: string; setNumber: number; repNumber: number; time: number };

const NO_INITIAL_TIMES: InitialTime[] = [];
const SOME_TIMES: InitialTime[] = [
  { id: "t1", setNumber: 1, repNumber: 1, time: 33.2 },
  { id: "t2", setNumber: 1, repNumber: 2, time: 31.5 },
  { id: "t3", setNumber: 1, repNumber: 3, time: 32.8 },
];

const renderModal = (initialTimes: InitialTime[]) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TimeInputModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        setCount={1}
        repCount={3}
        initialTimes={initialTimes}
      />
    </NextIntlClientProvider>,
  );

describe("TimeInputModal - 最速", () => {
  it("入力済みタイムのうち最も速いタイムを出す", () => {
    renderModal(SOME_TIMES);
    expect(screen.getByText("最速:")).toBeInTheDocument();
    expect(screen.getByTestId("time-input-fastest")).toHaveTextContent("31.50");
  });

  it("未入力なら「未入力」と出す", () => {
    renderModal(NO_INITIAL_TIMES);
    expect(screen.getByTestId("time-input-fastest")).toHaveTextContent("未入力");
  });
});
