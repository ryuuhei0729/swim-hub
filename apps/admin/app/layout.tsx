import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { listTeams, listUsers, type TeamSummary, type UserSummary } from "@/lib/queries";
import { getConnectionInfo } from "@/lib/supabase";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwimHub Console",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const connection = getConnectionInfo();
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(connection.host);

  let users: UserSummary[] = [];
  let teams: TeamSummary[] = [];
  let loadError: string | null = null;
  try {
    [users, teams] = await Promise.all([listUsers(), listTeams()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "一覧を取得できませんでした";
  }

  return (
    <html lang="ja">
      <body className="flex h-screen flex-col bg-white text-gray-900">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <Link href="/" className="font-bold">
            SwimHub Console
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
              isLocal ? "bg-gray-500" : "bg-amber-600"
            }`}
          >
            {isLocal ? "LOCAL" : connection.environment.toUpperCase()}
          </span>
          <span className="font-mono text-xs text-gray-500">{connection.host}</span>
          <Link href="/billing" className="ml-4 text-sm text-blue-700 hover:underline">
            課金サマリー
          </Link>
          <span className="ml-auto text-xs text-gray-500">読み取り専用</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex max-h-64 min-h-0 flex-col border-b border-gray-200 md:max-h-none md:w-72 md:border-b-0 md:border-r">
            {loadError ? (
              <p role="alert" className="p-3 text-sm text-red-700">
                {loadError}
              </p>
            ) : (
              <Sidebar users={users} teams={teams} />
            )}
          </aside>
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
