import { Resend } from "resend";

import { parseUserAgent } from "./user-agent";

type ContactData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** 利用アプリ: 'swimhub' | 'timer' | 'scanner' */
  sourceApp?: string | null;
  /** 利用環境: 'web' | 'ios' | 'android' */
  platform?: string | null;
  /** 送信時の User-Agent（端末/OS/ブラウザ判定用） */
  userAgent?: string | null;
  /** 遷移元URL */
  referrer?: string | null;
  /** 送信元ページURL */
  pageUrl?: string | null;
  /** フォーム表示言語 */
  locale?: string | null;
};

// 問い合わせメールは社内サポート宛のため日本語ラベルで統一する
const APP_LABELS: Record<string, string> = {
  swimhub: "SwimHub",
  timer: "SwimHub Timer",
  scanner: "SwimHub Scanner",
};

const PLATFORM_LABELS: Record<string, string> = {
  web: "Web（ブラウザ）",
  ios: "iOSアプリ",
  android: "Androidアプリ",
};

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * ご利用環境セクションを組み立てる（利用アプリ / 環境 / 端末 / ブラウザ / 言語 / 遷移元）
 */
function buildContextSection(data: ContactData): string[] {
  const { device, browser } = parseUserAgent(data.userAgent);
  const appLabel = data.sourceApp ? (APP_LABELS[data.sourceApp] ?? data.sourceApp) : "不明";
  const platformLabel = data.platform
    ? (PLATFORM_LABELS[data.platform] ?? data.platform)
    : "不明";

  return [
    "--- ご利用環境 ---",
    `利用アプリ: ${appLabel}`,
    `ご利用環境: ${platformLabel}`,
    `端末/OS: ${device}`,
    `ブラウザ: ${browser}`,
    `言語: ${data.locale || "不明"}`,
    `遷移元: ${data.referrer || "-"}`,
    `送信ページ: ${data.pageUrl || "-"}`,
  ];
}

/**
 * 問い合わせ通知メールを送信
 */
export async function sendContactNotification(data: ContactData) {
  const { name, email, subject, message } = data;
  const resend = getResendClient();

  await resend.emails.send({
    from: "SwimHub <noreply@swim-hub.app>",
    to: "support@swim-hub.app",
    subject: `【お問い合わせ】${subject}`,
    replyTo: email,
    text: [
      `お名前: ${name}`,
      `メールアドレス: ${email}`,
      `件名: ${subject}`,
      "",
      ...buildContextSection(data),
      "",
      "--- お問い合わせ内容 ---",
      message,
    ].join("\n"),
  });
}
