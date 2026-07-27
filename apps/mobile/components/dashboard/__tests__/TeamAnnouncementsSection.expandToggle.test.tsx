/**
 * TeamAnnouncementsSection 本文展開トグル テスト (Sprint Contract: 全文表示/省略)
 *
 * Sprint Contract 検証観点 (コンポーネントレベルで自動検証できる範囲):
 *   [V-4] 短い本文 (2行に収まる想定) にはトグルが表示されない (デフォルト状態)
 *   [構造契約] 可視本文 Text (`announcement-content-<id>`) と非表示計測用 Text
 *             (`announcement-content-measure-<id>`) が両方描画される (レイアウト
 *             ジャンク根治のための「常時クランプ + フロー外計測」構造の存在確認)
 *   [回帰] content prop が変わっても再レンダーがクラッシュしない
 *
 * i18n キー (showMore/showLess) の存在検証は本ファイルの対象外とし、
 * apps/web/__tests__/i18n/messages-announcement-expand-toggle.test.ts に集約する
 * (キー存在チェックはコンポーネントの描画に依存させず、messages JSON を直接検証する方が
 * トートロジーにならず確実なため)。
 *
 * 【重要な制約: onTextLayout は本環境では検証不能】
 * apps/mobile/__mocks__/react-native.ts の Text モックは onTextLayout を
 * 実際には発火させない (jsdom は実レイアウトを計算しないため、行数計測に基づく
 * 切り詰め検出そのものをこの環境で再現する手段がない)。そのため
 * 「2行を超える本文でトグルが実際に出現するか」「展開/折りたたみが実機で
 * 正しく動くか」「content 変更後に計測 Text が再判定するか」は本テストの
 * 対象外とし、Verification Checklist の [V-M5]〜[V-M7] (Expo Go / シミュレータ
 * での実機確認必須項目) に切り出す。切り詰め判定そのものの純粋ロジックは
 * apps/mobile/utils/__tests__/announcementTruncation.test.ts で検証する
 * (ただし同ファイルも onTextLayout 配線そのものは検証できない、という同じ限界を持つ)。
 *
 * 【可視 Text の特定方法について】
 * 可視本文と非表示計測用 Text は同一の content 文字列を描画するため、
 * `getByText(content)` は2要素にヒットして失敗する
 * (`getMultipleElementsFoundError`)。可視 Text は `testID` で一意に特定する。
 *
 * 【testID クエリに関する注意】
 * apps/mobile/__mocks__/react-native.ts の `Text` は RN の `testID` prop を
 * そのまま DOM 属性としてスプレッドするため、実際の属性名は `data-testid` では
 * なく `testid` (小文字、HTML の属性名正規化による) になる。
 * `@testing-library/dom` の `getByTestId` は既定で `data-testid` 属性のみを見る
 * ため使えない (`testIdAttribute` の再設定は本ファイルの編集範囲外)。
 * よって本ファイルでは `container.querySelector('[testid="..."]')` で
 * 直接クエリする。
 */

import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamAnnouncement } from "@apps/shared/types/team";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  announcements: [] as TeamAnnouncement[],
}));

vi.mock("@apps/shared/hooks/queries/announcements", () => ({
  useTeamAnnouncementsQuery: () => ({ data: mocks.announcements }),
}));

vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: [] }),
  useUnsubmittedEntriesQuery: () => ({ data: [] }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useDateLocale", () => ({
  useDateLocale: () => undefined,
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));

import { TeamAnnouncementsSection } from "../TeamAnnouncementsSection";

function makeAnnouncement(overrides: Partial<TeamAnnouncement> = {}): TeamAnnouncement {
  return {
    id: "ann-1",
    team_id: "team-1",
    title: "お知らせ",
    content: "短い本文",
    created_by: "user-1",
    is_published: true,
    start_at: null,
    end_at: null,
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

const APPROVED_TEAM = {
  team_id: "team-1",
  status: "approved",
  is_active: true,
  role: "member",
  teams: { name: "テストチーム" },
} as unknown as TeamMembershipWithUser;

function queryByRnTestId(container: HTMLElement, testId: string): HTMLElement | null {
  return container.querySelector(`[testid="${testId}"]`);
}

describe("TeamAnnouncementsSection 展開トグル", () => {
  it("[V-4] 短い本文にはトグルが表示されない (可視 Text は testID で特定する)", () => {
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: "短い本文" })];
    const { container } = render(<TeamAnnouncementsSection teams={[APPROVED_TEAM]} />);

    // 可視本文と非表示計測用 Text が同じ content を描画するため、
    // getByText だと二重ヒットする。可視 Text は testID で一意に取得する。
    const visibleContent = queryByRnTestId(container, "announcement-content-ann-1");
    expect(visibleContent?.textContent).toBe("短い本文");
    expect(queryByRnTestId(container, "announcement-toggle-ann-1")).toBeNull();
  });

  it("[構造契約] 可視 Text と非表示計測用 Text がそれぞれ testID 付きで描画される", () => {
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: "短い本文" })];
    const { container } = render(<TeamAnnouncementsSection teams={[APPROVED_TEAM]} />);

    expect(queryByRnTestId(container, "announcement-content-ann-1")).toBeTruthy();
    expect(queryByRnTestId(container, "announcement-content-measure-ann-1")).toBeTruthy();
    // 両方とも同じ content を保持する (フォント指標を一致させるための構造上の前提)
    expect(queryByRnTestId(container, "announcement-content-measure-ann-1")?.textContent).toBe(
      "短い本文",
    );
  });

  it("[回帰] content prop が変わっても再レンダーがクラッシュせず、可視 Text の内容が更新される", () => {
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: "最初の本文" })];
    const { container, rerender } = render(<TeamAnnouncementsSection teams={[APPROVED_TEAM]} />);
    expect(queryByRnTestId(container, "announcement-content-ann-1")?.textContent).toBe(
      "最初の本文",
    );

    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: "編集後の短い本文" })];
    expect(() =>
      rerender(<TeamAnnouncementsSection teams={[APPROVED_TEAM]} />),
    ).not.toThrow();
    expect(queryByRnTestId(container, "announcement-content-ann-1")?.textContent).toBe(
      "編集後の短い本文",
    );
  });
});
