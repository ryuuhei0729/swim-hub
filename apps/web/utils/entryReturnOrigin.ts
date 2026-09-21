/**
 * エントリー代理入力ページ (`entries/[competitionId]`) の戻り先を運ぶための enum。
 *
 * 往路 (`/teams/{teamId}` か `/teams-admin/{teamId}` か) をクエリ文字列で運ぶが、
 * このクエリ値をリダイレクト先のパス文字列へ直接埋め込んではならない (PM裁定 R11)。
 * 許可リストの2値のみに正規化し (`parseEntryReturnOrigin`)、
 * enum → ハードコードされたパス定数のマップ (`getEntryReturnPath`) を介してのみ
 * パスへ変換する。過去に `getSafeRedirectUrl` がブラックリスト方式で `..` を通した
 * 実績があるため、本件はブラックリストでなくアローリストの enum を採用する。
 */
export type EntryReturnOrigin = "member" | "admin";

/** R13: origin が無い・不正・想定外のときの既定値 (後方互換で teams-admin 側に戻す) */
const DEFAULT_ENTRY_RETURN_ORIGIN: EntryReturnOrigin = "admin";

/**
 * クエリ文字列由来の値を `EntryReturnOrigin` に正規化する。
 * `"member" | "admin"` のいずれでもない値 (`"../../evil"` 等の任意文字列を含む) は
 * すべて既定値に落とす。戻り値はパス文字列の構築に使っても安全な2値のみ。
 *
 * Next.js の `searchParams` は同名クエリの多重指定 (`?origin=a&origin=b`) で
 * `string[]` になりうる。多重指定は不正入力として既定値に落とす
 * (先頭要素採用などの配列解釈はしない)。
 */
export function parseEntryReturnOrigin(value: string | string[] | undefined): EntryReturnOrigin {
  return value === "member" || value === "admin" ? value : DEFAULT_ENTRY_RETURN_ORIGIN;
}

/**
 * enum → ハードコードされたパス定数のマップ (R11)。
 * `origin` の値をパス文字列へ直接埋め込まない。`teamId` はこの enum とは独立した
 * 既存のルートパラメータ (呼び出し元で既に検証済み) であり、他の既存コードと同じ形で使う。
 */
export function getEntryReturnPath(origin: EntryReturnOrigin, teamId: string): string {
  switch (origin) {
    case "member":
      return `/teams/${teamId}?tab=competitions`;
    case "admin":
      return `/teams-admin/${teamId}?tab=competitions`;
  }
}
