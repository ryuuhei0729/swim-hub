/**
 * auth.getUser() が通信エラーで user を返せなかったとき、「認証が必要です」に化けず
 * 通信エラーとして伝わることの回帰テスト。
 *
 * 背景: getUser() はサーバーに問い合わせるため、圏外・低速回線では user が null になる。
 * 以前は API 層が一律に「認証が必要です」を投げており、表示側で通信エラーと判別できず
 * 「保存に失敗しました」等の汎用文言になっていた。
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authRequiredError, requireAuth } from "../../api/auth-utils";
import { PracticeLogTemplateAPI } from "../../api/practiceLogTemplates";
import { UserFacingError } from "../../utils/userFacingError";
import { isNetworkError } from "../../utils/networkError";

const offlineAuthError = Object.assign(new Error("Network request failed"), {
  name: "AuthRetryableFetchError",
  status: 0,
});

function clientWithGetUser(result: {
  data: { user: unknown };
  error: unknown;
}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue(result) },
    from: vi.fn(),
  } as unknown as SupabaseClient;
}

describe("authRequiredError", () => {
  it("通信エラーなら元のエラーをそのまま返す", () => {
    expect(authRequiredError(offlineAuthError)).toBe(offlineAuthError);
  });

  it("通信以外 (未ログイン等) なら「認証が必要です」", () => {
    const err = authRequiredError(new Error("Auth session missing!"));
    expect(err.message).toBe("認証が必要です");
    expect(authRequiredError(null).message).toBe("認証が必要です");
  });
});

describe("requireAuth", () => {
  it("通信エラーのときは通信エラーを投げる (UserFacingError にしない)", async () => {
    const supabase = clientWithGetUser({
      data: { user: null },
      error: offlineAuthError,
    });
    const error = await requireAuth(supabase).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(UserFacingError);
    expect(isNetworkError(error)).toBe(true);
  });

  it("未ログインのときは従来どおり UserFacingError「認証が必要です」", async () => {
    const supabase = clientWithGetUser({
      data: { user: null },
      error: Object.assign(new Error("Auth session missing!"), {
        name: "AuthSessionMissingError",
        status: 400,
      }),
    });
    await expect(requireAuth(supabase)).rejects.toThrow(
      new UserFacingError("認証が必要です"),
    );
  });

  it("ユーザーが取れれば id を返す", async () => {
    const supabase = clientWithGetUser({
      data: { user: { id: "u1" } },
      error: null,
    });
    await expect(requireAuth(supabase)).resolves.toBe("u1");
  });
});

describe("API メソッド (例: PracticeLogTemplateAPI.createTemplate)", () => {
  it("getUser() が通信エラーなら、その通信エラーを投げる", async () => {
    const supabase = clientWithGetUser({
      data: { user: null },
      error: offlineAuthError,
    });
    const api = new PracticeLogTemplateAPI(supabase);
    const error = await api
      .createTemplate(
        {} as Parameters<PracticeLogTemplateAPI["createTemplate"]>[0],
      )
      .catch((e: unknown) => e);
    expect(isNetworkError(error)).toBe(true);
  });

  it("getUser() が単に user なしなら、従来どおり「認証が必要です」", async () => {
    const supabase = clientWithGetUser({ data: { user: null }, error: null });
    const api = new PracticeLogTemplateAPI(supabase);
    await expect(
      api.createTemplate(
        {} as Parameters<PracticeLogTemplateAPI["createTemplate"]>[0],
      ),
    ).rejects.toThrow("認証が必要です");
  });
});
