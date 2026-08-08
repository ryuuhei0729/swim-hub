import type { NextRequest } from "next/server";

/**
 * リクエストヘッダーからクライアントIPを取得する。
 * Cloudflare Workers は `CF-Connecting-IP` を設定するため最優先で見る
 * (`X-Forwarded-For`/`X-Real-IP` はプロキシ経路によって偽装・欠落し得る)。
 *
 * IP が一切取得できない場合は null を返す。呼び出し元 (レート制限) は null の
 * 場合に制限を適用しないこと (固定キーへフォールバックすると全ユーザーが
 * 1バケットを共有し相互DoSになるため)。
 *
 * 注意: `Headers.get()` はヘッダーが「存在するが値が空文字」の場合に `null`
 * ではなく `""` を返す。`??` は null/undefined のときしかフォールバックしない
 * ため、空文字ヘッダーを送られると (欠落ではなく) 空文字が確定値として返って
 * しまい、`hashIp("")` という「空文字IP専用の固定バケット」が生まれ相互DoSに
 * つながる。そのため各ステップは truthy チェック (`if (value)`) でフォールバック
 * する。`X-Forwarded-For` の先頭要素が空 (例: ",1.2.3.4") の場合も同様に空文字
 * として扱い、次のヘッダーへフォールバックする。
 */
export function getClientIp(request: NextRequest): string | null {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;

  const realIp = request.headers.get("X-Real-IP")?.trim();
  if (realIp) return realIp;

  return null;
}
