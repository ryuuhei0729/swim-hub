// QA (Sprint Contract V-03): DELETE /api/account/delete のストレージ削除失敗時の
// フェイルクローズ動作を検証する。
//
// 観点:
//   1. delete-user-storage Edge Function 呼び出しがリトライしても失敗し続けた場合、
//      auth.admin.deleteUser() が一切呼ばれないこと(孤児ストレージ防止の裏側=
//      「孤児アカウント無しストレージ残存」ではなく「アカウントも残す」フェイルクローズ)。
//   2. 呼び出し元は 500 を返し、クライアントにエラーが伝わること。
//   3. リトライは最大3回まで試行されること(常時失敗ケースで invoke 呼び出し回数を数える)。
//   4. 1〜2回目が失敗し3回目で成功する場合は deleteUser が呼ばれ 200 が返ること。
//   5. 認証ヘッダーが無い/無効な場合、ストレージ削除にも deleteUser にも到達しないこと。
//
// トートロジー回避: 実ルートハンドラ (DELETE) を import し、依存モジュール
// (@supabase/supabase-js の createClient, @/lib/supabase-server の createAdminClient)
// のみを vi.mock で差し替える。retry回数・deleteUser呼び出しの有無という
// 「観測可能な副作用」のみを assertion 対象にする。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: vi.fn(() => ({
      auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    })),
  };
});

const practicesDeleteMock = vi.fn();
const competitionsDeleteMock = vi.fn();
const functionsInvokeMock = vi.fn();
const deleteUserMock = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "practices") {
        return { delete: () => ({ eq: () => ({ is: () => practicesDeleteMock() }) }) };
      }
      if (table === "competitions") {
        return { delete: () => ({ eq: () => ({ is: () => competitionsDeleteMock() }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    functions: { invoke: (...args: unknown[]) => functionsInvokeMock(...args) },
    auth: { admin: { deleteUser: (...args: unknown[]) => deleteUserMock(...args) } },
  })),
}));

import { DELETE } from "@/app/api/account/delete/route";

function makeAuthedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "DELETE",
    headers: { Authorization: "Bearer valid-access-token" },
  });
}

const VALID_USER = { id: "user-under-test", email: "a@example.com" };

describe("DELETE /api/account/delete - ストレージ削除失敗時のフェイルクローズ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getUserMock.mockReset();
    practicesDeleteMock.mockReset().mockResolvedValue({ error: null });
    competitionsDeleteMock.mockReset().mockResolvedValue({ error: null });
    functionsInvokeMock.mockReset();
    deleteUserMock.mockReset().mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: VALID_USER }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ストレージ削除が3回とも失敗したら deleteUser を一切呼ばず500を返す", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: null,
      error: { message: "edge function down" },
    });

    const promise = DELETE(makeAuthedRequest());
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(500);
    expect(functionsInvokeMock).toHaveBeenCalledTimes(3);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("3回目のリトライで成功したら deleteUser が呼ばれ200が返る", async () => {
    functionsInvokeMock
      .mockResolvedValueOnce({ data: null, error: { message: "cold start" } })
      .mockResolvedValueOnce({ data: null, error: { message: "cold start" } })
      .mockResolvedValueOnce({ data: { success: true }, error: null });

    const promise = DELETE(makeAuthedRequest());
    await vi.runAllTimersAsync();
    const response = await promise;
    const body = (await response.json()) as { success: boolean };

    expect(functionsInvokeMock).toHaveBeenCalledTimes(3);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith(VALID_USER.id);
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("data.success が false (HTTPエラーは無いがアプリレベルで失敗) の場合もdeleteUserを呼ばない", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: { success: false, errors: ["R2 delete failed"] },
      error: null,
    });

    const promise = DELETE(makeAuthedRequest());
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(functionsInvokeMock).toHaveBeenCalledTimes(3);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
  });

  it("Authorizationヘッダーが無い場合、ストレージ削除にもdeleteUserにも到達しない", async () => {
    const request = new NextRequest("http://localhost/api/account/delete", { method: "DELETE" });

    const response = await DELETE(request);

    expect(response.status).toBe(401);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(practicesDeleteMock).not.toHaveBeenCalled();
  });

  it("アクセストークンが無効(getUserがエラー)な場合、401を返し何も削除しない", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(401);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("ストレージ削除は成功したがauth.admin.deleteUser自体がエラーを返す場合は500", async () => {
    functionsInvokeMock.mockResolvedValue({ data: { success: true }, error: null });
    deleteUserMock.mockResolvedValue({ error: { message: "deleteUser failed" } });

    const promise = DELETE(makeAuthedRequest());
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });
});

// QA追記 (PM依頼): isUserAlreadyDeletedError による deleteUser 冪等性の固定。
//
// 背景: ローカル GoTrue (supabase auth.admin.deleteUser) に対し実際に同一ユーザーを
// 2回削除する実測を行ったところ、2回目は必ず
//   { __isAuthError: true, name: "AuthApiError", status: 404, code: "user_not_found" }
// という形の AuthApiError インスタンスを返すことを確認した(文字列一致ではなく
// status/code の実物の形)。以下のモックはこの実測結果に基づく。
//
// 「広すぎる判定になっていないか」を証明するため、status のみ一致・code のみ一致・
// どちらも一致しない汎用エラーのケースでは従来通り500になることも併せて固定する。
describe("DELETE /api/account/delete - deleteUser 冪等性 (already-deleted は成功扱い)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getUserMock.mockReset();
    practicesDeleteMock.mockReset().mockResolvedValue({ error: null });
    competitionsDeleteMock.mockReset().mockResolvedValue({ error: null });
    functionsInvokeMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
    deleteUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: VALID_USER }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("実測したGoTrueの形 (status:404, code:user_not_found) では200になり退会成功扱いになる", async () => {
    deleteUserMock.mockResolvedValue({
      error: {
        __isAuthError: true,
        name: "AuthApiError",
        status: 404,
        code: "user_not_found",
        message: "User not found",
      },
    });

    const promise = DELETE(makeAuthedRequest());
    await vi.runAllTimersAsync();
    const response = await promise;
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("status:500 (無関係なエラー) では従来通り500になる", async () => {
    deleteUserMock.mockResolvedValue({
      error: { status: 500, code: "unexpected_failure", message: "boom" },
    });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(500);
  });

  it("status:404だがcodeがuser_not_found以外なら500になる (codeも見ていることの証明)", async () => {
    deleteUserMock.mockResolvedValue({
      error: { status: 404, code: "some_other_not_found", message: "not found but different" },
    });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(500);
  });

  it("code:user_not_foundだがstatusが404以外なら500になる (statusも見ていることの証明)", async () => {
    deleteUserMock.mockResolvedValue({
      error: { status: 400, code: "user_not_found", message: "malformed" },
    });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(500);
  });

  it("status/codeを持たない汎用エラーでは500になる (すべてのエラーを成功扱いにしていないことの証明)", async () => {
    deleteUserMock.mockResolvedValue({ error: { message: "generic network error" } });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(500);
  });

  it("エラーがnull以外のプリミティブ(文字列)であっても成功扱いにせず500になる", async () => {
    // isUserAlreadyDeletedError の typeof チェック分岐 (object以外は false) を固定する。
    deleteUserMock.mockResolvedValue({ error: "some string error" as unknown as Error });

    const response = await DELETE(makeAuthedRequest());

    expect(response.status).toBe(500);
  });
});
