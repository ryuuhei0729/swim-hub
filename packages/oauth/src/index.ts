// このエントリポイントは意図的に何も re-export しません。
// "./mobile" と "./web" はそれぞれ expo-* / next 系の実行時依存を持つため、
// ここで両方を `export * as` すると静的モジュール解決の時点で両方の依存が
// 必須になってしまい、web専用/mobile専用アプリの依存分離ができなくなります
// (Reviewer が Node ESM で実証済み)。
// 利用側は "@ryuuhei0729/swimhub-oauth/mobile" または "@ryuuhei0729/swimhub-oauth/web" を直接 import してください。
export {};
