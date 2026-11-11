import { redirect } from "next/navigation";

/**
 * 旧テンプレート管理画面。2026-11 にアカウント画面の「練習ログテンプレート」へ移した。
 */
export default async function PracticeLogTemplatesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/account?tab=templates`);
}
