/**
 * claimOAuthCode の「クロスエントリポイント同期」に対する dual package hazard
 * 回帰テスト。
 *
 * 背景 (Reviewer 指摘): claimOAuthCode.ts のクロスエントリポイント同期は
 * モジュールスコープの `Map` (claimedOAuthCodes) に依存している。もし
 * dual package hazard (同一プロセス内で「同じロジックの別コピー」が別々に
 * ロードされる状態) が発生すると Map が2つに分裂し、claimOAuthCode.test.ts /
 * signInWithGoogle.claimGuard.test.ts / signInWithGoogle.raceIntegration.test.ts
 * が固定しているクロスエントリポイントの契約 (2回目以降の呼び出しは
 * claimed:false になり、勝った側の結果を共有する) が静かに再発する
 * — このパッケージ化そのものが解決しようとしているバグの再来になる。
 *
 * なぜ src/ を2回 import するだけでは検証にならないか:
 * 他の137件のテストはすべて `../../src/mobile/claimOAuthCode` を Vitest 自身の
 * 変換パイプライン (esbuild) 経由で読んでいる。同じ指定子を複数回 import しても
 * Vitest の単一モジュールグラフ内で自動的に重複排除されるため「別経路から
 * import しても同じインスタンスを指す」ことの証明にはならない (常に真になる
 * トートロジー)。dual package hazard は Node 本来のモジュール解決・キャッシュ
 * 機構 (require.cache) の話であり、ビルド後の dist/ に対して Node 本来の
 * require() を使わない限り再現も検証もできない。
 *
 * 検証方法:
 * - `node:module` の createRequire で Vitest を経由しない「素の Node の
 *   require()」を取得する。
 * - 経路A = パッケージ名の self-reference (`@ryuuhei0729/swimhub-oauth/mobile`)。
 *   package.json の "exports" マップを介して dist/mobile/index.js (バレル) に
 *   解決される — 外部消費者 (各アプリのグローバル Linking ハンドラ等) が
 *   claimOAuthCode を直接 import する経路を模す。
 * - 経路B = ビルド後 dist 内の相対パス直接 require (`../../dist/mobile/
 *   claimOAuthCode`)。dist/mobile/signInWithGoogle.js 自身が内部で
 *   `require("./claimOAuthCode")` と全く同じ解決方式 (拡張子なし相対パス) で
 *   claimOAuthCode に辿り着くのを模す。
 * - CJS 出力なら "require" 条件と "default" 条件が同一ファイルを指すため
 *   (dual package hazard が起きない構成)、経路A・経路Bは Node の
 *   require.cache 上で同一の module.exports を返すはずである。
 *
 * expo-web-browser / expo-auth-session のスタブについて:
 * dist/mobile/index.js (経路Aのバレル) は claimOAuthCode 以外に signInWithGoogle /
 * getRedirectUri も re-export しており、それらはモジュール読み込み時点で
 * expo-web-browser / expo-auth-session を require() する。この2つは Metro
 * (React Native バンドラ) 前提の解決 (react-native 条件つき exports・拡張子なし
 * ESM export・生の .ts ソースへの参照等) をしており、素の Node.js プロセスからは
 * 実測で読み込めない (このパッケージの CJS/ESM 化とは無関係な、expo 側の既知の
 * 制約。本番の Expo アプリは常に Metro 経由で読むためこの制約自体は問題にならない)。
 * signInWithGoogle.js・getRedirectUri.js はどちらもモジュール読み込み時点では
 * これらの named export を参照せず、実際に呼び出す関数本体の中でのみ参照するため、
 * Node の require.cache を空オブジェクトで事前に埋めるだけでバレルの読み込み自体は
 * 成立する (signInWithGoogle/getRedirectUri 自体の実際の動作は
 * signInWithGoogle.claimGuard.test.ts 等が Vitest の vi.mock 経由で別途検証済み)。
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

type ClaimOAuthCodeModule = {
  claimOAuthCode: typeof import("../../src/mobile/claimOAuthCode").claimOAuthCode;
};

interface FakeCjsModule {
  id: string;
  filename: string;
  loaded: boolean;
  exports: Record<string, never>;
}

// このテストファイル自身から見た「素の Node require()」。Vitest の変換パイプライン
// (vite-node) を経由しないため、self-reference 解決も require.cache も Node の
// 実装そのものになる。
const nodeRequire = createRequire(import.meta.url);

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const distMobileIndexPath = path.join(packageRoot, "dist/mobile/index.js");
const distMobileClaimOAuthCodePath = path.join(packageRoot, "dist/mobile/claimOAuthCode.js");

const NATIVE_ONLY_PEER_DEPENDENCIES = ["expo-web-browser", "expo-auth-session"] as const;
const stubbedCacheKeys: string[] = [];

beforeAll(() => {
  if (!existsSync(distMobileIndexPath) || !existsSync(distMobileClaimOAuthCodePath)) {
    // 他の137件のテストと異なり、このテストは dist/ の実体を検証するため、
    // 未ビルドなら (このパッケージの "build" スクリプトと同等の) tsc を
    // その場で実行し、実行順序 (build → test) に依存せず自己完結させる。
    //
    // --incremental false を明示するのは実測に基づく安全策: tsconfig.build.json
    // は library.json 由来で "incremental": true を継承しており、dist/ だけを
    // 手動削除して tsconfig.build.tsbuildinfo (増分ビルドキャッシュ) が残っている
    // 状態だと、tsc は「ソースは前回と変わっていない」と判断して出力ファイルの
    // 実在を確認せずに exit 0 で何もしない (実測済みの罠)。このフォールバックは
    // 「dist が無ければ必ず実体を生成する」ことが目的のため、増分キャッシュの
    // 判断に依存しない完全な再コンパイルを強制する。
    const tscBin = nodeRequire.resolve("typescript/bin/tsc");
    execFileSync(process.execPath, [tscBin, "-p", "tsconfig.build.json", "--incremental", "false"], {
      cwd: packageRoot,
      stdio: "pipe",
    });
  }

  // require.cache への直接書き込みは @types/node に型が無い内部 API のため、
  // このテストファイル内だけに閉じた最小限の型でキャストする (any は使わない)。
  const cache = (Module as unknown as { _cache: Record<string, FakeCjsModule> })._cache;
  for (const specifier of NATIVE_ONLY_PEER_DEPENDENCIES) {
    const resolvedPath = nodeRequire.resolve(specifier);
    cache[resolvedPath] = { id: resolvedPath, filename: resolvedPath, loaded: true, exports: {} };
    stubbedCacheKeys.push(resolvedPath);
  }
}, 60_000);

afterAll(() => {
  // 素の Node.js の require.cache はこのファイル (createRequire) からのみ触っており
  // 他のテストファイルは vi.mock 経由の別レジストリを使う (Vitest 側の SSR
  // モジュールグラフ) ため他ファイルへの汚染リスクは無いが、念のため後始末する。
  const cache = (Module as unknown as { _cache: Record<string, FakeCjsModule> })._cache;
  for (const key of stubbedCacheKeys) {
    delete cache[key];
  }
});

describe("claimOAuthCode — dual package hazard 回帰テスト (パッケージ self-reference と dist 直接 require の同一性)", () => {
  it("[V-95] @ryuuhei0729/swimhub-oauth/mobile 経由の claimOAuthCode と、dist 内相対パス直接 require の claimOAuthCode は同一の関数インスタンスである", () => {
    const viaPackageSelfReference = nodeRequire("@ryuuhei0729/swimhub-oauth/mobile") as ClaimOAuthCodeModule;
    const viaDirectDistRequire = nodeRequire("../../dist/mobile/claimOAuthCode") as ClaimOAuthCodeModule;

    expect(typeof viaPackageSelfReference.claimOAuthCode).toBe("function");
    // 参照レベルで同一インスタンスであることの直接証明 (===)。
    // これが崩れる = dual package hazard が発生し Map が2つに分裂している。
    expect(viaPackageSelfReference.claimOAuthCode).toBe(viaDirectDistRequire.claimOAuthCode);
  });

  it("[V-96] 経路Aで claim した code を経路Bで claim しようとすると claimed:false になり、経路Aの実際の結果を共有する", async () => {
    const viaPackageSelfReference = nodeRequire("@ryuuhei0729/swimhub-oauth/mobile") as ClaimOAuthCodeModule;
    const viaDirectDistRequire = nodeRequire("../../dist/mobile/claimOAuthCode") as ClaimOAuthCodeModule;

    // dist 側は src 側 (claimOAuthCode.test.ts 等) とは完全に別ファイル・別
    // Map インスタンスのため既存137件の code 文字列と衝突する心配は無いが、
    // 本テストスイート内 (経路A/経路B) での一意性のため専用の code を使う。
    const code = "dual-package-hazard-v95-v96-001";

    const winner = viaPackageSelfReference.claimOAuthCode(code);
    if (!winner.claimed) {
      throw new Error(
        "test invariant violated: 経路Aは新規 code のため claimed:true になるはず (dist が汚染されている可能性)",
      );
    }

    // 経路Bが「別モジュールインスタンス」であれば、ここでも claimed:true に
    // なってしまい二重交換バグが再現する。CJS 単一出力であれば経路Aと同じ
    // Map を参照しているため claimed:false になるはず。
    const loser = viaDirectDistRequire.claimOAuthCode(code);
    expect(loser.claimed).toBe(false);

    winner.resolve({ success: true });
    if (loser.claimed) throw new Error("unreachable");
    await expect(loser.result).resolves.toEqual({ success: true });
  });
});
