/**
 * AnnouncementList 本文インライン展開トグル テスト (Sprint Contract: 全文表示/省略)
 *
 * 背景: ダッシュボード/チーム詳細のお知らせ本文が `line-clamp-2` で常に2行に
 * 切り詰められ、長文が読めない。切り詰め検出 (ref.scrollHeight > ref.clientHeight)
 * に応じて「…全文を表示」を出し、押下でアイテム単位に全文展開する。
 *
 * Sprint Contract 検証観点:
 *   [V-1] 2行を超える本文には「…全文を表示」トグルが表示される
 *   [V-2] トグル押下で本文が全文展開され、ボタンラベルが「省略」に変わる
 *   [V-3] 「省略」押下で2行表示に戻る (line-clamp-2 復元)
 *   [V-4] 2行以内に収まる本文にはトグル自体が表示されない
 *   [V-5] 複数アイテムのうち1件を展開しても他アイテムの表示状態に影響しない
 *   [V-6] viewOnly=false (チーム詳細) の既存編集/削除ボタンに回帰がない
 *
 * 【jsdom 実測に関する重要な注意】
 * jsdom は実レイアウトを計算しないため `scrollHeight`/`clientHeight` は常に 0 になり、
 * 「本当に2行を超えているか」を自然な描画では判定できない。本テストでは
 * `HTMLElement.prototype` の `scrollHeight`/`clientHeight` getter を一時的に上書きし、
 * 本文の文字数に応じて疑似的に切り詰め状態を再現する (afterAll で復元)。
 * これはあくまで単体テスト用のシミュレーションであり、実際のブラウザ幅・フォント・
 * 折り返しに依存する「本物の2行判定」は Playwright 実機検証で必ず確認すること
 * (QA Report の「実機検証」項目を参照)。
 *
 * NOTE: 本スプリント未実装時点ではトグル要素自体が存在しないため、
 * [V-1]〜[V-5] は意図的に赤くなる (Developer 実装のガイドとして機能する)。
 * [V-6] は既存機能のため実装前でも緑のはずだが、切り詰めロジック追加時に
 * 既存アクション行のレイアウトを壊していないかの回帰チェックとして残す。
 *
 * 【Developer への提案】
 * 切り詰め判定 (isTruncated) とトグル表示可否 (showToggle) は DOM 計測から独立した
 * 純粋な状態遷移として切り出せる。例えば
 *   shouldShowToggle(isTruncated: boolean, isExpanded: boolean): boolean
 * のような純関数にしておくと、jsdom の計測制約を受けずに単体テストできる。
 * トグル要素には `data-testid={`announcement-toggle-${announcement.id}`}` を
 * 付与すること (アイテム単位の独立性をテストで検証するため)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { TeamAnnouncement } from "@apps/shared/types/team";

const mocks = vi.hoisted(() => ({
  announcements: [] as TeamAnnouncement[],
  deleteMutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/announcements", () => ({
  useTeamAnnouncementsQuery: () => ({
    data: mocks.announcements,
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
  }),
  useDeleteTeamAnnouncementMutation: () => ({
    mutateAsync: mocks.deleteMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {} }),
}));

import { AnnouncementList } from "@/components/team/AnnouncementList";

// ---------------------------------------------------------------------------
// scrollHeight/clientHeight 疑似オーバーライド
// 本文の文字数が SHORT_CONTENT より長ければ「切り詰められている」ものとして扱う。
// ---------------------------------------------------------------------------
const TRUNCATION_THRESHOLD = 40;
let originalScrollHeight: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;

beforeEach(() => {
  mocks.announcements = [];
  mocks.deleteMutateAsync.mockReset();
  mocks.refetch.mockReset();

  originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return (this.textContent?.length ?? 0) > TRUNCATION_THRESHOLD ? 100 : 20;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 20;
    },
  });
});

afterAll(() => {
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
  }
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  }
});

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

const LONG_CONTENT =
  "これは2行を明確に超える長さの本文です。".repeat(4); // TRUNCATION_THRESHOLD を確実に超える
const SHORT_CONTENT = "短い本文";

describe("AnnouncementList 展開トグル", () => {
  it("[V-1] 長文には「…全文を表示」トグルが表示される", async () => {
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: LONG_CONTENT })];
    render(<AnnouncementList teamId="team-1" isAdmin={false} viewOnly />);

    await waitFor(() => {
      expect(screen.getByTestId("announcement-toggle-ann-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent(/全文を表示/);
  });

  it("[V-2] トグル押下で全文展開され、ラベルが「省略」に変わる", async () => {
    const user = userEvent.setup();
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: LONG_CONTENT })];
    render(<AnnouncementList teamId="team-1" isAdmin={false} viewOnly />);

    const toggle = await screen.findByTestId("announcement-toggle-ann-1");
    await user.click(toggle);

    expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent(/省略/);
    expect(screen.getByText(LONG_CONTENT)).not.toHaveClass("line-clamp-2");
  });

  it("[V-3] 「省略」押下で2行表示 (line-clamp-2) に戻る", async () => {
    const user = userEvent.setup();
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: LONG_CONTENT })];
    render(<AnnouncementList teamId="team-1" isAdmin={false} viewOnly />);

    const toggle = await screen.findByTestId("announcement-toggle-ann-1");
    await user.click(toggle); // 展開
    await user.click(toggle); // 折りたたみ

    expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent(/全文を表示/);
    expect(screen.getByText(LONG_CONTENT)).toHaveClass("line-clamp-2");
  });

  it("[V-4] 2行以内に収まる本文にはトグルが表示されない", async () => {
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: SHORT_CONTENT })];
    render(<AnnouncementList teamId="team-1" isAdmin={false} viewOnly />);

    await screen.findByText(SHORT_CONTENT);
    expect(screen.queryByTestId("announcement-toggle-ann-1")).not.toBeInTheDocument();
  });

  it("[V-5] 複数アイテムの展開状態はアイテムごとに独立する", async () => {
    const user = userEvent.setup();
    mocks.announcements = [
      makeAnnouncement({ id: "ann-1", content: LONG_CONTENT }),
      makeAnnouncement({ id: "ann-2", content: LONG_CONTENT }),
    ];
    render(<AnnouncementList teamId="team-1" isAdmin={false} viewOnly />);

    const toggle1 = await screen.findByTestId("announcement-toggle-ann-1");
    await user.click(toggle1);

    expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent(/省略/);
    expect(screen.getByTestId("announcement-toggle-ann-2")).toHaveTextContent(/全文を表示/);
  });

  it("[V-6] viewOnly=false での既存編集/削除ボタンは回帰しない (既存機能)", async () => {
    const onEdit = vi.fn();
    mocks.announcements = [makeAnnouncement({ id: "ann-1", content: SHORT_CONTENT })];
    render(
      <AnnouncementList teamId="team-1" isAdmin onEdit={onEdit} viewOnly={false} />,
    );

    await screen.findByText(SHORT_CONTENT);
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });
});
