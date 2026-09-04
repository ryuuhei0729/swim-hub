import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "../../__mocks__/supabase";
import { EntryAPI } from "../../api/entries";

describe("EntryAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: EntryAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    api = new EntryAPI(mockClient);
  });

  describe("ユーザーエントリー取得", () => {
    it("認証済みユーザーのときエントリー一覧を取得できる", async () => {
      const mockEntries = [
        {
          id: "entry-1",
          user_id: "test-user-id",
          competition_id: "comp-1",
          style_id: 1,
          entry_time: 60.5,
          note: "テストエントリー",
          competition: { id: "comp-1", title: "テスト大会" },
          style: { id: 1, name_jp: "自由形" },
          user: { id: "test-user-id", name: "テストユーザー" },
          team: null,
          created_at: "2025-01-15T10:00:00Z",
          updated_at: "2025-01-15T10:00:00Z",
        },
      ];

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getEntriesByUser();

      expect(mockClient.from).toHaveBeenCalledWith("entries");
      expect(result).toEqual(mockEntries);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      await expect(api.getEntriesByUser()).rejects.toThrow("認証が必要です");
    });

    it("データベースエラーが発生したときエラーを処理できる", async () => {
      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.getEntriesByUser()).rejects.toThrow(dbError);
    });

    it("エントリーが見つからないとき空配列を返す", async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getEntriesByUser();

      expect(result).toEqual([]);
    });

    it("認証済みユーザーのエントリーのみを取得する", async () => {
      const mockEntries = [
        {
          id: "entry-1",
          user_id: "test-user-id",
          competition_id: "comp-1",
          style_id: 1,
          entry_time: 60.5,
          note: "テストエントリー",
          competition: { id: "comp-1", title: "テスト大会" },
          style: { id: 1, name_jp: "自由形" },
          user: { id: "test-user-id", name: "テストユーザー" },
          team: null,
          created_at: "2025-01-15T10:00:00Z",
          updated_at: "2025-01-15T10:00:00Z",
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      };

      mockClient.from = vi.fn(() => mockQueryBuilder) as unknown as typeof mockClient.from;

      await api.getEntriesByUser();

      // 認証されたユーザーのIDでフィルタリングされていることを確認
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
    });
  });

  describe("大会エントリー取得", () => {
    it("大会を指定したとき該当大会のエントリーを取得できる", async () => {
      const mockEntries = [
        {
          id: "entry-1",
          user_id: "test-user-id",
          competition_id: "comp-1",
          style_id: 1,
          entry_time: 60.5,
          note: "テストエントリー",
          competition: { id: "comp-1", title: "テスト大会" },
          style: { id: 1, name_jp: "自由形" },
          user: { id: "test-user-id", name: "テストユーザー" },
          team: null,
          created_at: "2025-01-15T10:00:00Z",
          updated_at: "2025-01-15T10:00:00Z",
        },
      ];

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getEntriesByCompetition("comp-1");

      expect(mockClient.from).toHaveBeenCalledWith("entries");
      expect(result).toEqual(mockEntries);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      await expect(api.getEntriesByCompetition("comp-1")).rejects.toThrow("認証が必要です");
    });
  });

  describe("チームエントリー取得", () => {
    it("チームメンバーのときエントリー一覧を取得できる", async () => {
      const mockMembership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "test-user-id",
      };

      const mockEntries = [
        {
          id: "entry-1",
          user_id: "test-user-id",
          team_id: "team-1",
          competition_id: "comp-1",
          style_id: 1,
          entry_time: 60.5,
          note: "テストエントリー",
          competition: { id: "comp-1", title: "テスト大会" },
          style: { id: 1, name_jp: "自由形" },
          user: { id: "test-user-id", name: "テストユーザー" },
          team: { id: "team-1", name: "テストチーム" },
          created_at: "2025-01-15T10:00:00Z",
          updated_at: "2025-01-15T10:00:00Z",
        },
      ];

      // メンバーシップ確認のモック
      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const result = await api.getEntriesByTeam("team-1");

      expect(result).toEqual(mockEntries);
    });

    it("チームメンバーでないときエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.getEntriesByTeam("team-1")).rejects.toThrow(
        "チームへのアクセス権限がありません",
      );
    });
  });

  describe("エントリー取得", () => {
    it("ユーザーが所有者のときエントリーを取得できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: null,
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        style: { id: 1, name_jp: "自由形" },
        user: { id: "test-user-id", name: "テストユーザー" },
        team: null,
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const result = await api.getEntry("entry-1");

      expect(result).toEqual(mockEntry);
    });

    it("ユーザーがチーム管理者のときエントリーを取得できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        style: { id: 1, name_jp: "自由形" },
        user: { id: "other-user-id", name: "他のユーザー" },
        team: { id: "team-1", name: "テストチーム" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const mockMembership = {
        role: "admin",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const result = await api.getEntry("entry-1");

      expect(result).toEqual(mockEntry);
    });

    it("ユーザーが所有者でもチーム管理者でもないときエラーになる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        style: { id: 1, name_jp: "自由形" },
        user: { id: "other-user-id", name: "他のユーザー" },
        team: { id: "team-1", name: "テストチーム" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.getEntry("entry-1")).rejects.toThrow("アクセスが拒否されました");
    });

    it("ユーザーがチームメンバーだが管理者でないときエラーになる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        style: { id: 1, name_jp: "自由形" },
        user: { id: "other-user-id", name: "他のユーザー" },
        team: { id: "team-1", name: "テストチーム" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const mockMembership = {
        role: "user", // adminではない
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.getEntry("entry-1")).rejects.toThrow("アクセスが拒否されました");
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      await expect(api.getEntry("entry-1")).rejects.toThrow("認証が必要です");
    });

    it("エントリー取得時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.getEntry("entry-1")).rejects.toThrow(dbError);
    });

    it("チームメンバーシップクエリエラーを適切に処理できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        style: { id: 1, name_jp: "自由形" },
        user: { id: "other-user-id", name: "他のユーザー" },
        team: { id: "team-1", name: "テストチーム" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const membershipError = new Error("Membership query failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: membershipError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.getEntry("entry-1")).rejects.toThrow("アクセスが拒否されました");
    });
  });

  describe("チームエントリー作成", () => {
    it("ユーザーがチーム管理者のときチームエントリーを作成できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const mockMembership = {
        id: "membership-1",
        role: "admin",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      const result = await api.createTeamEntry("team-1", "other-user-id", entryData);

      expect(result).toEqual(mockEntry);
    });

    it("ユーザーが自分のエントリーを作成するときチームエントリーを作成できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const mockMembership = {
        id: "membership-1",
        role: "user", // 一般メンバー
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      const result = await api.createTeamEntry("team-1", "test-user-id", entryData);

      expect(result).toEqual(mockEntry);
    });

    it("非管理者ユーザーが他のユーザーのエントリーを作成しようとしたときエラーになる", async () => {
      const mockMembership = {
        id: "membership-1",
        role: "user", // 一般メンバー
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      await expect(api.createTeamEntry("team-1", "other-user-id", entryData)).rejects.toThrow(
        "自分のエントリーのみ作成可能です",
      );
    });

    it("チームメンバーでないときエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      await expect(api.createTeamEntry("team-1", "test-user-id", entryData)).rejects.toThrow(
        "チームへのアクセス権限がありません",
      );
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      await expect(api.createTeamEntry("team-1", "test-user-id", entryData)).rejects.toThrow(
        "認証が必要です",
      );
    });

    it("エントリー作成時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const mockMembership = {
        id: "membership-1",
        role: "admin",
      };

      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      await expect(api.createTeamEntry("team-1", "other-user-id", entryData)).rejects.toThrow(
        dbError,
      );
    });
  });

  describe("エントリー更新", () => {
    it("ユーザーが所有者のときエントリーを更新できる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: null,
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const updatedEntry = {
        ...existingEntry,
        note: "更新されたエントリー",
        entry_time: 59.0,
      };

      // 初回の取得用のモック
      const fetchMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
      };

      // 更新用のモック
      const updateMock = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedEntry, error: null }),
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          // 初回はfetchMock、2回目はupdateMockを返す
          if ((mockClient.from as unknown as ReturnType<typeof vi.fn>).mock.calls.length === 1) {
            return fetchMock;
          } else {
            return updateMock;
          }
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
        entry_time: 59.0,
      };

      const result = await api.updateEntry("entry-1", updates);

      expect(result).toEqual(updatedEntry);
    });

    it("ユーザーがチーム管理者のときエントリーを更新できる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const updatedEntry = {
        ...existingEntry,
        note: "更新されたエントリー",
        entry_time: 59.0,
      };

      const mockMembership = {
        role: "admin",
      };

      // 初回の取得用のモック
      const fetchMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
      };

      // 更新用のモック
      const updateMock = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedEntry, error: null }),
      };

      // チームメンバーシップ確認用のモック
      const membershipMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          // 初回はfetchMock、2回目はupdateMockを返す
          if ((mockClient.from as unknown as ReturnType<typeof vi.fn>).mock.calls.length === 1) {
            return fetchMock;
          } else {
            return updateMock;
          }
        } else if (table === "team_memberships") {
          return membershipMock;
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
        entry_time: 59.0,
      };

      const result = await api.updateEntry("entry-1", updates);

      expect(result).toEqual(updatedEntry);
    });

    it("ユーザーが所有者でもチーム管理者でもないときエラーになる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow("アクセスが拒否されました");
    });

    it("ユーザーがチームメンバーだが管理者でないときエラーになる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "other-user-id",
        team_id: "team-1",
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      const mockMembership = {
        role: "user", // adminではない
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow("アクセスが拒否されました");
    });

    it("competition_idを更新しようとしたときエラーになる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: null,
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        competition_id: "comp-2", // 禁止されたフィールド
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow(
        "competition_idの更新は許可されていません",
      );
    });

    it("user_idを更新しようとしたときエラーになる", async () => {
      const existingEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: null,
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        competition: { id: "comp-1", title: "テスト大会" },
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        user_id: "other-user-id", // 禁止されたフィールド
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow(
        "user_idの更新は許可されていません",
      );
    });

    it("エントリーが見つからないときエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow(
        "エントリーが見つかりません",
      );
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      const updates = {
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow("認証が必要です");
    });

    it("エントリー取得時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      const updates = {
        note: "更新されたエントリー",
      };

      await expect(api.updateEntry("entry-1", updates)).rejects.toThrow(dbError);
    });
  });

  describe("エントリー削除", () => {
    // deleteEntry は「所有者/チーム管理者を確認する select().eq().single()」の後に
    // delete().eq("id", id).select("id") というチェインで呼ばれる
    // (RLSがDELETEを拒否した場合もerrorを返さず0行削除で正常終了する問題への対策として
    // .select() で結果行を見る。practices.ts の deletePractice と同型)。
    // "entries" テーブルへの1回目の from() 呼び出しは既存エントリー取得用、
    // 2回目は削除確認用のため、callCount で呼び出しごとに異なるビルダーを返す。
    // eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
    // クエリの絞り込み対象・返却カラムを捨てない。
    const mockDeleteEntryChain = (
      existingEntry: { user_id: string; team_id: string | null },
      deleteResponse: { data: unknown; error: unknown },
    ) => {
      const fetchBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
      };
      const deleteMock = vi.fn().mockReturnThis();
      const deleteEqMock = vi.fn().mockReturnThis();
      const selectMock = vi.fn().mockResolvedValue(deleteResponse);
      const deleteBuilder = { delete: deleteMock, eq: deleteEqMock, select: selectMock };

      let entriesCallCount = 0;
      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          entriesCallCount++;
          return entriesCallCount === 1 ? fetchBuilder : deleteBuilder;
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      return { fetchBuilder, deleteMock, deleteEqMock, selectMock };
    };

    it("ユーザーが所有者のときエントリーを削除できる", async () => {
      const existingEntry = {
        user_id: "test-user-id",
        team_id: null,
      };
      const { deleteMock, deleteEqMock, selectMock } = mockDeleteEntryChain(existingEntry, {
        data: [{ id: "entry-1" }],
        error: null,
      });

      await api.deleteEntry("entry-1");

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith("entries");
      expect(deleteMock).toHaveBeenCalled();
      expect(deleteEqMock).toHaveBeenCalledWith("id", "entry-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    it("ユーザーがチーム管理者のときエントリーを削除できる", async () => {
      const existingEntry = {
        user_id: "other-user-id",
        team_id: "team-1",
      };

      const mockMembership = {
        role: "admin",
      };

      const deleteMock = vi.fn().mockReturnThis();
      const deleteEqMock = vi.fn().mockReturnThis();
      const selectMock = vi.fn().mockResolvedValue({ data: [{ id: "entry-1" }], error: null });
      const deleteBuilder = { delete: deleteMock, eq: deleteEqMock, select: selectMock };

      let entriesCallCount = 0;
      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          entriesCallCount++;
          if (entriesCallCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
            };
          }
          return deleteBuilder;
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await api.deleteEntry("entry-1");

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith("entries");
      expect(deleteMock).toHaveBeenCalled();
      expect(deleteEqMock).toHaveBeenCalledWith("id", "entry-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    it("ユーザーが所有者でもチーム管理者でもないときエラーになる", async () => {
      const existingEntry = {
        user_id: "other-user-id",
        team_id: "team-1",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntry("entry-1")).rejects.toThrow("アクセスが拒否されました");
    });

    it("ユーザーがチームメンバーだが管理者でないときエラーになる", async () => {
      const existingEntry = {
        user_id: "other-user-id",
        team_id: "team-1",
      };

      const mockMembership = {
        role: "user", // adminではない
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntry("entry-1")).rejects.toThrow("アクセスが拒否されました");
    });

    it("エントリーが見つからないときエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntry("entry-1")).rejects.toThrow("エントリーが見つかりません");
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      await expect(api.deleteEntry("entry-1")).rejects.toThrow("認証が必要です");
    });

    it("エントリー取得時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "entries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntry("entry-1")).rejects.toThrow(dbError);
    });

    it("エントリー削除時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const existingEntry = {
        user_id: "test-user-id",
        team_id: null,
      };

      const deleteError = new Error("Delete operation failed");
      const { deleteEqMock, selectMock } = mockDeleteEntryChain(existingEntry, {
        data: null,
        error: deleteError,
      });

      await expect(api.deleteEntry("entry-1")).rejects.toThrow(deleteError);
      expect(deleteEqMock).toHaveBeenCalledWith("id", "entry-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-1] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const existingEntry = { user_id: "test-user-id", team_id: null };
        const { deleteEqMock, selectMock } = mockDeleteEntryChain(existingEntry, {
          data: [],
          error: null,
        });

        await expect(api.deleteEntry("entry-1")).rejects.toThrow("エントリーの削除に失敗しました");
        expect(deleteEqMock).toHaveBeenCalledWith("id", "entry-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-2] dataがnullの場合もエラーをthrowする", async () => {
        const existingEntry = { user_id: "test-user-id", team_id: null };
        mockDeleteEntryChain(existingEntry, { data: null, error: null });

        await expect(api.deleteEntry("entry-1")).rejects.toThrow("エントリーの削除に失敗しました");
      });

      it("[D-3] 1行返った場合は正常終了する(非退行)", async () => {
        const existingEntry = { user_id: "test-user-id", team_id: null };
        const { deleteEqMock, selectMock } = mockDeleteEntryChain(existingEntry, {
          data: [{ id: "entry-99" }],
          error: null,
        });

        await expect(api.deleteEntry("entry-99")).resolves.toBeUndefined();
        expect(deleteEqMock).toHaveBeenCalledWith("id", "entry-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-4] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const existingEntry = { user_id: "test-user-id", team_id: null };
        const error = new Error("permission denied for table entries");
        mockDeleteEntryChain(existingEntry, { data: null, error });

        await expect(api.deleteEntry("entry-1")).rejects.toThrow(error);
      });
    });
  });

  describe("大会エントリー一括削除", () => {
    it("ユーザーがチーム管理者のときエントリーを一括削除できる", async () => {
      const mockCompetition = {
        team_id: "team-1",
      };

      const mockMembership = {
        role: "admin",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await api.deleteEntriesByCompetition("comp-1");

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith("entries");
    });

    it("ユーザーがチーム管理者でないときエラーになる", async () => {
      const mockCompetition = {
        team_id: "team-1",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          // requireTeamAdminは.eq('role', 'admin')でフィルタするため、
          // adminでない場合はnullが返る（該当データなし）
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(
        "管理者権限が必要です",
      );
    });

    it("チームメンバーでないときエラーになる", async () => {
      const mockCompetition = {
        team_id: "team-1",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(
        "管理者権限が必要です",
      );
    });

    it("チーム大会でないときエラーになる", async () => {
      const mockCompetition = {
        team_id: null, // 個人大会
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(
        "チーム大会ではありません",
      );
    });

    it("大会が見つからないときエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(
        "チーム大会ではありません",
      );
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow("認証が必要です");
    });

    it("大会取得時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const dbError = new Error("Database connection failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(dbError);
    });

    it("エントリー削除時にデータベースエラーが発生したときエラーを処理できる", async () => {
      const mockCompetition = {
        team_id: "team-1",
      };

      const mockMembership = {
        role: "admin",
      };

      const deleteError = new Error("Delete operation failed");

      mockClient.from = vi.fn((table: string) => {
        if (table === "competitions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          };
        } else if (table === "team_memberships") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          };
        } else if (table === "entries") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: deleteError,
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteEntriesByCompetition("comp-1")).rejects.toThrow(deleteError);
    });

    describe("competition_id単位の削除は0行許容 (回帰・意図的に0行ガードを付けない)", () => {
      it(
        "[D-5] エントリーが0件(削除0行)でもthrowせず正常に完了する" +
          "(0行ガードを追加していないことの担保。deleteEntryのようなid指定削除とは異なり、" +
          "エントリーが1件も無い大会の削除は正当な結果のため)",
        async () => {
          const mockCompetition = { team_id: "team-1" };
          const mockMembership = { role: "admin" };
          const entriesEqMock = vi.fn().mockResolvedValue({ data: [], error: null });

          mockClient.from = vi.fn((table: string) => {
            if (table === "competitions") {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: mockCompetition, error: null }),
              };
            } else if (table === "team_memberships") {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
              };
            } else if (table === "entries") {
              return {
                delete: vi.fn().mockReturnThis(),
                eq: entriesEqMock,
              };
            }
            return createMockQueryBuilder();
          }) as unknown as typeof mockClient.from;

          await expect(api.deleteEntriesByCompetition("comp-1")).resolves.toBeUndefined();
          expect(entriesEqMock).toHaveBeenCalledWith("competition_id", "comp-1");
        },
      );
    });
  });

  describe("個人エントリー作成", () => {
    it("認証済みユーザーのとき個人エントリーを作成できる", async () => {
      const mockEntry = {
        id: "entry-1",
        user_id: "test-user-id",
        team_id: null,
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      };

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockEntry,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      const result = await api.createPersonalEntry(entryData);

      expect(result).toEqual(mockEntry);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new EntryAPI(mockClient);

      const entryData = {
        competition_id: "comp-1",
        style_id: 1,
        entry_time: 60.5,
        note: "テストエントリー",
        is_relaying: false,
      };

      await expect(api.createPersonalEntry(entryData)).rejects.toThrow("認証が必要です");
    });
  });

  // ===========================================================================
  // Sprint Contract: チーム大会エントリーの管理者代理一括入力
  //
  // 実測 (2026-08-12, Phase B): `apps/shared/api/entries.ts` の createBulkEntries
  // は `.upsert(upsertData, { onConflict: "competition_id,user_id,style_id" })`
  // に置き換え済み。加えて Reviewer Critical#5 (チーム跨ぎの偽エントリー注入) の
  // 修正として、entries 配列の各要素の competitionId が teamId の大会に属するか、
  // userId が teamId のアクティブメンバーかを `competitions`/`team_memberships`
  // への `.in()` バッチクエリで検証してから upsert する実装になっている
  // (`entries.ts:247-275`)。deleteBulkEntries も `.eq("team_id", teamId)` を
  // 明示するようになった (`entries.ts:315-321`)。
  //
  // このテストは EntryAPI を実装のまま (プロダクションコード変更なし) 呼び出し、
  // 上記の実装が「他チームへの偽注入を防ぐ」という Sprint Contract 上の要求を
  // 実際に満たしているかを検証する。
  // ===========================================================================
  describe("一括エントリー作成（管理者代理入力・upsert化）", () => {
    /**
     * `team_memberships` は同一メソッド内で2回 (1: requireTeamAdmin の権限確認
     * `.single()`、2: メンバーシップ検証の `.in()`) 別チェーンで呼ばれるため、
     * table名だけでは区別できない。呼び出し順に異なるレスポンスを返す
     * シーケンス方式のモックを用意する。
     */
    function makeSequencedFrom(
      sequence: Record<string, Array<{ data: unknown; error: unknown }>>,
    ) {
      const counters: Record<string, number> = {};
      return vi.fn((table: string) => {
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const responses = sequence[table] ?? [];
        const resp = responses[idx] ?? responses[responses.length - 1] ?? { data: null, error: null };
        return createMockQueryBuilder(resp.data, resp.error);
      });
    }

    const adminMembership = { data: { role: "admin" }, error: null };

    it(
      "管理者が複数選手×複数種目のエントリーを一括作成できる" +
        "（人間の意図: 代理一括入力の基本動作。requireTeamAdmin通過 + " +
        "競合・メンバーシップ検証通過後、.upsert が正しいペイロードで呼ばれること）",
      async () => {
        mockClient.from = makeSequencedFrom({
          team_memberships: [adminMembership, { data: [{ user_id: "user-1" }, { user_id: "user-2" }], error: null }],
          competitions: [{ data: [{ id: "comp-1" }], error: null }],
          entries: [
            {
              data: [
                { id: "e-1", user_id: "user-1", style_id: 3, entry_time: 60.5 },
                { id: "e-2", user_id: "user-2", style_id: 9, entry_time: 40.0 },
              ],
              error: null,
            },
          ],
        }) as unknown as typeof mockClient.from;

        const entriesInput = [
          { userId: "user-1", competitionId: "comp-1", styleId: 3, entryTime: 60.5 },
          { userId: "user-2", competitionId: "comp-1", styleId: 9, entryTime: 40.0 },
        ];

        const result = await api.createBulkEntries("team-1", entriesInput);

        expect(result).toHaveLength(2);
      },
    );

    it(
      "upsert が .insert ではなく .upsert (onConflict: competition_id,user_id,style_id) で" +
        "呼ばれる（人間の意図: V-13の核心。既存の insert-only 実装だと一部選手が既にエントリー" +
        "済みの場合UNIQUE制約違反でバッチ全体が失敗する既知バグの回帰防止）",
      async () => {
        const entriesFromCall = vi.fn(() =>
          createMockQueryBuilder([{ id: "e-1" }], null),
        );
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            // 1回目: requireTeamAdmin, 2回目: メンバーシップ検証
            const builder = createMockQueryBuilder(
              [{ user_id: "user-1" }],
              null,
            );
            builder.single.mockResolvedValue(adminMembership);
            return builder;
          }
          if (table === "competitions") {
            return createMockQueryBuilder([{ id: "comp-1" }], null);
          }
          if (table === "entries") {
            return entriesFromCall();
          }
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;

        await api.createBulkEntries("team-1", [
          { userId: "user-1", competitionId: "comp-1", styleId: 3, entryTime: 60.5 },
        ]);

        const entriesBuilder = entriesFromCall.mock.results[0]?.value;
        expect(entriesBuilder.upsert).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ style_id: 3 })]),
          { onConflict: "competition_id,user_id,style_id" },
        );
        expect(entriesBuilder.insert).not.toHaveBeenCalled();
      },
    );

    it(
      "teamId=team-A の admin として、team-B に属する大会IDを含むエントリーを一括作成しようと" +
        "すると拒否される（人間の意図: Reviewer Critical#5 の再発防止。他チームへの" +
        "偽エントリー注入を requireTeamAdmin だけでは防げないため、competitionId が" +
        "teamId に属することの検証を回帰させないこと）",
      async () => {
        mockClient.from = makeSequencedFrom({
          team_memberships: [adminMembership, { data: [{ user_id: "user-1" }], error: null }],
          // competitions テーブルへの検証クエリが「team-Aに属する大会」を0件しか
          // 返さない = comp-in-team-B は team-A に属していない
          competitions: [{ data: [], error: null }],
        }) as unknown as typeof mockClient.from;

        await expect(
          api.createBulkEntries("team-A", [
            { userId: "user-1", competitionId: "comp-in-team-B", styleId: 3, entryTime: 60.5 },
          ]),
        ).rejects.toThrow("指定された大会はこのチームに属していません");
      },
    );

    it(
      "対象ユーザーが teamId のアクティブメンバーでない場合は拒否される" +
        "（人間の意図: Reviewer Critical#5 の別経路。競合大会は自チームでも、対象ユーザーが" +
        "他チームの人間である偽装エントリーを防ぐ）",
      async () => {
        mockClient.from = makeSequencedFrom({
          team_memberships: [adminMembership, { data: [], error: null }], // メンバーシップ検証が0件
          competitions: [{ data: [{ id: "comp-1" }], error: null }],
        }) as unknown as typeof mockClient.from;

        await expect(
          api.createBulkEntries("team-1", [
            { userId: "outsider-user", competitionId: "comp-1", styleId: 3, entryTime: 60.5 },
          ]),
        ).rejects.toThrow("指定されたユーザーはこのチームのメンバーではありません");
      },
    );

    it(
      "管理者権限を持たないユーザーが呼び出すとエラーになる（人間の意図: requireTeamAdmin " +
        "ガードの回帰防止）",
      async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            const builder = createMockQueryBuilder(null, null);
            builder.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
            return builder;
          }
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;

        await expect(
          api.createBulkEntries("team-1", [
            { userId: "user-1", competitionId: "comp-1", styleId: 3, entryTime: 60.5 },
          ]),
        ).rejects.toThrow("管理者権限が必要です");
      },
    );

    it(
      "entries 配列が空のとき何もせず空配列を返す（人間の意図: 境界値。0件バッチでAPIコールや" +
        "エラーを発生させないこと）",
      async () => {
        const fromSpy = vi.fn(() => createMockQueryBuilder());
        mockClient.from = fromSpy as unknown as typeof mockClient.from;

        const result = await api.createBulkEntries("team-1", []);

        expect(result).toEqual([]);
        expect(fromSpy).not.toHaveBeenCalled();
      },
    );

    it(
      "entryTime が undefined の選手は entry_time: null として保存される（人間の意図: " +
        "タイム未入力＝エントリーのみ先行登録というユースケースを壊さない）",
      async () => {
        const entriesFromCall = vi.fn(() => createMockQueryBuilder([{ id: "e-1" }], null));
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            const builder = createMockQueryBuilder([{ user_id: "user-1" }], null);
            builder.single.mockResolvedValue(adminMembership);
            return builder;
          }
          if (table === "competitions") return createMockQueryBuilder([{ id: "comp-1" }], null);
          if (table === "entries") return entriesFromCall();
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;

        await api.createBulkEntries("team-1", [
          { userId: "user-1", competitionId: "comp-1", styleId: 3 },
        ]);

        const entriesBuilder = entriesFromCall.mock.results[0]?.value;
        expect(entriesBuilder.upsert).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ entry_time: null })]),
          expect.anything(),
        );
      },
    );

    it(
      "データベースエラー（ネットワークエラー含む）が発生したときエラーを呼び出し元に伝播する" +
        "（人間の意図: 異常系。エラーを握り潰して成功したように見せない）",
      async () => {
        const dbError = new Error("Database connection failed");
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            const builder = createMockQueryBuilder([{ user_id: "user-1" }], null);
            builder.single.mockResolvedValue(adminMembership);
            return builder;
          }
          if (table === "competitions") return createMockQueryBuilder([{ id: "comp-1" }], null);
          if (table === "entries") return createMockQueryBuilder(null, dbError);
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;

        await expect(
          api.createBulkEntries("team-1", [
            { userId: "user-1", competitionId: "comp-1", styleId: 3, entryTime: 60.5 },
          ]),
        ).rejects.toThrow(dbError);
      },
    );
  });

  describe("一括エントリー削除（管理者代理一括入力の差分保存）", () => {
    it(
      "entryIds が空のとき何もせず、requireTeamAdmin も呼ばれない（人間の意図: 境界値。" +
        "削除対象が0件のときに不要な権限チェッククエリを発生させないこと）",
      async () => {
        const fromSpy = vi.fn(() => createMockQueryBuilder());
        mockClient.from = fromSpy as unknown as typeof mockClient.from;

        await api.deleteBulkEntries("team-1", []);

        expect(fromSpy).not.toHaveBeenCalled();
      },
    );

    it(
      "削除クエリが .eq('team_id', teamId) を経由する（人間の意図: Reviewer申し送り#6。" +
        "teamId に属さない entries.id が混在しても、このチームのエントリーだけが削除対象になる" +
        "という契約をコードレベルで保証する多層防御。実際のクロスチームDB検証は" +
        "RLSレベルの統合テストに委ねる、とこのテストのコメントで明示する）",
      async () => {
        // .select("id") で削除結果行数を判定するため(0行ガード)、1行を返して非退行を保つ。
        const entriesBuilder = createMockQueryBuilder([{ id: "entry-1" }], null);
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            const builder = createMockQueryBuilder([{ user_id: "user-1" }], null);
            builder.single.mockResolvedValue({ data: { role: "admin" }, error: null });
            return builder;
          }
          if (table === "entries") return entriesBuilder;
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;

        await expect(
          api.deleteBulkEntries("team-1", ["entry-1", "entry-2"]),
        ).resolves.toBeUndefined();

        expect(entriesBuilder.delete).toHaveBeenCalled();
        expect(entriesBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
        expect(entriesBuilder.in).toHaveBeenCalledWith("id", ["entry-1", "entry-2"]);
        expect(entriesBuilder.select).toHaveBeenCalledWith("id");
      },
    );

    it("管理者権限を持たないユーザーが呼ぶとエラーになる", async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === "team_memberships") {
          const builder = createMockQueryBuilder(null, null);
          builder.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
          return builder;
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;

      await expect(api.deleteBulkEntries("team-1", ["entry-1"])).rejects.toThrow(
        "管理者権限が必要です",
      );
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      const mockAdminAndEntries = (entriesResponse: { data: unknown; error: unknown }) => {
        const entriesBuilder = createMockQueryBuilder(
          entriesResponse.data,
          entriesResponse.error,
        );
        mockClient.from = vi.fn((table: string) => {
          if (table === "team_memberships") {
            const builder = createMockQueryBuilder([{ user_id: "user-1" }], null);
            builder.single.mockResolvedValue({ data: { role: "admin" }, error: null });
            return builder;
          }
          if (table === "entries") return entriesBuilder;
          return createMockQueryBuilder();
        }) as unknown as typeof mockClient.from;
        return entriesBuilder;
      };

      it("[D-6] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const entriesBuilder = mockAdminAndEntries({ data: [], error: null });

        await expect(api.deleteBulkEntries("team-1", ["entry-1"])).rejects.toThrow(
          "エントリーの一括削除に失敗しました",
        );
        expect(entriesBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
        expect(entriesBuilder.in).toHaveBeenCalledWith("id", ["entry-1"]);
        expect(entriesBuilder.select).toHaveBeenCalledWith("id");
      });

      it("[D-7] dataがnullの場合もエラーをthrowする", async () => {
        mockAdminAndEntries({ data: null, error: null });

        await expect(api.deleteBulkEntries("team-1", ["entry-1"])).rejects.toThrow(
          "エントリーの一括削除に失敗しました",
        );
      });

      it("[D-8] 1行以上返った場合は正常終了する(非退行)", async () => {
        const entriesBuilder = mockAdminAndEntries({
          data: [{ id: "entry-1" }, { id: "entry-2" }],
          error: null,
        });

        await expect(
          api.deleteBulkEntries("team-1", ["entry-1", "entry-2"]),
        ).resolves.toBeUndefined();
        expect(entriesBuilder.select).toHaveBeenCalledWith("id");
      });

      it("[D-9] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table entries");
        mockAdminAndEntries({ data: null, error });

        await expect(api.deleteBulkEntries("team-1", ["entry-1"])).rejects.toThrow(error);
      });
    });
  });
});
