// このバレルは `expo-web-browser` / `expo-auth-session` のどちらにも依存しない
// 純粋な関数のみを re-export する ("./mobile" の部分集合)。
//
// "./mobile" (src/mobile/index.ts) は signInWithGoogle 経由で expo-web-browser を
// 静的 import するため、named export をどれだけ絞っても expo-web-browser の
// モジュール読み込み自体は避けられない (ESM の静的 import はツリーシェイクされず、
// モジュール実行時に import 文がすべて評価される)。claimOAuthCode だけが欲しい
// 消費側 (例: 各アプリのグローバル Linking ハンドラの安全網) が expo 依存を
// 引き込まずに済むよう、このサブパスを追加する。
//
// getRedirectUri は含めない: expo-auth-session の index.js (barrel) は
// `export * from './AuthSession'` を経由し、AuthSession.js が
// `import { dismissAuthSession } from 'expo-web-browser'` を静的 import している
// (node_modules/expo-auth-session/build/AuthSession.js で実測確認)。つまり
// makeRedirectUri しか使わなくても expo-auth-session を import した時点で
// expo-web-browser が読み込まれてしまうため、"expo-web-browser に依存しない"
// という本サブパスの契約を満たせない。
export * from "./claimOAuthCode.js";
export * from "./extractTokensFromUrl.js";
