import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendContactNotification } from "@/lib/resend";

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

    // IPアドレス取得（レート制限用）
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;

    // Supabase に保存（contact_messages は Database 型に未定義のため型アサーション）
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (adminClient as any).from("contact_messages").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      ip_address: ipAddress,
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
