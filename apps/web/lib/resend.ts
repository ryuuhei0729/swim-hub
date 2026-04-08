import { Resend } from "resend";

type ContactData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(process.env.RESEND_API_KEY);
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
      "--- お問い合わせ内容 ---",
      message,
    ].join("\n"),
  });
}
