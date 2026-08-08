import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendContactNotification } from "@/lib/resend";
import { getClientIp } from "@/lib/client-ip";
import { reserveContactSubmission } from "@/lib/rate-limit";

const SOURCE_APPS = ["swimhub", "timer", "scanner"] as const;
const PLATFORMS = ["web", "ios", "android"] as const;

/** ホワイトリストに一致する値のみ返す（不正値は null 化） */
function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** 任意の文字列メタデータを長さ制限付きで正規化 */
function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * POST /api/contact
 * 問い合わせフォーム送信API（未認証アクセス可）
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      sourceApp?: string;
      platform?: string;
      referrer?: string;
      pageUrl?: string;
      locale?: string;
    };
    const { name, email, subject, message } = body;

    // バリデーション
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "お名前は必須です" }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: "お名前は100文字以内で入力してください" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
    }
    if (email.trim().length > 254) {
      return NextResponse.json({ error: "メールアドレスが長すぎます" }, { status: 400 });
    }
    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return NextResponse.json({ error: "件名は必須です" }, { status: 400 });
    }
    if (subject.trim().length > 200) {
      return NextResponse.json({ error: "件名は200文字以内で入力してください" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "お問い合わせ内容は必須です" }, { status: 400 });
    }
    if (message.trim().length > 5000) {
      return NextResponse.json({ error: "お問い合わせ内容は5000文字以内で入力してください" }, { status: 400 });
    }

    // IPアドレス取得（Cloudflare Workers 上では CF-Connecting-IP が最も信頼できる）
    const ipAddress = getClientIp(request);

    // レート制限（同一IPあたり1日10件）。IP が取得できない場合は制限を適用せず
    // 通す（固定キーにフォールバックすると全ユーザーが1バケットを共有し相互DoS
    // になるため、絶対にそうしない）。生IPはハッシュ化してから RPC に渡す
    // （ip_address カラムへの生IP保存は既存動作なので変更しない）。
    if (ipAddress) {
      const { allowed } = await reserveContactSubmission(ipAddress);
      if (!allowed) {
        return NextResponse.json({ error: "送信回数の上限に達しました。しばらくしてから再度お試しください" }, { status: 429 });
      }
    }

    // 利用コンテキスト（利用アプリ / 環境 / 端末情報）の正規化
    // User-Agent はクライアント値より改ざんされにくいサーバーヘッダを採用
    const sourceApp = sanitizeEnum(body.sourceApp, SOURCE_APPS);
    const platform = sanitizeEnum(body.platform, PLATFORMS);
    const userAgent = sanitizeText(request.headers.get("user-agent"), 512);
    const referrer = sanitizeText(body.referrer, 1000);
    const pageUrl = sanitizeText(body.pageUrl, 1000);
    const locale = sanitizeText(body.locale, 10);

    // Supabase に保存（contact_messages は Database 型に未定義のため型アサーション）
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (adminClient as any).from("contact_messages").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      ip_address: ipAddress,
      source_app: sourceApp,
      platform,
      user_agent: userAgent,
      referrer,
      page_url: pageUrl,
      locale,
    });

    if (dbError) {
      console.error("問い合わせ保存エラー:", dbError);
      return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
    }

    // メール送信（失敗してもDB保存は成功として扱う）
    try {
      await sendContactNotification({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        sourceApp,
        platform,
        userAgent,
        referrer,
        pageUrl,
        locale,
      });
    } catch (emailError) {
      console.error("メール送信エラー:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("問い合わせAPIエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
