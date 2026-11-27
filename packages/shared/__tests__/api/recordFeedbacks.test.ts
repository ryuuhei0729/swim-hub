import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeRecordFeedbackContent,
  RecordFeedbackAPI,
  summarizeRecordFeedbacks,
  toRecordFeedbackErrorCode,
} from "../../api/recordFeedbacks";

describe("toRecordFeedbackErrorCode", () => {
  it.each([
    [{ code: "23505", message: "duplicate key" }, "duplicate"],
    [{ code: "23514", message: "check constraint" }, "content_length"],
    [{ code: "P0001", message: "not_team_record" }, "not_team_record"],
    [{ code: "P0001", message: "record_not_found" }, "record_not_found"],
    [{ code: "42501", message: "new row violates row-level security policy" }, "not_authorized"],
    [new Error("not_authorized"), "not_authorized"],
    [{ code: "XX000", message: "boom" }, "unknown"],
    [null, "unknown"],
  ])("%o → %s", (error, expected) => {
    expect(toRecordFeedbackErrorCode(error)).toBe(expected);
  });
});

describe("normalizeRecordFeedbackContent", () => {
  it("前後の空白を除いた本文を返す", () => {
    expect(normalizeRecordFeedbackContent("  良かった \n")).toBe("良かった");
  });

  it("空白だけなら content_length エラー", () => {
    expect(() => normalizeRecordFeedbackContent("   ")).toThrow("content_length");
  });

  it("1000 文字は許可し 1001 文字は拒否する", () => {
    expect(normalizeRecordFeedbackContent("あ".repeat(1000))).toHaveLength(1000);
    expect(() => normalizeRecordFeedbackContent("あ".repeat(1001))).toThrow("content_length");
  });
});

describe("summarizeRecordFeedbacks", () => {
  it("記録ごとに件数・自分が書いたか・未読数を集計する", () => {
    const result = summarizeRecordFeedbacks(
      [
        { record_id: "r1", author_id: "me", read_at: null },
        { record_id: "r1", author_id: "other", read_at: "2026-11-01T00:00:00Z" },
        { record_id: "r2", author_id: null, read_at: null },
      ],
      "me",
    );
    expect(result).toEqual({
      r1: { count: 2, hasMine: true, unreadCount: 1 },
      r2: { count: 1, hasMine: false, unreadCount: 1 },
    });
  });
});

describe("RecordFeedbackAPI", () => {
  function createClient(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      rpc: vi.fn(),
      from: vi.fn(),
      ...overrides,
    } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };
  }

  it("listByRecord は get_record_feedbacks を呼ぶ", async () => {
    const client = createClient();
    client.rpc.mockResolvedValue({ data: [{ id: "f1" }], error: null });
    const api = new RecordFeedbackAPI(client);
    await expect(api.listByRecord("r1")).resolves.toEqual([{ id: "f1" }]);
    expect(client.rpc).toHaveBeenCalledWith("get_record_feedbacks", { p_record_id: "r1" });
  });

  it("listUnread は time を数値に変換する", async () => {
    const client = createClient();
    client.rpc.mockResolvedValue({ data: [{ id: "f1", time: "27.50" }], error: null });
    const api = new RecordFeedbackAPI(client);
    const rows = await api.listUnread();
    expect(rows[0]?.time).toBe(27.5);
  });

  it("listSummaryRows は ID が空なら問い合わせない", async () => {
    const client = createClient();
    const api = new RecordFeedbackAPI(client);
    await expect(api.listSummaryRows([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("listSummaryRows は重複を除き 100 件ずつ分割して問い合わせる", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createClient();
    client.from.mockReturnValue({ select: vi.fn().mockReturnValue({ in: inFn }) });
    const api = new RecordFeedbackAPI(client);
    const ids = Array.from({ length: 150 }, (_, i) => `r${i}`);
    await api.listSummaryRows([...ids, "r0"]);
    expect(inFn).toHaveBeenCalledTimes(2);
    expect(inFn.mock.calls[0]?.[1]).toHaveLength(100);
    expect(inFn.mock.calls[1]?.[1]).toHaveLength(50);
  });

  it("create は本文を trim して record_id と content だけを送る", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = createClient();
    client.from.mockReturnValue({ insert });
    const api = new RecordFeedbackAPI(client);
    await api.create("r1", "  良い泳ぎ  ");
    expect(client.from).toHaveBeenCalledWith("record_feedbacks");
    expect(insert).toHaveBeenCalledWith({ record_id: "r1", content: "良い泳ぎ" });
  });

  it("update は RLS で 0 行だったら not_authorized を投げる", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createClient();
    client.from.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) }),
    });
    const api = new RecordFeedbackAPI(client);
    await expect(api.update("f1", "本文")).rejects.toThrow("not_authorized");
  });

  it("delete は RLS で 0 行だったら not_authorized を投げる", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = createClient();
    client.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) }),
    });
    const api = new RecordFeedbackAPI(client);
    await expect(api.delete("f1")).rejects.toThrow("not_authorized");
  });

  it("markRead は mark_record_feedbacks_read の件数を返す", async () => {
    const client = createClient();
    client.rpc.mockResolvedValue({ data: 2, error: null });
    const api = new RecordFeedbackAPI(client);
    await expect(api.markRead("r1")).resolves.toBe(2);
    expect(client.rpc).toHaveBeenCalledWith("mark_record_feedbacks_read", { p_record_id: "r1" });
  });

  it("RPC のエラーはそのまま投げる", async () => {
    const client = createClient();
    const error = { code: "P0001", message: "auth_required" };
    client.rpc.mockResolvedValue({ data: null, error });
    const api = new RecordFeedbackAPI(client);
    await expect(api.listUnread()).rejects.toBe(error);
  });
});
