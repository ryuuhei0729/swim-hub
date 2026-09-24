/**
 * PracticeDetails 削除ボタンの isTeamPractice ガード (Sprint Contract D3 / SC1)
 *
 * Sprint Contract 検証観点:
 *   [V-W-P01] isTeamPractice=true のとき削除ボタン(data-testid="delete-practice-button")
 *             が描画されない
 *   [V-W-P02] isTeamPractice=false (個人練習) のときは従来通り削除ボタンが描画される
 *             (V-W-P01 のセレクタが健全であることの証明)
 *   [V-W-P03] isTeamPractice を省略 (デフォルト値) したときは個人練習として扱われ、
 *             削除ボタンは描画される (デフォルト値の意味を固定するリグレッションガード)
 */

import { render, screen, waitFor } from "@testing-library/react";
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

function createFakeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: () =>
      makeChain({
        data: {
          id: "practice-1",
          date: "2026-08-01",
          title: "テスト練習",
          place: "テストプール",
          practice_logs: [],
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

  return render(
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

describe("PracticeDetails 削除ボタンの isTeamPractice ガード", () => {
  it("[V-W-P01] isTeamPractice=true のとき削除ボタンが描画されない", async () => {
    renderWithIntl({ isTeamPractice: true });

    await waitFor(() => {
      expect(screen.getByText("テスト練習")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("delete-practice-button")).toBeNull();
  });

  it("[V-W-P02] isTeamPractice=false (個人練習) のとき削除ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamPractice: false });

    await waitFor(() => {
      expect(screen.getByTestId("delete-practice-button")).toBeInTheDocument();
    });
  });

  it("[V-W-P03] isTeamPractice 省略時 (デフォルト値) は個人練習扱いで削除ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("delete-practice-button")).toBeInTheDocument();
    });
  });
});
