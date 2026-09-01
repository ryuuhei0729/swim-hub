import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder,
} from "../../__mocks__/supabase";
import { AttendanceAPI } from "../../api/attendance";
import type { AttendanceStatus, TeamAttendance } from "../../types";

// =============================================================================
// 改修1 検証: bulkUpdateMyAttendances 経由の「締切後編集」マーク付与/重複除去
//
// getEditMark / addEditMark は private のため、実際に呼び出される唯一の公開経路
// である bulkUpdateMyAttendances (closed イベント) を通してロジックを検証する。
// これにより mobile の保存経路 (API 委譲) の実挙動をそのまま検証できる。
// =============================================================================

type TableResponse = {
  data: unknown;
  error?: unknown;
  configure?: (builder: MockQueryBuilder) => void;
};

const createSupabaseMock = (options: { userId?: string } = {}) => {
  const { userId } = options;
  const client = createMockSupabaseClient({ userId });
  const tableQueues = new Map<string, TableResponse[]>();
  const builderHistory = new Map<string, MockQueryBuilder[]>();

  client.from = vi.fn((table: string) => {
    const queue = tableQueues.get(table) ?? [];
    const response = queue.length > 0 ? queue.shift()! : { data: [], error: null };

    const builder = createMockQueryBuilder(response.data, response.error ?? null);
    response.configure?.(builder);

    const history = builderHistory.get(table) ?? [];
    history.push(builder);
    builderHistory.set(table, history);

    return builder;
  }) as unknown as typeof client.from;

  return {
    client,
    queueTable: (table: string, responses: TableResponse[]) => {
      tableQueues.set(table, [...responses]);
    },
    getBuilderHistory: (table: string) => builderHistory.get(table) ?? [],
    // 呼び出し側は arrange/act で対象テーブルへの呼び出しが指定 index まで発生することを
    // 保証した上で読む。存在しなければテストの前提が崩れているため早期に失敗させる
    getBuilder: (table: string, index = 0): MockQueryBuilder => {
      const builder = (builderHistory.get(table) ?? [])[index];
      if (!builder) {
        throw new Error(`No builder recorded for table "${table}" at index ${index}`);
      }
      return builder;
    },
  };
};

/**
 * closed な練習 1 件に対して bulkUpdateMyAttendances を実行し、
 * 実際に DB へ書き込まれた最終 note (update() の引数) を返すヘルパー。
 */
const runClosedBulkUpdate = async (
  inputNote: string | null,
  status: AttendanceStatus | null = "present",
): Promise<{ finalNote: string | null }> => {
  const supabaseMock = createSupabaseMock({ userId: "test-user-id" });
  const api = new AttendanceAPI(supabaseMock.client);

  const updatedRow: TeamAttendance = {
    id: "attendance-1",
    practice_id: "practice-1",
    competition_id: null,
    user_id: "test-user-id",
    status,
    note: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  };

  // 1) 所有者チェック用の select.in (.then で resolve される配列)
  // 2) update().select().single() 用 (single で resolve)
  supabaseMock.queueTable("team_attendance", [
    {
      data: [
        {
          id: "attendance-1",
          user_id: "test-user-id",
          practice_id: "practice-1",
          competition_id: null,
        },
      ],
    },
    {
      data: updatedRow,
      configure: (builder) => {
        builder.update.mockReturnValue(builder);
      },
    },
  ]);

  // isEventClosed の practices 参照
  supabaseMock.queueTable("practices", [{ data: { attendance_status: "closed" } }]);

  await api.bulkUpdateMyAttendances([
    { attendanceId: "attendance-1", status, note: inputNote },
  ]);

  // index 1 が update().select().single() の builder
  const updateBuilder = supabaseMock.getBuilder("team_attendance", 1);
  const updateArg = updateBuilder.update.mock.calls[0]?.[0] as
    | { status: AttendanceStatus | null; note: string | null }
    | undefined;

  return { finalNote: updateArg?.note ?? null };
};

// 「(MM/dd HH:mm締切後編集)」形式に一致するか
const EDIT_MARK_RE = /\(\d{2}\/\d{2}\s\d{2}:\d{2}締切後編集\)/;
// 旧形式「(MM/dd HH:mm編集)」と新形式「(... 締切後編集)」の両方を含む全マーク数を数える。
// 「編集)」で終わる括弧マークの総数 = 旧 + 新 の合計マーク数。
const countEditMarks = (note: string | null): number => {
  if (!note) return 0;
  return (note.match(/\(\d{1,2}\/\d{1,2}\s\d{1,2}:\d{2}(?:締切後)?編集\)/g) ?? []).length;
};

describe("改修1: bulkUpdateMyAttendances の締切後編集マーク", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("V-01 getEditMark 締切後ケースの文言", () => {
    it("note 空での締切後編集は「(MM/dd HH:mm締切後編集)」のみになる", async () => {
      const { finalNote } = await runClosedBulkUpdate(null);
      expect(finalNote).not.toBeNull();
      expect(finalNote).toMatch(EDIT_MARK_RE);
      // 旧形式「(... 編集)」単独ではなく「締切後編集」であること
      expect(finalNote).toContain("締切後編集");
      // マークのみ (前置きの本文なし)
      expect(finalNote!.replace(EDIT_MARK_RE, "").trim()).toBe("");
    });

    it("本文ありの締切後編集は「本文 (MM/dd HH:mm締切後編集)」になる", async () => {
      const { finalNote } = await runClosedBulkUpdate("体調不良のため欠席します");
      expect(finalNote).toContain("体調不良のため欠席します");
      expect(finalNote).toMatch(EDIT_MARK_RE);
      expect(countEditMarks(finalNote)).toBe(1);
    });
  });

  describe("V-02 addEditMark の重複除去 (二重付与しない)", () => {
    it("旧形式「(MM/dd HH:mm編集)」マーク付き note を再編集してもマークは1個", async () => {
      const { finalNote } = await runClosedBulkUpdate("メモ (06/17 20:23編集)");
      // 旧マークは除去され、新しい締切後編集マークが1個だけ
      expect(finalNote).toContain("メモ");
      expect(finalNote).toContain("締切後編集");
      expect(countEditMarks(finalNote)).toBe(1);
      // 旧形式「編集」単独が残っていない (「締切後編集」以外の「編集)」が無い)
      const strippedNew = finalNote!.replace(/締切後編集\)/g, "");
      expect(strippedNew).not.toMatch(/編集\)/);
    });

    it("新形式「(MM/dd HH:mm締切後編集)」マーク付き note を再編集してもマークは1個", async () => {
      const { finalNote } = await runClosedBulkUpdate("メモ (06/17 20:23締切後編集)");
      expect(finalNote).toContain("メモ");
      expect(countEditMarks(finalNote)).toBe(1);
    });

    it("複数の旧マークが混在していても全て除去し1個に正規化する", async () => {
      const { finalNote } = await runClosedBulkUpdate(
        "メモ (06/17 20:23編集) (06/18 09:00締切後編集)",
      );
      expect(finalNote).toContain("メモ");
      expect(countEditMarks(finalNote)).toBe(1);
    });

    it("マークのみ (本文無し) の旧 note を再編集してもマーク1個・本文空", async () => {
      const { finalNote } = await runClosedBulkUpdate("(06/17 20:23締切後編集)");
      expect(countEditMarks(finalNote)).toBe(1);
      expect(finalNote!.replace(EDIT_MARK_RE, "").trim()).toBe("");
    });
  });

  describe("Boundary: open イベントはマーク無し", () => {
    it("open イベントでは note がそのまま保存される (マーク付与なし)", async () => {
      const supabaseMock = createSupabaseMock({ userId: "test-user-id" });
      const api = new AttendanceAPI(supabaseMock.client);

      supabaseMock.queueTable("team_attendance", [
        {
          data: [
            {
              id: "attendance-1",
              user_id: "test-user-id",
              practice_id: "practice-1",
              competition_id: null,
            },
          ],
        },
        {
          data: {
            id: "attendance-1",
            practice_id: "practice-1",
            competition_id: null,
            user_id: "test-user-id",
            status: "present",
            note: "そのまま",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
          },
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
          },
        },
      ]);
      supabaseMock.queueTable("practices", [{ data: { attendance_status: "open" } }]);

      await api.bulkUpdateMyAttendances([
        { attendanceId: "attendance-1", status: "present", note: "そのまま" },
      ]);

      const updateArg = supabaseMock.getBuilder("team_attendance", 1).update.mock.calls[0]?.[0] as {
        note: string | null;
      };
      expect(updateArg.note).toBe("そのまま");
      expect(updateArg.note).not.toContain("締切後編集");
    });
  });
});
