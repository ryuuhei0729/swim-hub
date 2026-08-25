/**
 * PracticeLogClient — 保存成功後 / 戻るボタンの遷移先 (V-05, V-06)
 *
 * Sprint Contract (方式E, 2026-08-25 確定):
 *   `teams-admin/[teamId]/practices/[practiceId]/logs/_client/PracticeLogClient.tsx` は
 *   `teams-admin/` 配下からしか到達できない (サーバー側 PracticeLogDataLoader が
 *   role !== "admin" を redirect 済み) にもかかわらず、保存成功後 (:551) と
 *   戻るボタン (:561) が無条件に `/teams/${teamId}?tab=practices` (非admin向け一般
 *   メンバー画面) へ router.push している。これが「保存/戻るのたびに teams-admin
 *   ではなく teams に落ちる」というユーザー報告バグの発生源のひとつ。
 *   方式E: 戻り先は無条件に `/teams-admin/${teamId}?tab=practices` に固定する。
 *
 * このコンポーネントを直接レンダリングする既存テストはリポジトリに存在しない
 * (Planner 実測)。1252行の巨大 client component だが、危険領域とされる
 * TeamTimeInputModal 相当の重量コンポーネントは `currentMenuId` が truthy な時だけ
 * マウントされ、初期状態では非マウントであることをソース (:1059-1060) で確認した上で
 * full render を採用した。OcrScanModal / TeamVideoUploader も同様に state ガードの
 * 内側にあり初期マウントされない。ConfirmDialog は isOpen=false で常時マウントだが
 * 軽量 (isOpen=false で早期 return する実装) のため許容する。
 * これにより jsdom OOM の実績がある TimeInputModal (TimeInputModal.tsx, 前スプリント)
 * のパターンには該当しないと判断した。
 *
 * 保存フローは supabase.rpc("replace_practice_logs") を叩く。DB書き込みの正当性
 * (RPC payload の中身) はこのスプリントのスコープ外 (Sprint Contract に含まれない)
 * のため、rpc は resolve するだけの最小フェイクにとどめ、遷移先のみを検証する。
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

function renderPracticeLogClient() {
  return render(
    <PracticeLogClient
      teamId="team-1"
      practiceId="practice-1"
      practice={basePractice}
      members={members}
      existingLogs={[]}
      availableTags={[] as PracticeTag[]}
      presentUserIds={["user-1"]}
    />,
  );
}

describe("PracticeLogClient — 遷移先 (V-05: 保存成功後 / V-06: 戻るボタン)", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  it(
    "戻るボタン(ヘッダー)を押すと /teams-admin/team-1?tab=practices へ遷移する " +
      "（完全一致。/teams/team-1?tab=practices ではないことを区別できる assert）",
    () => {
      renderPracticeLogClient();

      fireEvent.click(screen.getByRole("button", { name: "practiceLog.backButton" }));

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=practices");
    },
  );

  it(
    "フッターのキャンセルボタン(data-testid)を押しても同じく " +
      "/teams-admin/team-1?tab=practices へ遷移する (:620 と :1041 の2箇所とも handleBack を" +
      "共有していることの非退行確認)",
    () => {
      renderPracticeLogClient();

      fireEvent.click(screen.getByTestId("team-practice-log-cancel-button"));

      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=practices");
    },
  );

  it(
    "デフォルトメニュー(出席者1名)のまま保存すると RPC 成功後に " +
      "/teams-admin/team-1?tab=practices へ遷移する (part 動画アップロードなし・エラーなしの" +
      "最短成功パス)",
    async () => {
      renderPracticeLogClient();

      fireEvent.click(screen.getByTestId("team-practice-log-submit-button"));

      await waitFor(() => {
        expect(mocks.rpc).toHaveBeenCalledWith(
          "replace_practice_logs",
          expect.objectContaining({ p_practice_id: "practice-1" }),
        );
      });

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=practices");
      });
    },
  );
});
