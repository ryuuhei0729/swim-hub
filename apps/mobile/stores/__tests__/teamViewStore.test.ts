// =============================================================================
// teamViewStore.test.ts - チームタブの表示状態 (最後のチーム・チームごとのタブ/管理者ビュー)
// =============================================================================
//   [TV-1] タブと管理者ビューはチームごとに独立して覚える
//   [TV-2] 利用者ビューへ切り替えてもタブは変えない (管理者専用タブが無いため)
//   [TV-3] 管理者ビューへ切り替えるときはタブを変えない
//   [TV-4] 変更は AsyncStorage の "team-view" に保存される
//   [TV-5] 読み込み時、存在しないタブ ID・真偽値でない adminView・文字列でない lastTeamId は捨てる
//   [TV-6] 読み込み時、旧タブ構成の ID は対応する新しいタブへ読み替える

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
    setTab("team-b", "others");

    const state = useTeamViewStore.getState();
    expect(state.lastTeamId).toBe("team-a");
    expect(state.byTeam["team-a"]).toEqual({ tab: "attendance", adminView: true });
    expect(state.byTeam["team-b"]).toEqual({ tab: "others" });
  });

  it.each(["members", "schedule", "attendance", "others"] as const)(
    "[TV-2] 利用者ビューへ切り替えても、%s タブはそのまま",
    (tab) => {
      const { setTab, setAdminView } = useTeamViewStore.getState();
      setAdminView("team-a", true);
      setTab("team-a", tab);
      setAdminView("team-a", false);

      expect(useTeamViewStore.getState().byTeam["team-a"]).toEqual({ tab, adminView: false });
    },
  );

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

  it("[TV-6] 読み込み時、旧タブ構成の ID は対応する新しいタブへ読み替える", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        state: {
          lastTeamId: "team-a",
          byTeam: {
            "team-a": { tab: "practices", adminView: true },
            "team-b": { tab: "rankings", adminView: false },
            "team-c": { tab: "groups", adminView: true },
            "team-d": { tab: "settings" },
          },
        },
      }),
    );

    await useTeamViewStore.persist.rehydrate();

    const { byTeam } = useTeamViewStore.getState();
    expect(byTeam["team-a"]).toEqual({ tab: "schedule", adminView: true });
    expect(byTeam["team-b"]).toEqual({ tab: "others", adminView: false });
    expect(byTeam["team-c"]).toEqual({ tab: "members", adminView: true });
    expect(byTeam["team-d"]).toEqual({ tab: "members", adminView: false });
  });
});
