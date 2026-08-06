/**
 * signInWithGoogle (src/mobile/useGoogleAuth.ts) — claimOAuthCode を介した
 * 実際の競合 (レース) シナリオの結合テスト。
 *
 * timer アプリの app/_layout.tsx にあるようなグローバル Linking ハンドラ (安全網)
 * は各アプリ側の責務でありこのパッケージの外側にあるため、ここでは
 *   (a) signInWithGoogle 自体を同一 code で疑似同時に複数回呼び出すケース、
 *   (b) claimOAuthCode を直接呼んで「パッケージ外の別経路が先に処理済み」の
 *       状態を作るケース
 * の両方で、claimOAuthCode.test.ts の契約が signInWithGoogle 経由でも実際に
 * 守られることを検証する。
 *
 * signInWithGoogle.claimGuard.test.ts が「1回の呼び出し」の分岐を検証するのに
 * 対し、本ファイルは「2つ以上の呼び出しが同じ code を奪い合う」実バグシナリオ
 * (timer の PM依頼4-4 相当) の再現に特化する。
 *
 * 決定性についての注記: [V-35]/[V-36] は Promise.all で2つの signInWithGoogle
 * 呼び出しを開始する。両呼び出しは全く同一の関数・同一の await 構造を辿るため、
 * マイクロタスクの実行順は常に「先に呼び出された側が先に claimOAuthCode に到達する」
 * 形で確定し (どちらが先に呼ばれたかによらず、claim の同期性そのものが二重実行を
 * 防ぐという契約を検証したいので)、本テストでは「どちらが勝つか」ではなく
 * 「合計1回しか交換が起きず、両者が一貫した結果を受け取る」ことだけを assert する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(),
  maybeCompleteAuthSession: vi.fn(),
}));
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(() => "swimhub-test://auth/callback"),
}));

import * as WebBrowser from "expo-web-browser";
import { signInWithGoogle } from "../../src/mobile/useGoogleAuth";
import { claimOAuthCode } from "../../src/mobile/claimOAuthCode";

const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as unknown as ReturnType<typeof vi.fn>;

function makeSupabaseMock() {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: "https://accounts.google.com/o/oauth2/mock-auth" },
        error: null,
      }),
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
    },
  };
}

function asSupabase(mock: ReturnType<typeof makeSupabaseMock>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithGoogle — 同一 code を複数呼び出しが疑似同時に奪い合う (V-35, V-36)", () => {
  it("[V-35] 同一 code で signInWithGoogle を2回疑似同時に (Promise.all で) 呼び出すと、exchangeCodeForSession は合計1回だけ呼ばれ、両方とも一貫した成功結果を返す", async () => {
    const code = "race-integration-001";
    const url = `swimhub-test://auth/callback?code=${code}`;
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "success", url });

    const supabaseA = makeSupabaseMock();
    const supabaseB = makeSupabaseMock();
    const success = { data: { session: { access_token: "t" } }, error: null };
    supabaseA.auth.exchangeCodeForSession.mockResolvedValue(success);
    supabaseB.auth.exchangeCodeForSession.mockResolvedValue(success);

    const [resultA, resultB] = await Promise.all([
      signInWithGoogle({ supabase: asSupabase(supabaseA), scheme: "swimhub-test" }),
      signInWithGoogle({ supabase: asSupabase(supabaseB), scheme: "swimhub-test" }),
    ]);

    const totalExchangeCalls =
      supabaseA.auth.exchangeCodeForSession.mock.calls.length +
      supabaseB.auth.exchangeCodeForSession.mock.calls.length;
    expect(totalExchangeCalls).toBe(1);
    expect(resultA).toEqual({ success: true });
    expect(resultB).toEqual({ success: true });
  });

  it("[V-36] 疑似同時呼び出しのうち claim に勝った側の交換が実際には失敗した場合、両方とも success:true を誤って返さない", async () => {
    const code = "race-integration-002";
    const url = `swimhub-test://auth/callback?code=${code}`;
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "success", url });

    const supabaseA = makeSupabaseMock();
    const supabaseB = makeSupabaseMock();
    const failure = { data: { session: null }, error: { message: "invalid_grant" } };
    supabaseA.auth.exchangeCodeForSession.mockResolvedValue(failure);
    supabaseB.auth.exchangeCodeForSession.mockResolvedValue(failure);

    const [resultA, resultB] = await Promise.all([
      signInWithGoogle({ supabase: asSupabase(supabaseA), scheme: "swimhub-test" }),
      signInWithGoogle({ supabase: asSupabase(supabaseB), scheme: "swimhub-test" }),
    ]);

    const totalExchangeCalls =
      supabaseA.auth.exchangeCodeForSession.mock.calls.length +
      supabaseB.auth.exchangeCodeForSession.mock.calls.length;
    expect(totalExchangeCalls).toBe(1);
    expect(resultA.success).toBe(false);
    expect(resultB.success).toBe(false);
  });
});

describe("signInWithGoogle — パッケージ外の別経路が先に claim 済みのケース (V-37, V-38, V-39)", () => {
  it("[V-37] 別経路が先に claim して成功していた場合、signInWithGoogle は exchangeCodeForSession を呼ばず success:true を返す", async () => {
    const code = "race-integration-003-external-success";
    const winnerClaim = claimOAuthCode(code);
    if (!winnerClaim.claimed) throw new Error("test setup failed: code already claimed");
    winnerClaim.resolve({ success: true });

    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("[V-38] 別経路が先に claim して失敗していた場合、signInWithGoogle は success:false を返す", async () => {
    const code = "race-integration-004-external-failure";
    const winnerClaim = claimOAuthCode(code);
    if (!winnerClaim.claimed) throw new Error("test setup failed: code already claimed");
    winnerClaim.resolve({ success: false });

    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("[V-39] signInWithGoogle が claim に勝った場合、その実際の交換結果が同一 code を後から claim しようとした別の待ち手にも伝播する", async () => {
    const code = "race-integration-005-propagate";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });
    expect(result).toEqual({ success: true });

    // signInWithGoogle 実行時点で code は既に claim 済みのはずなので、
    // 後から同じ code を claim しようとすると claimed:false になり、
    // signInWithGoogle が実際に確定させた結果 (成功) を観測できる。
    const lateClaim = claimOAuthCode(code);
    if (lateClaim.claimed) {
      throw new Error("test invariant violated: signInWithGoogle should have already claimed this code");
    }
    await expect(lateClaim.result).resolves.toEqual({ success: true });
  });
});

/**
 * Reviewer 指摘 (敵対的レビュー): 上記の V-35〜V-39 はいずれも
 * exchangeCodeForSession を mockResolvedValue (成功 or エラーオブジェクトを含む
 * 正常な resolve) でしか設定しておらず、claim に勝った側の交換呼び出しが
 * 実際に reject (例外) した場合の挙動を検証していなかった。
 *
 * (修正前の実装では) claim に勝った側の exchangeCodeForSession が reject すると、
 * outcome.resolve が一度も呼ばれないまま signInWithGoogle 自体が reject して
 * しまい、同じ code の outcome.result を待つ負けた側が永久にハングしていた
 * (App Developer 修正対応の Critical バグ本体)。
 *
 * ハング検出のため、実際の Promise が一定時間内に決着しない場合はタイムアウト
 * 用の sentinel 値を返す withHangGuard を使う。vitest のデフォルトテスト
 * タイムアウト (5000ms) に頼ると「ハングしている」ことの検出に毎回 5 秒
 * かかってしまい遅い上、失敗理由も "Test timed out" としか表示されないため、
 * 短時間 (300ms) で明示的に失敗させる。
 */
const HANG_GUARD_MS = 300;
const HANG_GUARD_TIMEOUT = "HANG_GUARD_TIMEOUT" as const;

function withHangGuard<T>(promise: Promise<T>, ms = HANG_GUARD_MS): Promise<T | typeof HANG_GUARD_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof HANG_GUARD_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(HANG_GUARD_TIMEOUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

describe("signInWithGoogle — claim に勝った側の exchangeCodeForSession が reject するレース (V-93, V-94)", () => {
  it("[V-93] 疑似同時呼び出しで claim に勝った側の exchangeCodeForSession が reject しても、両方の呼び出しが一定時間内に解決し (ハングしない)、どちらも success:false を返す", async () => {
    const code = "race-integration-006-exchange-reject";
    const url = `swimhub-test://auth/callback?code=${code}`;
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "success", url });

    const supabaseA = makeSupabaseMock();
    const supabaseB = makeSupabaseMock();
    const exchangeError = new Error("network down");
    supabaseA.auth.exchangeCodeForSession.mockRejectedValue(exchangeError);
    supabaseB.auth.exchangeCodeForSession.mockRejectedValue(exchangeError);

    const callA = signInWithGoogle({ supabase: asSupabase(supabaseA), scheme: "swimhub-test" });
    const callB = signInWithGoogle({ supabase: asSupabase(supabaseB), scheme: "swimhub-test" });

    const settled = await withHangGuard(Promise.allSettled([callA, callB]));

    if (settled === HANG_GUARD_TIMEOUT) {
      throw new Error(
        "signInWithGoogle が一定時間内に解決しなかった (claim に負けた側が永久にハングしている疑いがある)",
      );
    }

    const [settledA, settledB] = settled;
    // 現在の実装は exchangeCodeForSession の reject を catch していないと、
    // claim に勝った側 (signInWithGoogle 自体) の呼び出しも reject してしまう。
    // このテストは「両方とも fulfilled (success:false) になる」ことを要求する。
    expect(settledA.status).toBe("fulfilled");
    expect(settledB.status).toBe("fulfilled");
    if (settledA.status === "fulfilled") {
      expect(settledA.value.success).toBe(false);
    }
    if (settledB.status === "fulfilled") {
      expect(settledB.value.success).toBe(false);
    }
  });

  it("[V-94] claim に勝った signInWithGoogle の exchangeCodeForSession が reject した場合、その失敗結果が後から同じ code を claim しようとした別の待ち手にも一定時間内に伝播する (ハングしない)", async () => {
    const code = "race-integration-007-exchange-reject-propagate";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockRejectedValue(new Error("network down"));
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    // signInWithGoogle 自体が reject したとしても (現在の実装が未修正の場合)、
    // claimOAuthCode による claim 自体は同期的に既に行われているはずなので、
    // その完了 (成功でも失敗でも reject でも) を待つ。
    await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" }).catch(() => undefined);

    const lateClaim = claimOAuthCode(code);
    if (lateClaim.claimed) {
      throw new Error("test invariant violated: signInWithGoogle should have already claimed this code");
    }

    const settled = await withHangGuard(lateClaim.result);
    if (settled === HANG_GUARD_TIMEOUT) {
      throw new Error(
        "claim した code の outcome.resolve が呼ばれておらず、後続の待ち手が永久にハングしている",
      );
    }
    expect(settled).toEqual({ success: false });
  });
});
