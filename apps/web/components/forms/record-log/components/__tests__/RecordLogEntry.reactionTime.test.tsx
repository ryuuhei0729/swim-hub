/**
 * RecordLogEntry / useRecordLogForm — リアクションタイムの範囲検査 (-1〜2秒)
 * 入力欄の min/max 属性だけでは保存が止まらないため、入力欄の下に理由を出し、
 * 保存時 (prepareSubmitData) にも同じ判定で止める (mobile の CompetitionTabFormScreen に揃える)。
 */

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { RecordLogFormState, StyleOption } from "@/components/forms/record-log/types";
import RecordLogEntry from "../RecordLogEntry";

vi.mock("@/components/video/VideoUploader", () => ({
  __esModule: true,
  default: () => null,
}));

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

// 50m自由形 (Fr, id=2) / 200m個人メドレー (IM, id=21)
const styles: StyleOption[] = [
  { id: 2, nameJp: "50m自由形", distance: 50 },
  { id: 21, nameJp: "200m個人メドレー", distance: 200 },
];

const makeFormData = (overrides: Partial<RecordLogFormState> = {}): RecordLogFormState => ({
  styleId: "2",
  time: 0,
  timeDisplayValue: "",
  isRelaying: false,
  splitTimes: [],
  note: "",
  videoPath: null,
  videoThumbnailPath: null,
  reactionTime: "",
  ...overrides,
});

const noop = () => {};
const commonHandlers = {
  onTimeChange: noop,
  onToggleRelaying: noop,
  onNoteChange: noop,
  onVideoPathChange: noop,
  onVideoDelete: noop,
  onReactionTimeChange: noop,
  onStyleChange: noop,
  onAddSplitTime: noop,
  onAddSplitTimesEvery25m: noop,
  onAddSplitTimesEvery50m: noop,
  onRemoveSplitTime: noop,
  onSplitTimeChange: noop,
};

import { getReactionTimeError } from "../../utils/reactionTimeValidation";

describe("getReactionTimeError", () => {
  it("空欄はエラーにしない", () => {
    expect(getReactionTimeError("")).toBeNull();
    expect(getReactionTimeError("  ")).toBeNull();
    expect(getReactionTimeError(undefined)).toBeNull();
  });

  it("-1〜2秒の範囲内はエラーにしない (境界値を含む)", () => {
    expect(getReactionTimeError("0.65")).toBeNull();
    expect(getReactionTimeError("-1")).toBeNull();
    expect(getReactionTimeError("2")).toBeNull();
    expect(getReactionTimeError("-0.01")).toBeNull();
  });

  it("範囲外は range", () => {
    expect(getReactionTimeError("2.01")).toBe("range");
    expect(getReactionTimeError("-1.5")).toBe("range");
    expect(getReactionTimeError("10")).toBe("range");
  });

  it("数値にならない値は format", () => {
    expect(getReactionTimeError("1e5")).toBe("format");
    expect(getReactionTimeError("abc")).toBe("format");
  });
});

describe("RecordLogEntry — リアクションタイムのエラー表示", () => {
  const renderEntry = (reactionTime: string) =>
    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ reactionTime })}
        index={0}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

  it("範囲外のときは範囲のエラーを出す", () => {
    renderEntry("2.5");
    expect(screen.getByTestId("record-reaction-time-error-1")).toHaveTextContent(
      "リアクションタイムは-1.00〜2.00秒の範囲で入力してください",
    );
  });

  it("範囲内・空欄のときはエラーを出さない", () => {
    renderEntry("0.65");
    expect(screen.queryByTestId("record-reaction-time-error-1")).not.toBeInTheDocument();
  });
});
