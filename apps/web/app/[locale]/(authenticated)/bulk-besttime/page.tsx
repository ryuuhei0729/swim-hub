import { redirect } from "next/navigation";

/**
 * 旧ベストタイム一括入力ページ。2026-11-11 にダッシュボードのベストタイム表がそのまま
 * 入力モードに切り替わる形にしたので、ブックマークなどから来たらダッシュボードへ送る。
 */
export default async function BulkBestTimeRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
