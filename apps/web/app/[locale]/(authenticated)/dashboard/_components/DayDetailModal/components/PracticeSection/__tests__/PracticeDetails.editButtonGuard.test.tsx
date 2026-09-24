/**
 * PracticeDetails 編集ボタンの isTeamPractice ガード (Sprint Contract 2 / D3 / SC1)
 *
 * Sprint Contract 検証観点:
 *   [V-W-PE01] isTeamPractice=true のとき編集ボタン(data-testid="edit-practice-button")
 *              が描画されない
 *   [V-W-PE02] isTeamPractice=false (個人練習) のときは編集ボタンが描画される
 *              (V-W-PE01 のセレクタが健全であることの証明)
 *   [V-W-PE03] isTeamPractice 省略時 (デフォルト値) は個人練習として扱われ、
 *              編集ボタンは描画される (デフォルト値の意味を固定するリグレッションガード)
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

describe("PracticeDetails 編集ボタンの isTeamPractice ガード", () => {
  it("[V-W-PE01] isTeamPractice=true のとき編集ボタンが描画されない", async () => {
    renderWithIntl({ isTeamPractice: true });

    await waitFor(() => {
      expect(screen.getByText("テスト練習")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("edit-practice-button")).toBeNull();
    expect(screen.queryByTestId("delete-practice-button")).toBeNull();
  });

  it("[V-W-PE02] isTeamPractice=false (個人練習) のとき編集ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamPractice: false });

    await waitFor(() => {
      expect(screen.getByTestId("edit-practice-button")).toBeInTheDocument();
    });
  });

  it("[V-W-PE03] isTeamPractice 省略時 (デフォルト値) は個人練習扱いで編集ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("edit-practice-button")).toBeInTheDocument();
    });
  });
});
