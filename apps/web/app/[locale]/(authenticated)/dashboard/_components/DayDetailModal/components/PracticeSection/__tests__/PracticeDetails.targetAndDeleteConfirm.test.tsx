/**
 * PracticeDetails: メニュー1件表示 (targetLogId) とメニュー削除前の確認ダイアログ
 *
 * 2026-11-28 に mobile に揃えた仕様 (swimhub-tasks #77 / #79):
 *   - 練習の一覧カードから開いたとき (targetLogId 指定) は押したメニュー1件だけを表示する。
 *     未指定 (ダッシュボードの日別詳細) はその練習の全メニューを出す
 *   - メニューの削除ボタンを押したら、すぐ削除せず確認ダイアログを出す。キャンセルなら削除しない
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/__tests__/helpers/dashboardQueryTestUtils";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { PracticeDetails } from "../PracticeDetails";
import type { PracticeDetailsProps } from "../../../types";

function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => chain,
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

const makeLog = (id: string, distance: number) => ({
  id,
  user_id: "user-1",
  practice_id: "practice-1",
  style: "Fr",
  swim_category: "Swim",
  rep_count: 4,
  set_count: 1,
  distance,
  circle: 90,
  note: null,
  practice_times: [],
  practice_log_tags: [],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
});

function createFakeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: () =>
      makeChain({
        data: {
          id: "practice-1",
          user_id: "user-1",
          date: "2026-08-01",
          title: "テスト練習",
          place: "テストプール",
          practice_logs: [makeLog("log-a", 100), makeLog("log-b", 50)],
          image_paths: [],
        },
        error: null,
      }),
  };
}

let fakeSupabase: ReturnType<typeof createFakeSupabase>;

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

const renderWithIntl = (props: Partial<PracticeDetailsProps>) => {
  fakeSupabase = createFakeSupabase();

  return renderWithQueryClient(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <PracticeDetails
        practiceId="practice-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPracticeLog={vi.fn()}
        onEditPracticeLog={vi.fn()}
        onDeletePracticeLog={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
};

describe("PracticeDetails - メニュー1件表示 (targetLogId)", () => {
  it("targetLogId を渡すと、そのメニューだけが表示され同じ練習の他のメニューは出ない", async () => {
    renderWithIntl({ targetLogId: "log-b" });

    await waitFor(() => {
      expect(screen.getByTestId("practice-log-item-1")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("practice-log-item-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("practice-log-item-1").textContent).toContain("50");
    expect(screen.getByTestId("practice-log-item-1").textContent).not.toContain("100");
  });

  it("targetLogId を渡さない (ダッシュボードの日別詳細) ときは全メニューが表示される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("practice-log-item-2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("practice-log-item-1")).toBeInTheDocument();
  });
});

describe("PracticeDetails - メニュー削除前の確認ダイアログ", () => {
  it("削除ボタンを押しただけでは削除されず、確認ダイアログが出る。キャンセルすると削除されない", async () => {
    const user = userEvent.setup();
    const onDeletePracticeLog = vi.fn();
    renderWithIntl({ targetLogId: "log-a", onDeletePracticeLog });

    await user.click(await screen.findByTestId("delete-practice-log-button"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/この練習メニューを削除しますか/)).toBeInTheDocument();
    expect(onDeletePracticeLog).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDeletePracticeLog).not.toHaveBeenCalled();
  });

  it("確認ダイアログで削除を押すと、そのメニューの ID で onDeletePracticeLog が呼ばれる", async () => {
    const user = userEvent.setup();
    const onDeletePracticeLog = vi.fn();
    renderWithIntl({ targetLogId: "log-b", onDeletePracticeLog });

    await user.click(await screen.findByTestId("delete-practice-log-button"));
    await user.click(screen.getByTestId("confirm-dialog-confirm-button"));

    expect(onDeletePracticeLog).toHaveBeenCalledTimes(1);
    expect(onDeletePracticeLog).toHaveBeenCalledWith("log-b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
