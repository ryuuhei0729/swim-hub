// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { TeamEvent } from "@swim-hub/shared/types/calendar";
import type { TeamAttendance } from "@swim-hub/shared/types/attendance";
import {
  createTestQueryClient,
  renderHookWithI18n as renderHook,
} from "@/__tests__/helpers/teamQueryTestUtils";
import { useMyAttendanceSaver } from "@/components/team/monthly-attendance/hooks/useMyAttendanceSaver";
import type { MyAttendanceItem } from "@/utils/teamAttendance";

// =============================================================================
// 出欠タブの自分の出欠の保存 (押した時点で保存。mobile と同じ流れ)
//
// 観点:
//  - 既存の行は raw note のまま bulkUpdateMyAttendances に渡す
//    (締切後編集の印は API の addEditMark が付ける = クライアントでは付けない)
//  - 行が無いイベントは新しく作り、締切後ならクライアントで印を付ける
//  - 押した時点で一覧のキャッシュを書き換え、失敗したら元に戻してエラーを出す
//  - 締切後は確認ダイアログを出し、やめたら保存しない
// =============================================================================

const USER_ID = "user-1";
const LIST_KEY = ["test", "myAttendanceList"] as const;

const createMockSupabase = () => {
  const single = vi.fn().mockResolvedValue({
    data: { id: "att-created", status: "present", note: null },
    error: null,
  });
  const insertMock = vi.fn().mockReturnValue({ select: () => ({ single }) });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  const client = { from: fromMock } as unknown as SupabaseClient;
  return { client, insertMock, single };
};

const createMockAPI = () => {
  const bulkUpdateMyAttendances = vi.fn(
    async (updates: Array<{ attendanceId: string; status: string | null; note: string | null }>) =>
      updates.map((u) => ({ id: u.attendanceId, status: u.status, note: u.note })),
  );
  const api = { bulkUpdateMyAttendances } as unknown as AttendanceAPI;
  return { api, bulkUpdateMyAttendances };
};

const makeEvent = (id: string, attendance_status: "open" | "closed" | null): TeamEvent =>
  ({ id, type: "practice", date: "2099-12-31", attendance_status }) as unknown as TeamEvent;

const makeAttendance = (
  eventId: string,
  status: "present" | "absent" | "other" | null,
  note: string | null,
): TeamAttendance =>
  ({
    id: `att-${eventId}`,
    practice_id: eventId,
    competition_id: null,
    user_id: USER_ID,
    status,
    note,
  }) as unknown as TeamAttendance;

const EDIT_MARK_RE = /\(\d{2}\/\d{2}\s\d{2}:\d{2}締切後編集\)/;

function setup(items: MyAttendanceItem[]) {
  const { client, insertMock } = createMockSupabase();
  const { api, bulkUpdateMyAttendances } = createMockAPI();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(LIST_KEY, items);
  const { result } = renderHook(
    () =>
      useMyAttendanceSaver({
        supabase: client,
        attendanceAPI: api,
        userId: USER_ID,
        listKey: LIST_KEY,
      }),
    { queryClient },
  );
  const cached = () => queryClient.getQueryData<MyAttendanceItem[]>(LIST_KEY) ?? [];
  return { result, insertMock, bulkUpdateMyAttendances, cached };
}

describe("useMyAttendanceSaver", () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("既存の行は raw note のまま API に渡す (印は API が付ける)", () => {
    it("締切後の既存の行 → 確認のうえ、本文のみ (印なし) を渡す", async () => {
      const item = { event: makeEvent("ev-1", "closed"), myAttendance: makeAttendance("ev-1", "present", "旧メモ") };
      const { result, bulkUpdateMyAttendances } = setup([item]);

      let ok = false;
      await act(async () => {
        ok = await result.current.saveAnswer(item, { status: "absent", note: "体調不良で欠席" });
      });

      expect(ok).toBe(true);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(bulkUpdateMyAttendances).toHaveBeenCalledTimes(1);
      const payload = bulkUpdateMyAttendances.mock.calls[0]![0];
      expect(payload).toEqual([{ attendanceId: "att-ev-1", status: "absent", note: "体調不良で欠席" }]);
      expect(payload[0]!.note).not.toMatch(EDIT_MARK_RE);
    });

    it("備考が空なら null を渡す", async () => {
      const item = { event: makeEvent("ev-1", "open"), myAttendance: makeAttendance("ev-1", "present", "旧メモ") };
      const { result, bulkUpdateMyAttendances } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "absent", note: "" });
      });

      expect(bulkUpdateMyAttendances.mock.calls[0]![0][0]!.note).toBeNull();
    });

    it("受付中なら確認を出さない", async () => {
      const item = { event: makeEvent("ev-1", "open"), myAttendance: makeAttendance("ev-1", null, null) };
      const { result } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "present", note: "" });
      });

      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("受付状況が未設定 (null) のイベントは受付中として扱い、確認を出さない", async () => {
      const item = { event: makeEvent("ev-1", null), myAttendance: makeAttendance("ev-1", null, null) };
      const { result, bulkUpdateMyAttendances } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "present", note: "" });
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(bulkUpdateMyAttendances).toHaveBeenCalledTimes(1);
    });
  });

  describe("行が無いイベントは新しく作る", () => {
    it("締切後は insert 時にクライアントで締切後編集の印を付ける", async () => {
      const item = { event: makeEvent("ev-new", "closed"), myAttendance: null };
      const { result, insertMock, bulkUpdateMyAttendances } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "present", note: "遅れて参加" });
      });

      expect(bulkUpdateMyAttendances).not.toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledTimes(1);
      const inserted = insertMock.mock.calls[0]![0] as {
        user_id: string;
        practice_id: string | null;
        status: string | null;
        note: string | null;
      };
      expect(inserted.user_id).toBe(USER_ID);
      expect(inserted.practice_id).toBe("ev-new");
      expect(inserted.status).toBe("present");
      expect(inserted.note).toContain("遅れて参加");
      expect(inserted.note).toMatch(EDIT_MARK_RE);
    });

    it("受付中は印を付けない", async () => {
      const item = { event: makeEvent("ev-new", "open"), myAttendance: null };
      const { result, insertMock } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "present", note: "参加します" });
      });

      const inserted = insertMock.mock.calls[0]![0] as { note: string | null };
      expect(inserted.note).toBe("参加します");
    });
  });

  describe("一覧の表示と失敗時", () => {
    it("保存すると一覧のキャッシュの自分の回答が変わる", async () => {
      const item = { event: makeEvent("ev-1", "open"), myAttendance: makeAttendance("ev-1", "present", null) };
      const { result, cached } = setup([item]);

      await act(async () => {
        await result.current.saveAnswer(item, { status: "absent", note: "" });
      });

      expect(cached()[0]!.myAttendance?.status).toBe("absent");
      expect(result.current.error).toBeNull();
    });

    it("API がエラーを投げたら元の回答に戻し、エラーを出す", async () => {
      const item = { event: makeEvent("ev-1", "open"), myAttendance: makeAttendance("ev-1", "present", "旧") };
      const { result, bulkUpdateMyAttendances, cached } = setup([item]);
      bulkUpdateMyAttendances.mockRejectedValueOnce(new Error("boom"));

      let ok = true;
      await act(async () => {
        ok = await result.current.saveAnswer(item, { status: "absent", note: "旧" });
      });

      expect(ok).toBe(false);
      expect(cached()[0]!.myAttendance?.status).toBe("present");
      expect(result.current.error).not.toBeNull();
    });

    it("締切後の確認でやめたら保存しない", async () => {
      confirmSpy.mockReturnValue(false);
      const item = { event: makeEvent("ev-1", "closed"), myAttendance: makeAttendance("ev-1", "present", null) };
      const { result, bulkUpdateMyAttendances, cached } = setup([item]);

      let ok = true;
      await act(async () => {
        ok = await result.current.saveAnswer(item, { status: "absent", note: "" });
      });

      expect(ok).toBe(false);
      expect(bulkUpdateMyAttendances).not.toHaveBeenCalled();
      expect(cached()[0]!.myAttendance?.status).toBe("present");
    });
  });
});
