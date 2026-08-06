import { makeRedirectUri } from "expo-auth-session";

/**
 * OAuth コールバック用のリダイレクト URI を生成する。
 *
 * path は3アプリ共通で "auth/callback" に固定する。`native` はスタンドアロン
 * ビルドで正しいカスタムスキーム URI (`<scheme>://auth/callback`) を明示的に
 * 指定するために必要。scheme の妥当性検証は呼び出し元の責務。
 */
export const getRedirectUri = (scheme: string): string => {
  return makeRedirectUri({ scheme, path: "auth/callback", native: `${scheme}://auth/callback` });
};
