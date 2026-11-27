// =============================================================================
// RecordFeedbackArrivalPopup: ダッシュボードの FB 受信ポップアップ
// 仕様: docs/specs/record-feedback.md
//   - 約3秒の「手紙が届く」アニメーションのあと一覧を出す。タップで飛ばせる
//   - reduce motion なら最初から一覧
//   - 各項目は「{name}さんからフィードバックが届きました」+ 大会名・種目・タイム + 「記録画面へ」
//   - 「閉じる」は1つ
// =============================================================================

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnreadRecordFeedback } from "@swim-hub/shared/types";

const motion = vi.hoisted(() => ({ reduce: false }));

// vitest.setup.ts の reanimated モックは useReducedMotion を常に false で返すため、
// このファイルではコンポーネントが使う API だけを持つモックに差し替える
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  const RN = await import("react-native");
  const identity = <T,>(value: T) => value;
  const easing = (t: number) => t;
  return {
    default: { View: RN.View },
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef({ value: initial, get: () => ref.current.value, set: (v: unknown) => { ref.current.value = v; } });
      return ref.current;
    },
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => motion.reduce,
    withTiming: identity,
    withSpring: identity,
    withDelay: (_ms: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    Easing: { out: () => easing, quad: easing, cubic: easing },
  };
});

vi.mock("@/components/goals/useCenterModalMaxHeight", () => ({
  useCenterModalMaxHeight: () => 700,
}));

import {
  FEEDBACK_ARRIVAL_ANIMATION_MS,
  RecordFeedbackArrivalPopup,
} from "../RecordFeedbackArrivalPopup";

const item = (overrides: Partial<UnreadRecordFeedback> = {}): UnreadRecordFeedback => ({
  id: "fb-1",
  record_id: "rec-1",
  team_id: "team-1",
  author_id: "admin-1",
  author_name: "コーチ山田",
  updated_at: "2026-11-26T09:00:00Z",
  competition_id: "comp-1",
  competition_title: "秋季大会",
  competition_date: "2026-11-20",
  style_id: 1,
  time: 61.23,
  pool_type: 0,
  is_relaying: false,
  record_created_at: "2026-11-20T10:00:00Z",
  ...overrides,
});

const stylesById = new Map([[1, { id: 1, name_jp: "100m自由形", style: "Fr", distance: 100 }]]);

describe("RecordFeedbackArrivalPopup", () => {
  beforeEach(() => {
    motion.reduce = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("最初はアニメーション、約3秒後に一覧へ切り替わる", () => {
    render(
      <RecordFeedbackArrivalPopup
        feedbacks={[item()]}
        stylesById={stylesById}
        onClose={vi.fn()}
        onOpenRecord={vi.fn()}
      />,
    );
    expect(screen.queryByText("コーチ山田さんからフィードバックが届きました")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_ARRIVAL_ANIMATION_MS);
    });
    expect(screen.getByText("コーチ山田さんからフィードバックが届きました")).toBeTruthy();
  });

  it("アニメーションはタップで飛ばせる", () => {
    render(
      <RecordFeedbackArrivalPopup
        feedbacks={[item()]}
        stylesById={stylesById}
        onClose={vi.fn()}
        onOpenRecord={vi.fn()}
      />,
    );
    fireEvent.click(document.querySelector('[testid="record-feedback-arrival-animation"]')!);
    expect(screen.getByText("コーチ山田さんからフィードバックが届きました")).toBeTruthy();
  });

  it("reduce motion なら最初から一覧。退会者・大会名・タイム・ボタンを出す", () => {
    motion.reduce = true;
    const onClose = vi.fn();
    const onOpenRecord = vi.fn();
    render(
      <RecordFeedbackArrivalPopup
        feedbacks={[item(), item({ id: "fb-2", author_name: null, record_id: "rec-2" })]}
        stylesById={stylesById}
        onClose={onClose}
        onOpenRecord={onOpenRecord}
      />,
    );
    expect(screen.getByText("コーチ山田さんからフィードバックが届きました")).toBeTruthy();
    expect(screen.getByText("退会したユーザーさんからフィードバックが届きました")).toBeTruthy();
    expect(screen.getAllByText(/秋季大会 · 100m.* · 1:01\.23/).length).toBe(2);

    fireEvent.click(screen.getAllByText("記録画面へ")[1]!);
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "fb-2" }));

    // 閉じるボタン (本文側) で onClose
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalled();
  });
});
