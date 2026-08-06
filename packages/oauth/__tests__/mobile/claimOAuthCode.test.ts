/**
 * claimOAuthCode (src/mobile/claimOAuthCode.ts) の単体テスト。
 *
 * Sprint Contract: @swimhub/oauth の中核的価値 — 同一 PKCE 認可コードが
 * 複数の呼び出し元 (例: signInWithGoogle の warm path と、各アプリ側の
 * グローバル Linking ハンドラの安全網) に届いた場合、最初に claim した側だけが
 * 実際に exchangeCodeForSession を実行し、後から来た側はその結果を共有する
 * という契約を固定する。scanner/swim-hub の既存 useGoogleAuth にはこのガードが
 * 無かった (=このパッケージ化によって初めて両アプリにも適用される安全策) ため、
 * 特に厳密に検証する。
 *
 * 移植元: swimhub-timer/apps/mobile/lib/google-auth.ts の claimOAuthCode と、
 * その既存テスト swimhub-timer/apps/mobile/__tests__/googleAuthClaimOAuthCode.test.ts
 * (Jest構文) を Vitest 構文に機械的に変換したもの。ロジック自体は移植元から
 * 変更していない (依存ゼロの純粋なモジュールスコープ状態管理のため変換は
 * describe/it/expect の構文差のみ)。
 *
 * 注意: claimedOAuthCodes はモジュールスコープの Map でテスト間でリセットされない
 * (プロダクションコードにテスト専用のリセット口を開けない方針を踏襲する)。
 * 同一 code 文字列を複数の it で使い回すと、既に他のテストが消費した状態が残り
 * 意図しない claimed:false が返るため、各テストケースで一意な code 文字列を用いる。
 */
import { describe, it, expect } from "vitest";
import { claimOAuthCode } from "../../src/mobile/claimOAuthCode";

describe("claimOAuthCode", () => {
  it("[V-01] 同一 code を2回渡すと1回目 claimed:true・2回目 claimed:false を返す", () => {
    const code = "claim-test-same-code-001";
    expect(claimOAuthCode(code)).toEqual({ claimed: true, resolve: expect.any(Function) });
    expect(claimOAuthCode(code)).toEqual({ claimed: false, result: expect.any(Promise) });
  });

  it("[V-02] 異なる code ならどちらも claimed:true を返す (それぞれ独立した OAuth コールバックとして扱われる)", () => {
    expect(claimOAuthCode("claim-test-diff-code-a").claimed).toBe(true);
    expect(claimOAuthCode("claim-test-diff-code-b").claimed).toBe(true);
  });

  it("[V-03] 同一 code への3回目以降の呼び出しも claimed:false のままである (消費済み状態が固定される)", () => {
    const code = "claim-test-same-code-002";
    expect(claimOAuthCode(code).claimed).toBe(true);
    expect(claimOAuthCode(code).claimed).toBe(false);
    expect(claimOAuthCode(code).claimed).toBe(false);
  });

  it("[V-04] MAX_TRACKED_CODES (5件) を超えると最も古いものが追い出され、再度 claimed:true で claim できる", () => {
    const codes = [
      "claim-test-evict-1",
      "claim-test-evict-2",
      "claim-test-evict-3",
      "claim-test-evict-4",
      "claim-test-evict-5",
      "claim-test-evict-6",
    ];
    // 6件を連続で新規 claim する。新規 code なのでどれも claimed:true。
    for (const code of codes) {
      expect(claimOAuthCode(code).claimed).toBe(true);
    }
    // 6件目の push で保持数が5を超え、最も古い1件目 (evict-1) が追い出される
    // (6件連続で新規 push すれば直近5件だけが残る仕様のため、evict-1 の追い出しは
    // 他のテストからの残留エントリの有無に関わらず確定的に発生する)。
    // 追い出された code は「未処理」扱いに戻るため、再度 claim すると claimed:true になる。
    expect(claimOAuthCode("claim-test-evict-1").claimed).toBe(true);

    // この再 claim 自体が新規 push のため、今度は evict-2 が追い出される。
    // 一方 evict-6 (直近に push されたもの) はまだ保持されているため claimed:false のまま。
    expect(claimOAuthCode("claim-test-evict-6").claimed).toBe(false);
  });

  it("[V-05] 勝った側が resolve({success:true}) すると、負けた側の result はそれを反映する", async () => {
    const code = "claim-test-resolve-success-001";
    const winner = claimOAuthCode(code);
    const loser = claimOAuthCode(code);
    if (!winner.claimed || loser.claimed) throw new Error("unexpected claim outcome");

    winner.resolve({ success: true });
    await expect(loser.result).resolves.toEqual({ success: true });
  });

  it("[V-06] 勝った側が resolve({success:false}) すると、負けた側の result はそれを反映する", async () => {
    const code = "claim-test-resolve-failure-001";
    const winner = claimOAuthCode(code);
    const loser = claimOAuthCode(code);
    if (!winner.claimed || loser.claimed) throw new Error("unexpected claim outcome");

    winner.resolve({ success: false });
    await expect(loser.result).resolves.toEqual({ success: false });
  });

  it("[V-07] 同一 code へ3人目以降が来ても、全員が同じ result を共有する", async () => {
    const code = "claim-test-resolve-shared-001";
    const winner = claimOAuthCode(code);
    const loserA = claimOAuthCode(code);
    const loserB = claimOAuthCode(code);
    if (!winner.claimed || loserA.claimed || loserB.claimed) {
      throw new Error("unexpected claim outcome");
    }

    winner.resolve({ success: true });
    await expect(loserA.result).resolves.toEqual({ success: true });
    await expect(loserB.result).resolves.toEqual({ success: true });
  });
});
