// QA Phase B (W-1, 最重点・セキュリティ): 代理動画アップロードの認可ヘルパ video-authz の観点検証。
//
// 検証する不変条件 (Sprint Contract Checklist 2):
//   - 本人 (owner === caller) は常に許可。
//   - 代理は「当該 team の active admin (is_active=true AND role='admin')」のみ許可。
//   - 個人 (team_id NULL) は本人のみ。代理不可。
//   - 非 admin メンバー / 他チームの admin / 無関係ユーザーは他人のログ/記録を操作不可 (403)。
//   - practice-log は practice_logs.practice_id → practices.team_id を辿る。
//   - record は records.team_id を直接辿る。
//   - 存在しない対象は 404。
//
// トートロジー回避方針:
//   実装をコピーした assertion ではなく、「DB に存在する事実」をフェイクで定義し、
//   ヘルパが正しい列 (team_id / user_id / role / is_active) で突合しているかを
//   フェイクへ渡されたフィルタ条件を記録して検証する (=実装の SQL 突合の観点を独立に固定)。
import { describe, it, expect, vi } from "vitest";
import {
  authorizeRecordVideoMutation,
  authorizePracticeLogVideoMutation,
} from "@/lib/video-authz";

// ---- フェイク Supabase クライアント ----
// .from(table).select(...).eq(col,val)....single()/maybeSingle() のチェーンを再現する。
// 各 .eq() で適用された条件を記録し、テーブルごとの「行」フィクスチャから
// 全条件にマッチする 1 行を返す (PostgREST single/maybeSingle 相当)。

type Row = Record<string, unknown>;

interface FakeDb {
  // テーブル名 → 行配列
  [table: string]: Row[];
}

function createFakeSupabase(db: FakeDb) {
  // 各テーブルへの問い合わせ時に適用された eq 条件を記録 (突合カラム検証用)
  const queries: Array<{ table: string; filters: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const record = { table, filters };
      queries.push(record);

      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      };
      const resolve = () => {
        const rows = db[table] ?? [];
        const match = rows.find((r) =>
          Object.entries(filters).every(([c, v]) => r[c] === v),
        );
        return match
          ? { data: match, error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      };
      builder.single = () => Promise.resolve(resolve());
      builder.maybeSingle = () => Promise.resolve(resolve());
      return builder;
    },
  };

  // 型は実装が要求する SupabaseClient<Database> をテスト用に緩める。
  // (video-authz は from/select/eq/single/maybeSingle のみ使用)
  return { client: client as unknown as Parameters<typeof authorizeRecordVideoMutation>[0], queries };
}

const COACH = "coach-uuid";
const MEMBER = "member-uuid";
const OUTSIDER = "outsider-uuid";
const TEAM = "team-uuid";
const OTHER_TEAM = "other-team-uuid";

// =============================================================================
// authorizeRecordVideoMutation
// =============================================================================
describe("authorizeRecordVideoMutation", () => {
  it("本人所有の記録は許可 (owner === caller)", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", MEMBER);
    expect(res).toEqual({ ok: true });
  });

  it("チーム記録: 当該 team の active admin による代理は許可", async () => {
    const { client, queries } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
        // W-a: 対象 owner (MEMBER) が active member であることが代理許可の必須条件
        { team_id: TEAM, user_id: MEMBER, role: "member", is_active: true },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res).toEqual({ ok: true });

    // active admin 突合が role='admin' かつ is_active=true で行われたことを確認
    const tmQuery = queries.find((q) => q.table === "team_memberships");
    expect(tmQuery?.filters).toMatchObject({
      team_id: TEAM,
      user_id: COACH,
      role: "admin",
      is_active: true,
    });
  });

  it("チーム記録: 非 admin メンバー (active だが role!=admin) の代理は 403", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      // OUTSIDER は同チームだが member ロール
      team_memberships: [
        { team_id: TEAM, user_id: OUTSIDER, role: "member", is_active: true },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", OUTSIDER);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });

  it("チーム記録: 非 active admin (停止中) の代理は 403", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: false },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res.ok).toBe(false);
  });

  it("チーム記録: 他チームの admin による代理は 403 (team 不一致)", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      // COACH は OTHER_TEAM の admin (当該 record の TEAM では admin でない)
      team_memberships: [
        { team_id: OTHER_TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });

  it("個人記録 (team_id NULL): 本人のみ許可、他者 admin でも 403", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: null }],
      // たとえ admin 行があっても個人記録は代理不可
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    expect(await authorizeRecordVideoMutation(client, "rec1", MEMBER)).toEqual({ ok: true });
    expect(await authorizeRecordVideoMutation(client, "rec1", COACH)).toEqual({
      ok: false,
      status: 403,
      error: "権限がありません",
    });
  });

  it("存在しない記録は 404", async () => {
    const { client } = createFakeSupabase({ records: [] });
    const res = await authorizeRecordVideoMutation(client, "missing", COACH);
    expect(res).toEqual({ ok: false, status: 404, error: "記録が見つかりません" });
  });

  it("record の team は records.team_id を直接辿る (practice を引かない)", async () => {
    const { client, queries } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(queries.some((q) => q.table === "practices")).toBe(false);
    expect(queries.some((q) => q.table === "records")).toBe(true);
  });

  // ---- W-a: 対象 owner が active member であることの検証 ----
  // 退会済みメンバーの過去記録に admin が代理操作しようとした場合、RLS では 0 行更新に
  // なるため、認可ヘルパも早期 403 にして loud に弾く (無音 false-success 防止)。
  it("W-a: チーム記録だが対象 owner が退会済み (is_active=false) なら 403", async () => {
    const { client, queries } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        // caller は active admin
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
        // 対象 owner (MEMBER) は同チームだが退会済み
        { team_id: TEAM, user_id: MEMBER, role: "member", is_active: false },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });

    // 対象 owner の active member 突合が user_id=MEMBER かつ is_active=true で
    // 行われた (= RLS 同条件) ことを検証。トートロジー回避のため突合カラムを固定する。
    const memberCheck = queries.find(
      (q) =>
        q.table === "team_memberships" &&
        q.filters.user_id === MEMBER &&
        q.filters.is_active === true,
    );
    expect(memberCheck).toBeDefined();
    expect(memberCheck?.filters).toMatchObject({ team_id: TEAM, user_id: MEMBER, is_active: true });
  });

  it("W-a: 対象 owner が当該 team に所属しない (membership 行が無い) なら 403", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        // caller は active admin だが、MEMBER の membership 行が存在しない
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });

  it("W-a: 対象 owner の active member 判定は role 非依存 (member ロールでも active なら許可)", async () => {
    const { client } = createFakeSupabase({
      records: [{ id: "rec1", user_id: MEMBER, team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
        // 対象 owner は通常メンバー (role=member) だが active → 許可されるべき
        { team_id: TEAM, user_id: MEMBER, role: "member", is_active: true },
      ],
    });
    const res = await authorizeRecordVideoMutation(client, "rec1", COACH);
    expect(res).toEqual({ ok: true });
  });
});

// =============================================================================
// authorizePracticeLogVideoMutation
// =============================================================================
describe("authorizePracticeLogVideoMutation", () => {
  it("本人所有の練習ログは許可 (owner === caller)", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", MEMBER);
    expect(res).toEqual({ ok: true });
  });

  it("チーム練習: practice_id→practices.team_id を辿り active admin の代理を許可", async () => {
    const { client, queries } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
        // W-a: 対象 owner (MEMBER) が active member であることが代理許可の必須条件
        { team_id: TEAM, user_id: MEMBER, role: "member", is_active: true },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", COACH);
    expect(res).toEqual({ ok: true });

    // practice を practice_id で正しく辿ったことを確認 (traversal の独立検証)
    const practiceQuery = queries.find((q) => q.table === "practices");
    expect(practiceQuery?.filters).toMatchObject({ id: "p1" });
  });

  it("チーム練習: 非 admin メンバーの代理は 403", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: OUTSIDER, role: "member", is_active: true },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", OUTSIDER);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });

  it("チーム練習: 他チーム admin の代理は 403", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: OTHER_TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });

  it("個人練習ログ (practice.team_id NULL): 本人のみ、他者 admin でも 403", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: null }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    expect(await authorizePracticeLogVideoMutation(client, "log1", MEMBER)).toEqual({ ok: true });
    expect(await authorizePracticeLogVideoMutation(client, "log1", COACH)).toEqual({
      ok: false,
      status: 403,
      error: "権限がありません",
    });
  });

  it("存在しない練習ログは 404", async () => {
    const { client } = createFakeSupabase({ practice_logs: [] });
    const res = await authorizePracticeLogVideoMutation(client, "missing", COACH);
    expect(res).toEqual({ ok: false, status: 404, error: "練習ログが見つかりません" });
  });

  it("非 active admin (停止中) の代理は 403", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: false },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", COACH);
    expect(res.ok).toBe(false);
  });

  // ---- W-a: 対象 owner が active member であることの検証 ----
  it("W-a: チーム練習だが対象 owner が退会済み (is_active=false) なら 403", async () => {
    const { client, queries } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
        // 対象 owner (MEMBER) は同チームだが退会済み
        { team_id: TEAM, user_id: MEMBER, role: "member", is_active: false },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });

    // active member 突合が user_id=MEMBER かつ is_active=true で行われたことを確認
    const memberCheck = queries.find(
      (q) =>
        q.table === "team_memberships" &&
        q.filters.user_id === MEMBER &&
        q.filters.is_active === true,
    );
    expect(memberCheck?.filters).toMatchObject({ team_id: TEAM, user_id: MEMBER, is_active: true });
  });

  it("W-a: 対象 owner が当該 team に所属しない (membership 行が無い) なら 403", async () => {
    const { client } = createFakeSupabase({
      practice_logs: [{ id: "log1", user_id: MEMBER, practice_id: "p1" }],
      practices: [{ id: "p1", team_id: TEAM }],
      team_memberships: [
        { team_id: TEAM, user_id: COACH, role: "admin", is_active: true },
      ],
    });
    const res = await authorizePracticeLogVideoMutation(client, "log1", COACH);
    expect(res).toEqual({ ok: false, status: 403, error: "権限がありません" });
  });
});

// サニティ: vi が利用可能 (setup 確認用、no-op)
describe("test harness sanity", () => {
  it("vi is available", () => {
    expect(typeof vi.fn).toBe("function");
  });
});
