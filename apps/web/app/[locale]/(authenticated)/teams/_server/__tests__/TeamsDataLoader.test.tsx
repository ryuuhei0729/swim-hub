/**
 * TeamsDataLoader — チーム一覧の prefetch と SSR/CSR のキー一致
 *
 *  - サーバーは teamKeys.list() にチーム一覧を取得して HydrationBoundary で渡す
 *  - クライアントの useTeamsQuery が同じキーのデータを使う (取り直さない) ことを、
 *    実際にハイドレートして確認する
 *  - 取得失敗は従来どおりエラー (error.tsx) に任せる (「所属チームなし」と誤表示しない)
 */
import React, { type ReactElement } from "react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { renderWithQueryClient } from "@/__tests__/helpers/dashboardQueryTestUtils";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getMyTeams: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mocks.getServerUser,
  createAuthenticatedServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@apps/shared/api/teams/core", () => ({
  TeamCoreAPI: class {
    getMyTeams = mocks.getMyTeams;
  },
}));

vi.mock("../../_client/TeamsClient", () => ({
  default: () => null,
}));

import TeamsDataLoader, { TEAMS_LIST_QUERY_KEY } from "../TeamsDataLoader";

type LoaderElement = ReactElement<{ state: DehydratedState }>;

const TeamsProbe = ({ onTeams }: { onTeams: (ids: string[]) => void }) => {
  const { teams } = useTeamsQuery({} as unknown as SupabaseClient, { enableRealtime: false });
  onTeams(teams.map((m) => m.team_id));
  return null;
};

describe("TeamsDataLoader — チーム一覧の prefetch と SSR/CSR のキー一致", () => {
  beforeEach(() => {
    mocks.getServerUser.mockResolvedValue({ id: "user-1" });
    mocks.getMyTeams.mockReset().mockResolvedValue([{ id: "m-1", team_id: "team-1" }]);
  });

  it("prefetch のキーは useTeamsQuery のキー (teamKeys.list()) と同一", () => {
    expect(TEAMS_LIST_QUERY_KEY).toEqual(teamKeys.list());
  });

  it("ハイドレートしたデータを useTeamsQuery がそのまま使い、クライアントで取り直さない", async () => {
    const element = (await TeamsDataLoader()) as LoaderElement;

    const { queries } = element.props.state;
    expect(queries).toHaveLength(1);
    expect(queries[0]!.queryKey).toEqual(teamKeys.list());
    expect(mocks.getMyTeams).toHaveBeenCalledTimes(1);

    let teamIds: string[] = [];
    renderWithQueryClient(
      <HydrationBoundary state={element.props.state}>
        <TeamsProbe onTeams={(ids) => (teamIds = ids)} />
      </HydrationBoundary>,
    );

    await waitFor(() => expect(teamIds).toEqual(["team-1"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.getMyTeams).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗したら従来どおり例外を投げる (retry:false で1回だけ試す)", async () => {
    mocks.getMyTeams.mockRejectedValue(new Error("network down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(TeamsDataLoader()).rejects.toThrow("Failed to fetch teams: network down");
    expect(mocks.getMyTeams).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("チーム情報取得エラー:", expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it("未ログインなら取得しない", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const element = (await TeamsDataLoader()) as LoaderElement;

    expect(mocks.getMyTeams).not.toHaveBeenCalled();
    expect(element.props.state.queries).toHaveLength(0);
  });
});
