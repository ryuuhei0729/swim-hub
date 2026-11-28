// =============================================================================
// GoogleCalendarSyncSettings.disconnect.test.tsx
// =============================================================================
//
// Google カレンダー連携の解除で、トークンと連携フラグに加えて練習・大会の
// google_event_id も消し、Supabase のエラーを失敗として知らせる
// (web の GoogleCalendarSyncSettings と同じ。swimhub-tasks#97)。

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@swim-hub/shared/types";

const state = vi.hoisted(() => ({
  rpcError: null as unknown,
  tableErrors: {} as Record<string, unknown>,
  updates: [] as { table: string; values: unknown; column: string; value: unknown }[],
}));

// react-native-svg は vitest で読み込めないためロゴの描画を省く
vi.mock("react-native-svg", () => ({
  default: () => null,
  Path: () => null,
}));

const supabase = {
  rpc: vi.fn(async () => ({ error: state.rpcError })),
  from: (table: string) => ({
    update: (values: unknown) => ({
      eq: async (column: string, value: unknown) => {
        state.updates.push({ table, values, column, value });
        return { error: state.tableErrors[table] ?? null };
      },
    }),
  }),
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase, user: { id: "user-1" }, session: null }),
}));
vi.mock("@/hooks/useGoogleAuth", () => ({
  useGoogleAuth: () => ({ connectGoogleCalendar: vi.fn(), loading: false }),
}));
vi.mock("@/lib/google-calendar-api", () => ({ syncAllToGoogleCalendar: vi.fn() }));

import { GoogleCalendarSyncSettings } from "../GoogleCalendarSyncSettings";

const profile = {
  google_calendar_enabled: true,
  google_calendar_sync_practices: true,
  google_calendar_sync_competitions: true,
} as unknown as UserProfile;

type AlertButton = { text?: string; style?: string; onPress?: () => Promise<void> | void };

/** 確認ダイアログで「解除」を選んだことにして、その処理の完了を待つ */
const confirmDisconnect = async () => {
  const button = document.querySelector('[accessibilitylabel="連携を解除"]');
  if (!button) throw new Error("連携解除ボタンが見つからない");
  fireEvent.click(button);
  const alertMock = vi.mocked(Alert.alert);
  const buttons = alertMock.mock.calls[0]?.[2] as AlertButton[];
  const destructive = buttons.find((b) => b.style === "destructive");
  await destructive?.onPress?.();
};

describe("GoogleCalendarSyncSettings — 連携解除", () => {
  beforeEach(() => {
    state.rpcError = null;
    state.tableErrors = {};
    state.updates = [];
    vi.mocked(Alert.alert).mockClear();
    supabase.rpc.mockClear();
  });

  it("トークン・連携フラグに加えて練習と大会の google_event_id も消す", async () => {
    const onUpdate = vi.fn();
    render(<GoogleCalendarSyncSettings profile={profile} onUpdate={onUpdate} />);

    await confirmDisconnect();

    expect(supabase.rpc).toHaveBeenCalledWith("set_google_refresh_token", {
      p_user_id: "user-1",
      p_token: null,
    });
    expect(state.updates).toEqual([
      { table: "users", values: { google_calendar_enabled: false }, column: "id", value: "user-1" },
      { table: "practices", values: { google_event_id: null }, column: "user_id", value: "user-1" },
      {
        table: "competitions",
        values: { google_event_id: null },
        column: "user_id",
        value: "user-1",
      },
    ]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  it("Supabase がエラーを返したら失敗を知らせ、onUpdate を呼ばない", async () => {
    state.rpcError = { message: "rpc failed" };
    const onUpdate = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GoogleCalendarSyncSettings profile={profile} onUpdate={onUpdate} />);

    await confirmDisconnect();

    const alertMock = vi.mocked(Alert.alert);
    // 1回目は確認ダイアログ、2回目が失敗の通知
    expect(alertMock).toHaveBeenCalledTimes(2);
    expect(alertMock.mock.calls[1]?.[1]).toBe("連携解除に失敗しました。");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("予定 ID のリセットに失敗した場合も失敗を知らせる", async () => {
    state.tableErrors = { competitions: { message: "update failed" } };
    const onUpdate = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GoogleCalendarSyncSettings profile={profile} onUpdate={onUpdate} />);

    await confirmDisconnect();

    expect(vi.mocked(Alert.alert)).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
