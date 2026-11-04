// =============================================================================
// teamViewStore.test.ts - チームタブの表示状態 (最後のチーム・チームごとのタブ/管理者ビュー)
// =============================================================================
//   [TV-1] タブと管理者ビューはチームごとに独立して覚える
//   [TV-2] 利用者ビューへ切り替えると、管理者専用タブにいたら members に戻す
//   [TV-3] 管理者ビューへ切り替えるときはタブを変えない
//   [TV-4] 変更は AsyncStorage の "team-view" に保存される
//   [TV-5] 読み込み時、存在しないタブ ID・真偽値でない adminView・文字列でない lastTeamId は捨てる

import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTeamViewStore } from "../teamViewStore";

describe("useTeamViewStore", () => {
  beforeEach(() => {
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  });

  it("[TV-1] タブと管理者ビューはチームごとに独立して覚える", () => {
    const { setTab, setAdminView, selectTeam } = useTeamViewStore.getState();
    selectTeam("team-a");
    setTab("team-a", "attendance");
    setAdminView("team-a", true);
    setTab("team-b", "rankings");

    const state = useTeamViewStore.getState();
    expect(state.lastTeamId).toBe("team-a");
    expect(state.byTeam["team-a"]).toEqual({ tab: "attendance", adminView: true });
    expect(state.byTeam["team-b"]).toEqual({ tab: "rankings" });
  });

  it("[TV-2] 利用者ビューへ切り替えると、管理者専用タブ (groups) にいたら members に戻す", () => {
    const { setTab, setAdminView } = useTeamViewStore.getState();
    setAdminView("team-a", true);
    setTab("team-a", "groups");
    setAdminView("team-a", false);

    expect(useTeamViewStore.getState().byTeam["team-a"]).toEqual({
      tab: "members",
      adminView: false,
    });
  });

  it("[TV-2] 利用者ビューへ切り替えても、全員向けのタブ (practices) はそのまま", () => {
    const { setTab, setAdminView } = useTeamViewStore.getState();
    setAdminView("team-a", true);
    setTab("team-a", "practices");
    setAdminView("team-a", false);

    expect(useTeamViewStore.getState().byTeam["team-a"]?.tab).toBe("practices");
  });

  it("[TV-3] 管理者ビューへ切り替えるときはタブを変えない (未設定なら未設定のまま)", () => {
    useTeamViewStore.getState().setAdminView("team-a", true);
    expect(useTeamViewStore.getState().byTeam["team-a"]).toEqual({
      tab: undefined,
      adminView: true,
    });
  });

  it('[TV-4] 変更は AsyncStorage の "team-view" に保存される', () => {
    useTeamViewStore.getState().selectTeam("team-a");

    const calls = vi.mocked(AsyncStorage.setItem).mock.calls;
    const last = calls[calls.length - 1];
    expect(last?.[0]).toBe("team-view");
    expect(JSON.parse(String(last?.[1])).state).toEqual({ lastTeamId: "team-a", byTeam: {} });
  });

  it("[TV-5] 読み込み時、存在しないタブ ID・真偽値でない adminView・文字列でない lastTeamId は捨てる", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        state: {
          lastTeamId: 123,
          byTeam: {
            "team-a": { tab: "removed-tab", adminView: "yes" },
            "team-b": { tab: "attendance", adminView: true },
          },
        },
      }),
    );

    await useTeamViewStore.persist.rehydrate();

    const state = useTeamViewStore.getState();
    expect(state.lastTeamId).toBeNull();
    expect(state.byTeam["team-a"]).toEqual({ tab: undefined, adminView: false });
    expect(state.byTeam["team-b"]).toEqual({ tab: "attendance", adminView: true });
  });
});
