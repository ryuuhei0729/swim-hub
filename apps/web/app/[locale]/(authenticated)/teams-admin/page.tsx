import { redirect } from "@/i18n/navigation";

/**
 * 旧「チーム管理」一覧ページ。
 *
 * 管理者ビューはチーム画面のヘッダーにある「利用者 / 管理者」スイッチから切り替える形に
 * まとめたため、一覧は /teams (最後に開いたチームを開く入口) へ寄せる。
 * ブックマーク等の旧 URL のためにページ自体は残してリダイレクトする。
 */
export default async function AdminTeamsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/teams", locale });
}
