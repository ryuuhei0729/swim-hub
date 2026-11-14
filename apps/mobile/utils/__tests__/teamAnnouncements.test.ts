// =============================================================================
// teamAnnouncements.test.ts - 利用者ビューで見せるお知らせの条件
// =============================================================================
// 利用者ビューでは「公開済み かつ 表示期間内」だけを見せる (下書きを漏らさない)。
// ホームのお知らせ (TeamAnnouncementsAPI.list の viewOnly) と同じ条件。

import { describe, expect, it } from "vitest";
import type { TeamAnnouncement } from "@swim-hub/shared/types";

import { filterVisibleAnnouncements } from "../teamAnnouncements";

const NOW = new Date("2026-11-13T12:00:00Z");

const make = (id: string, overrides: Partial<TeamAnnouncement> = {}): TeamAnnouncement => ({
  id,
  team_id: "team-1",
  title: id,
  content: "",
  created_by: null,
  is_published: true,
  start_at: null,
  end_at: null,
  created_at: null,
  updated_at: null,
  ...overrides,
});

describe("filterVisibleAnnouncements", () => {
  it("公開済みで期間指定なし・期間内のものだけを残す", () => {
    const result = filterVisibleAnnouncements(
      [
        make("open"),
        make("draft", { is_published: false }),
        make("null-published", { is_published: null }),
        make("in-period", { start_at: "2026-11-01T00:00:00Z", end_at: "2026-11-30T00:00:00Z" }),
        make("not-started", { start_at: "2026-11-20T00:00:00Z" }),
        make("ended", { end_at: "2026-11-10T00:00:00Z" }),
      ],
      NOW,
    );

    expect(result.map((a) => a.id)).toEqual(["open", "in-period"]);
  });

  it("表示期間の境界ちょうどは表示する", () => {
    const result = filterVisibleAnnouncements(
      [make("edge", { start_at: NOW.toISOString(), end_at: NOW.toISOString() })],
      NOW,
    );
    expect(result.map((a) => a.id)).toEqual(["edge"]);
  });
});
