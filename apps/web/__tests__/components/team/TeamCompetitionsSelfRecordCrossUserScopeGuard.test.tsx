/**
 * TeamCompetitions — 自己記録導線: 他メンバーの記録の過剰取得防止 (PM 裁定2 / C3)。
 *
 * 背景: 「自分の記録を追加」導線は isAdmin ガードが無く一般メンバーも操作できる。
 * handleOpenSelfRecord のオンデマンド取得クエリは `records` テーブルを直接クエリし、
 * `.eq("competition_id", competition.id).eq("user_id", user.id)` の2条件で
 * サーバー側に絞り込みを要求する (C3 再実装後の最終形。PM実測 TeamCompetitions.tsx:522)。
 * これにより他メンバーの note/video_path/split_times 等の私的データが一切
 * ネットワークレスポンスに含まれない。
 *
 * (旧実装は `records!inner` の埋め込みリレーションに対する `.eq("records.user_id",
 * user.id)` 一本のみで、competition_id 側は order+range(0,49) による直近50件制限に
 * 依存していた。この方式は「直近50大会の取りこぼし」バグ
 * (`TeamCompetitionsSelfRecordBeyondRecentCompetitionsGuard.test.tsx`) を生んでいたため
 * records テーブル直クエリ + 2条件に再実装された。)
 *
 * PM 裁定2の要点: 「クライアント側の多重防御フィルタ (`ownRecords = records.filter(...)`)
 * で結果的に他人のデータが画面に出ていないだけ」を PASS にしてはならない。C3 の本質は
 * 「レスポンスに他メンバーの note/video_path/split_times が含まれること」自体であり、
 * クライアント側フィルタの有無に関わらず、サーバーに正しい絞り込み条件を要求しているかを
 * 直接検証する必要がある。
 *
 * このテストは:
 * 1. supabase モックが記録した実際の `.eq()` 呼び出し (`eqCalls`) を検査し、
 *    `competition_id` と `user_id` の**両方**が実際にサーバーへ渡っていることを
 *    確認する (クライアント側フィルタの有無に依存しない検証)。2条件とも pin して
 *    おくことで、将来また埋め込みフィルタや order+range 方式に戻された場合や、
 *    どちらか一方の条件が抜け落ちた場合に検出できる。
 * 2. (multiple defense として) UI 上にも他メンバーの note が一切表示されないことを
 *    確認する。
 *
 * ミューテーション実証 (QA 実施時に検証、復元は shasum で確認済み):
 * - `.eq("user_id", user.id)` を production から一時的に取り除くと (1) が赤くなる
 * - `.eq("competition_id", competition.id)` を一時的に取り除くと (1) が赤くなる
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  replaceSplitTimes: vi.fn(),
  getStyles: vi.fn(),
  entryApiCtor: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createRecord: mocks.createRecord,
    createSplitTimes: mocks.createSplitTimes,
    updateRecord: mocks.updateRecord,
    replaceSplitTimes: mocks.replaceSplitTimes,
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: mocks.getStyles,
  })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: mocks.entryApiCtor.mockImplementation(() => ({
    getEntriesByCompetition: vi.fn(),
    getEntriesByUser: vi.fn(),
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

const STYLE_FR50 = { id: 2, name_jp: "50m自由形", distance: 50 };

let currentAuthMock: {
  user: { id: string };
  supabase: ReturnType<typeof buildSupabaseCompetitionsMock>["supabase"];
  subscription: null;
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

const openSelfRecordForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText("県大会");
  await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
  await screen.findByTestId("record-form-modal");
};

describe("TeamCompetitions — 他メンバー記録の過剰取得防止 (C3, サーバー側スコープ検証)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.replaceSplitTimes.mockResolvedValue([]);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);
  });

  it(
    "[C3] 同じ大会に member-1/member-2 両方の記録がある場合、" +
      "サーバーへの .eq() 条件で自分(member-1)の user_id に絞り込みを要求している" +
      "(クライアント側フィルタの有無に依存しない検証)",
    async () => {
      const row = {
        id: "competition-1",
        user_id: "member-1",
        team_id: "team-1",
        title: "県大会",
        date: "2026-08-01",
        place: "県営プール",
        entry_status: "before",
        note: null,
        created_at: "2026-07-20T00:00:00Z",
        created_by: "member-1",
        users: { name: "選手A" },
        created_by_user: null,
        entries: [
          { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
        ],
        // 同一大会・同一種目に member-1 (本人) と member-2 (他メンバー) 両方の
        // 代理入力済み記録が存在する
        records: [
          {
            id: "record-member-1",
            time: 30.5,
            user_id: "member-1",
            style_id: 2,
            is_relaying: false,
            note: "本人メモ",
            reaction_time: null,
            video_path: null,
            video_thumbnail_path: null,
            users: { name: "選手A" },
          },
          {
            id: "record-member-2",
            time: 31.2,
            user_id: "member-2",
            style_id: 2,
            is_relaying: false,
            note: "他人の非公開メモ",
            reaction_time: null,
            video_path: "videos/member-2-private.mp4",
            video_thumbnail_path: "thumbnails/member-2-private.jpg",
            users: { name: "選手B" },
          },
        ],
      };

      const { supabase, eqCalls } = buildSupabaseCompetitionsMock([row]);
      currentAuthMock = { user: { id: "member-1" }, supabase, subscription: null };

      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-time-1");

      // (1) 主検証: サーバーへの絞り込み条件そのものを検査する。
      // クライアント側の多重防御フィルタが機能しているかどうかに関わらず、
      // 「competition_id と user_id の両方で絞り込むリクエストを送っているか」を
      // 直接確認する (どちらか一方が抜けても検出できるよう両方 pin する)。
      expect(eqCalls).toContainEqual({ column: "competition_id", value: "competition-1" });
      expect(eqCalls).toContainEqual({ column: "user_id", value: "member-1" });

      // (2) 従属検証 (multiple defense): 画面上にも他メンバーのメモが出現しない。
      const noteInput = screen.getByTestId("record-note-1");
      expect(noteInput).toHaveValue("本人メモ");
      expect(noteInput).not.toHaveValue("他人の非公開メモ");
      expect(screen.queryByText("他人の非公開メモ")).not.toBeInTheDocument();
    },
  );
});
