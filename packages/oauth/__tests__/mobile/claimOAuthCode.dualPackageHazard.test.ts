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
 * 機構の話であり、ビルド後の dist/ に対して Node 本来のモジュールローダーを
 * 使わない限り再現も検証もできない。
 *
 * 検証方法 (v0.1.2: ESM 出力に合わせて全面更新):
 * - 経路A = パッケージ名の self-reference (`@ryuuhei0729/swimhub-oauth/mobile`)。
 *   package.json の "exports" マップを介して dist/mobile/index.js (バレル) に
 *   解決される — 外部消費者 (各アプリのグローバル Linking ハンドラ等) が
 *   claimOAuthCode を直接 import する経路を模す。
 * - 経路B = ビルド後 dist 内の相対パス直接 import (dist/mobile/claimOAuthCode.js
 *   への絶対パス file: URL)。dist/mobile/signInWithGoogle.js 自身が内部で
 *   `import { claimOAuthCode } from "./claimOAuthCode.js"` と全く同じ解決方式
 *   (拡張子付き相対パス) で claimOAuthCode に辿り着くのを模す。
 *
 * v0.1.1 (CJS) 時代との実装上の違い (重要):
 * v0.1.1 では `node:module` の createRequire で Vitest の変換パイプライン
 * (vite-node) を経由しない「素の Node の require()」を直接このテストファイル内で
 * 呼び出し、Node の require.cache 上で経路A・経路Bが同一の module.exports を
 * 返すかを見ていた。v0.1.2 (ESM) では、このテストファイル内で動的 `import()` を
 * 直接使うと Vitest 自身の SSR モジュールランナー (Vite/Rollup ベース) が
 * dist/mobile/index.js 以下の依存グラフ (expo-web-browser → react-native 等) を
 * "素の Node の import()" ではなく独自の変換パイプラインで解析しようとしてしまい、
 * react-native 内の Flow 構文 (`import typeof * as X from "...flow"`) が
 * パースできず即座に失敗することを実測で確認した (Vitest 経由では検証にならない
 * という、まさにこのテストが避けようとしている問題そのもの)。
 * そのため v0.1.2 では、判定ロジック全体を `node --input-type=module -e "..."` で
 * 起動する**別プロセスの素の Node**の中で完結させ、その中で経路A・経路Bの
 * `claimOAuthCode` の参照同一性 (===) や claim/resolve の相互作用を判定し、
 * 判定結果 (真偽値・シリアライズ可能な値) のみを JSON で標準出力に書き出して
 * テスト側で assert する。関数インスタンスの `===` 判定自体は必ず子プロセス内で
 * 行われ (プロセスをまたいで関数参照を渡すことはできないため)、テスト側はその
 * 判定結果を受け取るだけであることに注意 (検証の実体は変わらず、伝達方法のみが
 * プロセス境界の制約により変わっている)。
 *
 * expo-web-browser / expo-auth-session のスタブについて:
 * dist/mobile/index.js (経路Aのバレル) は claimOAuthCode 以外に signInWithGoogle /
 * getRedirectUri も re-export しており、それらはモジュール読み込み時点で
 * expo-web-browser / expo-auth-session を import する。この2つは Metro
 * (React Native バンドラ) 前提の解決をしており、素の Node.js プロセスからは
 * 実測で読み込めない (このパッケージの ESM/CJS 化とは無関係な、expo 側の既知の
 * 制約。本番の Expo アプリは常に Metro 経由で読むためこの制約自体は問題にならない)。
 * v0.1.1 (CJS) 時代は `Module._cache` へダミーの module オブジェクトを直接注入して
 * これらの読み込みを迂回していたが、ESM ではモジュールグラフの構築が Node の
 * ネイティブモジュールローダー内部で完結し `Module._cache` を経由しないため、この
 * 手法は使えない。代わりに子プロセス内で `node:module` の `register()` により
 * モジュールカスタマイズフック (resolve/load) を登録し、"expo-web-browser" /
 * "expo-auth-session" という指定子だけを実体を一切読みにいかずスタブソースに
 * すり替える。signInWithGoogle.js・getRedirectUri.js はどちらもモジュール
 * 読み込み時点ではこれらの named export を呼び出さず (関数本体の中でのみ参照する)、
 * 実際の動作は signInWithGoogle.claimGuard.test.ts 等が Vitest の vi.mock 経由で
 * 別途検証済みのため、スタブは「読み込みが構文的に成立する最小限の named export を
 * 持つダミーモジュール」で十分である。
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

// このテストファイル自身から見た「素の Node require()」。Vitest の変換パイプライン
// (vite-node) を経由しないため、tsc の起動は Node の実装そのものになる。
const nodeRequire = createRequire(import.meta.url);

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const distMobileIndexPath = path.join(packageRoot, "dist/mobile/index.js");
const distMobileClaimOAuthCodePath = path.join(packageRoot, "dist/mobile/claimOAuthCode.js");
const distMobileClaimOAuthCodeUrl = pathToFileURL(distMobileClaimOAuthCodePath).href;

// 子プロセス (素の Node) 内で expo-web-browser / expo-auth-session をスタブに
// すり替えるモジュールカスタマイズフック本体。子プロセスのスクリプト文字列に
// そのまま埋め込む。
const EXPO_STUB_LOADER_HOOK_SOURCE = `
const STUB_SPECIFIERS = {
  "expo-web-browser": "swimhub-oauth-test-stub:expo-web-browser",
  "expo-auth-session": "swimhub-oauth-test-stub:expo-auth-session",
};
const STUB_SOURCES = {
  "swimhub-oauth-test-stub:expo-web-browser": "export function openAuthSessionAsync() {}; export default {};",
  "swimhub-oauth-test-stub:expo-auth-session": "export function makeRedirectUri() {}; export default {};",
};
export async function resolve(specifier, context, nextResolve) {
  const stubUrl = STUB_SPECIFIERS[specifier];
  if (stubUrl) return { url: stubUrl, shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  const source = STUB_SOURCES[url];
  if (source) return { format: "module", source, shortCircuit: true };
  return nextLoad(url, context);
}
`;

/**
 * 子プロセス (素の Node、cwd=packageRoot) で `script` を実行し、
 * その標準出力 (JSON 文字列1行) を parse して返す。
 * script 内では `registerExpoStubs()` と `distMobileClaimOAuthCodeUrl` が
 * 使える前提で組み立てる (下記 runDualPackageHazardProbe 参照)。
 */
function runDualPackageHazardProbe<T>(probeBody: string): T {
  const script = `
import { register } from "node:module";

async function registerExpoStubs() {
  register(
    "data:text/javascript," + encodeURIComponent(${JSON.stringify(EXPO_STUB_LOADER_HOOK_SOURCE)}),
    import.meta.url,
  );
}

const distMobileClaimOAuthCodeUrl = ${JSON.stringify(distMobileClaimOAuthCodeUrl)};

${probeBody}
`;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout) as T;
}

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
}, 60_000);

describe("claimOAuthCode — dual package hazard 回帰テスト (パッケージ self-reference と dist 直接 import の同一性)", () => {
  it("[V-95] @ryuuhei0729/swimhub-oauth/mobile 経由の claimOAuthCode と、dist 内相対パス直接 import の claimOAuthCode は同一の関数インスタンスである", () => {
    const result = runDualPackageHazardProbe<{ typeofClaimOAuthCode: string; sameReference: boolean }>(`
await registerExpoStubs();
const viaPackageSelfReference = await import("@ryuuhei0729/swimhub-oauth/mobile");
const viaDirectDistImport = await import(distMobileClaimOAuthCodeUrl);
process.stdout.write(JSON.stringify({
  typeofClaimOAuthCode: typeof viaPackageSelfReference.claimOAuthCode,
  // 参照レベルで同一インスタンスであることの直接証明 (===)。
  // これが崩れる = dual package hazard が発生し Map が2つに分裂している。
  sameReference: viaPackageSelfReference.claimOAuthCode === viaDirectDistImport.claimOAuthCode,
}));
`);

    expect(result.typeofClaimOAuthCode).toBe("function");
    expect(result.sameReference).toBe(true);
  });

  it("[V-96] 経路Aで claim した code を経路Bで claim しようとすると claimed:false になり、経路Aの実際の結果を共有する", async () => {
    const result = runDualPackageHazardProbe<{
      winnerClaimed: boolean;
      loserClaimedInitially: boolean;
      loserResult: unknown;
    }>(`
await registerExpoStubs();
const viaPackageSelfReference = await import("@ryuuhei0729/swimhub-oauth/mobile");
const viaDirectDistImport = await import(distMobileClaimOAuthCodeUrl);

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
// なってしまい二重交換バグが再現する。ESM 単一出力であれば経路Aと同じ
// Map を参照しているため claimed:false になるはず。
const loser = viaDirectDistImport.claimOAuthCode(code);
const loserClaimedInitially = loser.claimed;

winner.resolve({ success: true });

let loserResult = null;
if (!loser.claimed) {
  loserResult = await loser.result;
}

process.stdout.write(JSON.stringify({
  winnerClaimed: winner.claimed,
  loserClaimedInitially,
  loserResult,
}));
`);

    expect(result.winnerClaimed).toBe(true);
    expect(result.loserClaimedInitially).toBe(false);
    expect(result.loserResult).toEqual({ success: true });
  });
});
