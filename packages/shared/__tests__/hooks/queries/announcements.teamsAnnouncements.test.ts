// @vitest-environment jsdom
/**
 * useTeamsAnnouncementsQuery (モバイルのホームの「お知らせ」で、所属チーム全部の公開中のお知らせを取る)
 * - チームごとに公開中 (viewOnly) の一覧を取り、teamIds の順で返す
 * - useTeamAnnouncementsQuery (viewOnly) と同じ queryKey を使い、announcementKeys.lists() の invalidate で取り直す
 */
import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamAnnouncementsAPI } from "../../../api/teams";
import { useTeamsAnnouncementsQuery } from "../../../hooks/queries/announcements";
import { announcementKeys } from "../../../hooks/queries/keys";
import { renderQueryHook } from "../../utils/test-utils";
import type { TeamAnnouncement } from "../../../types";

function announcement(id: string, teamId: string): TeamAnnouncement {
  return {
    id,
    team_id: teamId,
    title: id,
    content: "",
    created_by: "user-1",
    is_published: true,
    start_at: null,
    end_at: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

function fakeApi() {
  const list = vi.fn(async (teamId: string) => [announcement(`${teamId}-a`, teamId)]);
  return { list, api: { list } as unknown as TeamAnnouncementsAPI };
}

describe("useTeamsAnnouncementsQuery", () => {
  it("チームごとに公開中のお知らせを取り、teamIds の順で返す", async () => {
    const { list, api } = fakeApi();
    const { result } = renderQueryHook(() =>
      useTeamsAnnouncementsQuery({} as SupabaseClient, ["team-2", "team-1"], api),
    );

    await waitFor(() =>
      expect(result.current).toEqual([
        { teamId: "team-2", announcements: [announcement("team-2-a", "team-2")] },
        { teamId: "team-1", announcements: [announcement("team-1-a", "team-1")] },
      ]),
    );
    expect(list).toHaveBeenCalledWith("team-2", true);
    expect(list).toHaveBeenCalledWith("team-1", true);
  });

  it("取得前は各チーム空の一覧を返す。チームが無ければ空配列", () => {
    const { api } = fakeApi();
    const { result } = renderQueryHook(() =>
      useTeamsAnnouncementsQuery({} as SupabaseClient, [], api),
    );
    expect(result.current).toEqual([]);
  });

  it("useTeamAnnouncementsQuery (viewOnly) と同じ queryKey で、lists() の invalidate で取り直す", async () => {
    const { list, api } = fakeApi();
    const { result, queryClient } = renderQueryHook(() =>
      useTeamsAnnouncementsQuery({} as SupabaseClient, ["team-1"], api),
    );
    await waitFor(() => expect(result.current[0]?.announcements).toHaveLength(1));
    expect(queryClient.getQueryData(announcementKeys.list("team-1", true))).toHaveLength(1);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: announcementKeys.lists() });
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
