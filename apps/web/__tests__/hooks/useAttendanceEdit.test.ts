import { act } from "@testing-library/react";
import { renderHookWithI18n as renderHook } from "../utils/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { TeamEvent } from "@swim-hub/shared/types/calendar";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { useAttendanceEdit } from "../../components/team/monthly-attendance/hooks/useAttendanceEdit";

// =============================================================================
// 修正3-A 検証: useAttendanceEdit 既存更新経路のマーク生成撤去 + API 委譲
//
// 観点 (Sprint Contract V-04, V-05, V-06):
//  - 既存出欠の更新は raw note のまま bulkUpdateMyAttendances に渡す
//    (クライアント側で「締切後編集」マークを付与しない = 二重生成しない)
//  - 新規 insert 経路では従来どおりクライアント側でマークを付与する
//  - closed/open を問わず更新経路の挙動は撤去前と同一 (API がマークを担当)
//
// 注意: bulkUpdateMyAttendances 内部の addEditMark/getEditMark のロジック自体は
//       apps/shared 側の attendance-edit-mark.test.ts で検証済み。本テストは
//       「クライアントが API に何を渡すか / insert に何を書くか」のみを検証する。
// =============================================================================

const TEAM_ID = "team-1";
const USER_ID = "user-1";

// supabase.auth.getUser() と team_attendance.insert() をモックするヘルパー
const createMockSupabase = () => {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } });

  const client = {
    from: fromMock,
    auth: { getUser: getUserMock },
  } as unknown as SupabaseClient;

  return { client, insertMock, fromMock, getUserMock };
};

const createMockAPI = () => {
  const bulkUpdateMyAttendances = vi.fn().mockResolvedValue([]);
  const api = { bulkUpdateMyAttendances } as unknown as AttendanceAPI;
  return { api, bulkUpdateMyAttendances };
};

// 練習イベント fixture
const makeEvent = (
  id: string,
  attendance_status: "open" | "closed",
  date = "2099-12-31",
): TeamEvent =>
  ({
    id,
    type: "practice",
    date,
    attendance_status,
  }) as unknown as TeamEvent;

// 既存出欠 fixture
const makeExistingAttendance = (
  eventId: string,
  status: "present" | "absent" | "other" | null,
  note: string | null,
): TeamAttendanceWithDetails =>
  ({
    id: `att-${eventId}`,
    practice_id: eventId,
    competition_id: null,
    user_id: USER_ID,
    status,
    note,
  }) as unknown as TeamAttendanceWithDetails;

const EDIT_MARK_RE = /\(\d{2}\/\d{2}\s\d{2}:\d{2}締切後編集\)/;

describe("useAttendanceEdit (修正3-A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // closed イベント編集時の confirm を常に承認
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("V-04: 既存更新経路はマーク未付与の raw note を API に渡す", () => {
    it("closed の既存出欠を本文ありで更新 → API には本文のみ (マークなし) を渡す", async () => {
      const { client } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-1", "closed")];
      const attendances = [makeExistingAttendance("ev-1", "present", "旧メモ")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleNoteChange("ev-1", "体調不良で欠席"));
      act(() => result.current.handleStatusChange("ev-1", "absent"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      expect(bulkUpdateMyAttendances).toHaveBeenCalledTimes(1);
      const payload = bulkUpdateMyAttendances.mock.calls[0][0] as Array<{
        attendanceId: string;
        status: string | null;
        note: string | null;
      }>;
      expect(payload).toHaveLength(1);
      expect(payload[0].attendanceId).toBe("att-ev-1");
      expect(payload[0].status).toBe("absent");
      // クライアントは締切後編集マークを一切付与しない (API の addEditMark に委譲)
      expect(payload[0].note).toBe("体調不良で欠席");
      expect(payload[0].note).not.toContain("締切後編集");
      expect(payload[0].note).not.toMatch(EDIT_MARK_RE);
    });

    it("closed の既存出欠を本文なし (空) で更新 → API には null を渡す (マーク生成しない)", async () => {
      const { client } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-1", "closed")];
      const attendances = [makeExistingAttendance("ev-1", "present", "旧メモ")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleNoteChange("ev-1", ""));
      act(() => result.current.handleStatusChange("ev-1", "absent"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      const payload = bulkUpdateMyAttendances.mock.calls[0][0] as Array<{ note: string | null }>;
      // 空文字は null として渡し、マーク文字列は生成しない (API が getEditMark を付与する)
      expect(payload[0].note).toBeNull();
    });

    it("旧マーク付き note を再編集 → クライアントはマークを除去/再付与せず raw のまま渡す", async () => {
      // 修正3-A の核心: 旧コードはここでクライアント側 replace+再付与していた。
      // 撤去後は raw note をそのまま API に渡し、重複除去は API の addEditMark に一任する。
      const { client } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-1", "closed")];
      const attendances = [makeExistingAttendance("ev-1", "present", "旧メモ")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleNoteChange("ev-1", "メモ (06/17 20:23締切後編集)"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      const payload = bulkUpdateMyAttendances.mock.calls[0][0] as Array<{ note: string | null }>;
      // クライアントは加工しない: 入力された raw note がそのまま渡る
      expect(payload[0].note).toBe("メモ (06/17 20:23締切後編集)");
    });
  });

  describe("V-04: open の既存出欠はマークなし (撤去前後で同一)", () => {
    it("open の既存出欠を更新 → API には raw note を渡す (マークなし)", async () => {
      const { client } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-1", "open")];
      const attendances = [makeExistingAttendance("ev-1", "present", "旧メモ")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleNoteChange("ev-1", "出席します"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      const payload = bulkUpdateMyAttendances.mock.calls[0][0] as Array<{ note: string | null }>;
      expect(payload[0].note).toBe("出席します");
      expect(payload[0].note).not.toContain("締切後編集");
    });
  });

  describe("V-05/V-06: 新規 insert 経路は据え置き (クライアント側マーク付与が残る)", () => {
    it("closed の新規出欠は insert 時にクライアント側で締切後編集マークを付与する", async () => {
      const { client, insertMock } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-new", "closed")];
      const attendances: TeamAttendanceWithDetails[] = []; // 既存なし = 新規

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleStatusChange("ev-new", "present"));
      act(() => result.current.handleNoteChange("ev-new", "遅れて参加"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      // 新規は insert 経路、bulkUpdate は呼ばれない (attendanceId 空のため除外)
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(bulkUpdateMyAttendances).not.toHaveBeenCalled();

      const inserted = insertMock.mock.calls[0][0] as Array<{
        user_id: string;
        practice_id: string | null;
        status: string | null;
        note: string | null;
      }>;
      expect(inserted).toHaveLength(1);
      expect(inserted[0].practice_id).toBe("ev-new");
      expect(inserted[0].status).toBe("present");
      // insert 経路は据え置き: クライアント側でマークが付与される
      expect(inserted[0].note).toContain("遅れて参加");
      expect(inserted[0].note).toMatch(EDIT_MARK_RE);
    });

    it("open の新規出欠は insert 時にマークを付与しない", async () => {
      const { client, insertMock } = createMockSupabase();
      const { api } = createMockAPI();
      const events = [makeEvent("ev-new", "open")];
      const attendances: TeamAttendanceWithDetails[] = [];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleStatusChange("ev-new", "present"));
      act(() => result.current.handleNoteChange("ev-new", "参加します"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      const inserted = insertMock.mock.calls[0][0] as Array<{ note: string | null }>;
      expect(inserted[0].note).toBe("参加します");
      expect(inserted[0].note).not.toContain("締切後編集");
    });
  });

  describe("V-05: 変更なし/エラー処理が不変", () => {
    it("変更がない場合は API も insert も呼ばれない", async () => {
      const { client, insertMock } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      const events = [makeEvent("ev-1", "open")];
      const attendances = [makeExistingAttendance("ev-1", "present", "同じ")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      // status/note を既存と同一にする
      act(() => result.current.initializeEditStates(events, attendances));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      expect(bulkUpdateMyAttendances).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it("API がエラーを投げると error state にメッセージが入る", async () => {
      const { client } = createMockSupabase();
      const { api, bulkUpdateMyAttendances } = createMockAPI();
      bulkUpdateMyAttendances.mockRejectedValueOnce(new Error("boom"));
      const events = [makeEvent("ev-1", "open")];
      const attendances = [makeExistingAttendance("ev-1", "present", "旧")];

      const { result } = renderHook(() => useAttendanceEdit(TEAM_ID, client, api));

      act(() => result.current.initializeEditStates(events, attendances));
      act(() => result.current.handleStatusChange("ev-1", "absent"));

      await act(async () => {
        await result.current.saveAll(events, attendances);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.saving).toBe(false);
    });
  });
});
