/**
 * RecordLogEntry — 目標バッジの位置 (W3 / Sprint Contract goal_target_badge)
 *   - ベストと目標は同じ縦並びコンテナ (flex-col) の子で、目標がベストの直後 (真下)
 *   - ベストが無いとき目標はそのコンテナの先頭 (ベストの位置)
 *   - エントリータイムのバッジは縦並びコンテナの外
 *   - showTitle=false でベストもエントリーも無く目標だけでも、ヘッダー行が消えず目標が出る
 *   - goalTargetTime 未指定 / null では何も出ない (optional prop)
 * jsdom は Tailwind を読まないため、クラス名 (flex-col) で縦並びを判定する。
 */
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { RecordLogFormState, StyleOption } from "@/components/forms/record-log/types";
import RecordLogEntry from "../RecordLogEntry";

vi.mock("@/components/video/VideoUploader", () => ({ __esModule: true, default: () => null }));

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const styles: StyleOption[] = [{ id: 2, nameJp: "50m自由形", distance: 50 }];
const formData: RecordLogFormState = {
  styleId: "2", time: 0, timeDisplayValue: "", isRelaying: false, splitTimes: [], note: "",
  videoPath: null, videoThumbnailPath: null, reactionTime: "",
};
const bestTimes = [
  {
    id: "b1", time: 26.5, created_at: "2025-01-01T00:00:00Z", pool_type: 0, is_relaying: false,
    style_id: 2, style: { name_jp: "50m自由形", distance: 50 },
  },
] as never;
const noop = () => {};
const handlers = {
  onTimeChange: noop, onToggleRelaying: noop, onNoteChange: noop, onVideoPathChange: noop,
  onVideoDelete: noop, onReactionTimeChange: noop, onStyleChange: noop, onAddSplitTime: noop,
  onAddSplitTimesEvery25m: noop, onAddSplitTimesEvery50m: noop, onRemoveSplitTime: noop,
  onSplitTimeChange: noop,
};
const entry: EntryInfo = { styleId: 2, styleName: "50m自由形", entryTime: 30.5 };

type Extra = { goalTargetTime?: number | null; best?: boolean; entryInfo?: EntryInfo; showTitle?: boolean };
function renderEntry({ goalTargetTime, best = false, entryInfo, showTitle = true }: Extra) {
  return renderWithIntl(
    <RecordLogEntry
      formData={formData}
      index={0}
      entryInfo={entryInfo}
      styles={styles}
      poolType={0}
      bestTimes={best ? bestTimes : []}
      goalTargetTime={goalTargetTime}
      showTitle={showTitle}
      isLoading={false}
      {...handlers}
    />,
  );
}
const goalEl = () => screen.queryByTestId("record-goal-target-badge-1");
const bestEl = () => screen.getByText(/26\.50/).closest("div") as HTMLElement;

describe("RecordLogEntry — 目標バッジの位置", () => {
  it("ベストと目標は同じ縦並びコンテナ (flex-col) の子で、目標がベストの直後", () => {
    renderEntry({ goalTargetTime: 28.5, best: true });
    const goal = goalEl()!;
    const best = bestEl();
    expect(goal.parentElement).toBe(best.parentElement);
    expect(best.parentElement!.className).toContain("flex-col");
    expect(best.nextElementSibling).toBe(goal);
  });

  it("ベストが無いとき、目標は縦並びコンテナの先頭 (ベストの位置) に出る", () => {
    renderEntry({ goalTargetTime: 28.5, best: false });
    const goal = goalEl()!;
    expect(goal.parentElement!.className).toContain("flex-col");
    expect(goal.parentElement!.firstElementChild).toBe(goal);
  });

  it("エントリータイムのバッジは縦並びコンテナの外にある (目標・ベストと積まれない)", () => {
    renderEntry({ goalTargetTime: 28.5, best: true, entryInfo: entry });
    const col = goalEl()!.parentElement!;
    const entryBadge = screen.getByText(/30\.50/).closest("div") as HTMLElement;
    expect(col.contains(entryBadge)).toBe(false);
  });

  it("showTitle=false で、ベストもエントリーも無く目標だけでも、ヘッダー行が残り目標が出る", () => {
    renderEntry({ goalTargetTime: 28.5, best: false, showTitle: false });
    expect(goalEl()).not.toBeNull();
    expect(goalEl()!.textContent).toContain("28.50");
  });

  it("showTitle=false で目標もベストもエントリーも無ければ、バッジは出ない", () => {
    renderEntry({ goalTargetTime: null, best: false, showTitle: false });
    expect(goalEl()).toBeNull();
  });

  it("goalTargetTime 未指定 (optional) では目標は出ないがベストは出る", () => {
    renderEntry({ best: true });
    expect(goalEl()).toBeNull();
    expect(screen.getByText(/26\.50/)).toBeInTheDocument();
  });
});
