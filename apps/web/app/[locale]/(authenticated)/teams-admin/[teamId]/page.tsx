import { redirect } from "@/i18n/navigation";

/**
 * 旧「チーム管理」ページ。
 *
 * 利用者ビューと管理者ビューはチーム画面 (/teams/[teamId]) 1つにまとめ、
 * ヘッダーの「利用者 / 管理者」スイッチで本文だけを切り替える形にした。
 * 管理者ビューは `/teams/[teamId]?view=admin`。
 *
 * 記録入力・エントリー・練習ログなどの戻り先や、ブックマークが
 * `/teams-admin/[teamId]?tab=...` を指しているので、ページ自体は残してリダイレクトする。
 * 権限の確認はリダイレクト先で行う (管理者でなければ利用者ビューで開く)。
 */
export default async function TeamAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { teamId, locale } = await params;
  const { tab } = await searchParams;
  const query = new URLSearchParams({ view: "admin" });
  if (typeof tab === "string" && tab) query.set("tab", tab);
  redirect({ href: `/teams/${encodeURIComponent(teamId)}?${query.toString()}`, locale });
}
