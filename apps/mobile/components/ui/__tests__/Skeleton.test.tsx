// =============================================================================
// Skeleton.test.tsx
// =============================================================================
// 読み込み中の骨組み (`components/ui/Skeleton.tsx` / `ScreenSkeletons.tsx`) を検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// 明滅 (opacity の withRepeat) は reanimated のスタブでは動かないため検証しない。
// 検証するのは、画面リーダー向けの読み込み中表示と、ブロックの寸法が指定どおりに
// なること、各画面用プリセットが同じ土台を使っていること。
//
// 検証観点:
//   [V-SK-01] 土台は progressbar として「読み込み中...」を支援技術に伝える
//   [V-SK-02] SkeletonBlock は指定した幅・高さ・角丸になる
//   [V-SK-03] 画面用プリセットはすべて Skeleton を根に持つ (読み上げが揃う)
// =============================================================================

import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton, SkeletonBlock } from "../Skeleton";
import {
  CalendarSkeleton,
  GoalListSkeleton,
  PracticeListSkeleton,
  ProfileSkeleton,
  RecordListSkeleton,
  TeamListSkeleton,
} from "../ScreenSkeletons";

const PROGRESSBAR = '[accessibilityrole="progressbar"]';

describe("Skeleton", () => {
  it("[V-SK-01] 土台は progressbar として「読み込み中...」を支援技術に伝える", () => {
    const { container } = render(
      <Skeleton>
        <SkeletonBlock />
      </Skeleton>,
    );
    const root = container.querySelector(PROGRESSBAR);
    expect(root).not.toBeNull();
    expect(root?.getAttribute("accessibilitylabel")).toBe("読み込み中...");
  });

  it("[V-SK-02] SkeletonBlock は指定した幅・高さ・角丸になる", () => {
    const { container } = render(
      <Skeleton>
        <SkeletonBlock width={40} height={12} radius={6} />
      </Skeleton>,
    );
    const block = container.querySelector(PROGRESSBAR)?.firstElementChild as HTMLElement;
    expect(block.style.width).toBe("40px");
    expect(block.style.height).toBe("12px");
    expect(block.style.borderRadius).toBe("6px");
  });

  it.each([
    ["PracticeListSkeleton", PracticeListSkeleton],
    ["RecordListSkeleton", RecordListSkeleton],
    ["TeamListSkeleton", TeamListSkeleton],
    ["GoalListSkeleton", GoalListSkeleton],
    ["ProfileSkeleton", ProfileSkeleton],
    ["CalendarSkeleton", CalendarSkeleton],
  ])("[V-SK-03] %s は Skeleton を根に持つ", (_name, Preset) => {
    const { container } = render(<Preset />);
    expect(container.querySelectorAll(PROGRESSBAR)).toHaveLength(1);
  });
});
