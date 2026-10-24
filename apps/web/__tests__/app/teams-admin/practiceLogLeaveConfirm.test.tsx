/**
 * PracticeLogClient — 未保存の代理入力の離脱確認と、メニュー削除の確認 (web)
 *
 * 背景 (UI レビュー照合で見つかった実害。mobile TeamPracticeLogBulkFormScreen と同じ):
 *   - 「戻る」「キャンセル」で、全員分の代理入力タイムが確認なしに消えていた。
 *   - メニューの削除ボタンが、タイム入力済みのメニューでも確認なしで消していた。
 *
 * 期待: 開いた時点から変更があれば戻る前に確認を出し、保存成功後は確認なしで戻る。
 * 削除は中身のあるメニューだけ確認する。
 *
 * モック構成は practiceLogNavigationTarget.test.tsx を流用 (useTranslations はキーを返す)。
 */

import React from "react";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";
import PracticeLogClient from "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/practices/[practiceId]/logs/_client/PracticeLogClient";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { rpc: mocks.rpc }, subscription: null }),
}));

const PRACTICES_PATH = "/teams-admin/team-1?tab=practices";

const basePractice = {
  id: "practice-1",
  user_id: "admin-1",
  team_id: "team-1",
  date: "2026-01-01",
  title: null,
  place: null,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const members = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
];

function existingLog(id: string, style: string) {
  return {
    id,
    user_id: "user-1",
    style,
    swim_category: "Swim" as const,
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: null,
    practice_log_tags: [],
    practice_times: [],
  };
}

function renderPracticeLogClient(
  existingLogs: Array<ReturnType<typeof existingLog>> = [],
) {
  return render(
    <PracticeLogClient
      teamId="team-1"
      practiceId="practice-1"
      practice={basePractice}
      members={members}
      existingLogs={existingLogs}
      availableTags={[] as PracticeTag[]}
      presentUserIds={["user-1"]}
    />,
  );
}

/** ConfirmDialog は確認ボタンにフォーカスを当てる。開いているかはダイアログ role で見る */
const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  mocks.push.mockClear();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
});

describe("PracticeLogClient 離脱確認 (web)", () => {
  it("[W-DG-1] 何も変えていなければ、戻るは確認なしで遷移する", () => {
    renderPracticeLogClient();
    fireEvent.click(screen.getByTestId("team-practice-log-cancel-button"));

    expect(dialog()).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith(PRACTICES_PATH);
  });

  it("[W-DG-2] 入力を変えたら戻る前に確認を出し、「編集を続ける」なら遷移しない", () => {
    renderPracticeLogClient();
    fireEvent.change(screen.getByTestId("team-practice-log-note-1"), { target: { value: "変更" } });

    fireEvent.click(screen.getByTestId("team-practice-log-cancel-button"));

    expect(dialog()).not.toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()!).getByRole("button", { name: "cancel" }));
    expect(dialog()).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("[W-DG-3] 確認で「戻る」を選んだときだけ遷移する", () => {
    renderPracticeLogClient();
    fireEvent.change(screen.getByTestId("team-practice-log-note-1"), { target: { value: "変更" } });

    fireEvent.click(screen.getByTestId("team-practice-log-cancel-button"));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "confirmBack" }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(PRACTICES_PATH);
  });

  it("[W-DG-5] ブラウザバックで出た確認で「戻る」を選ぶと、このページを離れて直前のページへ戻る", async () => {
    // 実際の履歴で再現する: 練習一覧 → このページ → ブラウザバック
    window.history.replaceState(null, "", PRACTICES_PATH);
    window.history.pushState(null, "", "/teams-admin/team-1/practices/practice-1/logs");
    renderPracticeLogClient();
    fireEvent.change(screen.getByTestId("team-practice-log-note-1"), { target: { value: "変更" } });

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(window.location.pathname).toBe("/teams-admin/team-1/practices/practice-1/logs");

    fireEvent.click(within(dialog()!).getByRole("button", { name: "confirmBack" }));

    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(PRACTICES_PATH));
  });

  it("[W-DG-4] 変更して保存に成功したら、確認なしで遷移する", async () => {
    renderPracticeLogClient();
    fireEvent.change(screen.getByTestId("team-practice-log-note-1"), { target: { value: "変更" } });

    fireEvent.click(screen.getByTestId("team-practice-log-submit-button"));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(PRACTICES_PATH));
    expect(dialog()).toBeNull();
  });
});

describe("PracticeLogClient メニュー削除の確認 (web)", () => {
  it("[W-RM-1] メモを入れたメニューの削除は確認を出し、キャンセルなら残る", () => {
    renderPracticeLogClient();
    fireEvent.click(screen.getByTestId("team-practice-log-add-menu-button"));
    fireEvent.change(screen.getByTestId("team-practice-log-note-2"), { target: { value: "残したい" } });

    fireEvent.click(screen.getByTestId("team-practice-log-remove-menu-2"));

    expect(dialog()).not.toBeNull();
    fireEvent.click(within(dialog()!).getByRole("button", { name: "cancel" }));
    expect(dialog()).toBeNull();
    expect(screen.getByTestId("team-practice-log-menu-2")).toBeInTheDocument();
  });

  it("[W-RM-2] 確認で削除を選ぶとそのメニューだけ消える", () => {
    renderPracticeLogClient();
    fireEvent.click(screen.getByTestId("team-practice-log-add-menu-button"));
    fireEvent.change(screen.getByTestId("team-practice-log-note-2"), { target: { value: "消す" } });

    fireEvent.click(screen.getByTestId("team-practice-log-remove-menu-2"));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "delete" }));

    expect(screen.queryByTestId("team-practice-log-menu-2")).toBeNull();
    expect(screen.getByTestId("team-practice-log-menu-1")).toBeInTheDocument();
  });

  it("[W-RM-4] 既存ログのメニューは、中身が空でも削除前に確認する (保存時に DB のログも消えるため)", () => {
    renderPracticeLogClient([existingLog("log-a", "Fr"), existingLog("log-b", "Ba")]);

    fireEvent.click(screen.getByTestId("team-practice-log-remove-menu-2"));

    expect(dialog()).not.toBeNull();
    expect(screen.getByTestId("team-practice-log-menu-2")).toBeInTheDocument();
  });

  it("[W-RM-3] 何も入力していないメニューは確認なしで消える", () => {
    renderPracticeLogClient();
    fireEvent.click(screen.getByTestId("team-practice-log-add-menu-button"));

    fireEvent.click(screen.getByTestId("team-practice-log-remove-menu-2"));

    expect(dialog()).toBeNull();
    expect(screen.queryByTestId("team-practice-log-menu-2")).toBeNull();
  });
});
