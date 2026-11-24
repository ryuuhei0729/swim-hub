import { NextRequest, NextResponse } from "next/server";

// このコンソールは service role で全ユーザーのデータを読む。
// 誤ってどこかにデプロイ・公開されても開けないよう、localhost 宛て以外は 404 にする
// (dev サーバー自体も package.json で 127.0.0.1 にだけ bind している)。
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}
