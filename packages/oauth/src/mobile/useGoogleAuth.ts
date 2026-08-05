/**
 * 後方互換シム。実体は ./signInWithGoogle.ts に移動した (Reviewer 指摘:
 * このモジュールは `useGoogleAuth` という React フックではなく素の
 * `signInWithGoogle` 関数のみをエクスポートしており、ファイル名と公開 API が
 * 一致していなかった)。
 *
 * __tests__/mobile/signInWithGoogle.claimGuard.test.ts と
 * __tests__/mobile/signInWithGoogle.raceIntegration.test.ts がこのファイルパスを
 * 直接 import しているため、テストファイルを変更せずに済むよう re-export のみ
 * 残す。新規の参照は "./signInWithGoogle" (または "./index" 経由) を使うこと。
 */
export * from "./signInWithGoogle";
