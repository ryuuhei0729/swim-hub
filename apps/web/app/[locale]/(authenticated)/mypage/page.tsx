import { redirect } from "next/navigation";

/**
 * 旧マイページ。2026-11 に設定と統合して /account になったので、そちらへ送る。
 */
export default async function MyPageRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account`);
}
