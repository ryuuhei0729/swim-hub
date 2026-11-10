import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAuthenticatedServerClient } from "@/lib/supabase-server-auth";
import TeamDetailDataLoader from "./_server/TeamDetailDataLoader";

/** URL の `?view=admin` (管理者ビュー)。サーバー側では client モジュールの関数を呼べないためここで判定する */
function isAdminViewParam(value: string | string[] | undefined): boolean {
  return value === "admin";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; teamId: string }>;
}): Promise<Metadata> {
  const { locale, teamId } = await params;
  const supabase = await createAuthenticatedServerClient();
  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .single<{ name: string }>();
  const t = await getTranslations({ locale, namespace: "teams.page" });

  return {
    title: team?.name ? `${team.name} | SwimHub` : `${t("title")} | SwimHub`,
  };
}

interface TeamDetailPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ tab?: string; view?: string | string[] }>;
}

/**
 * チームページ（Server Component）。利用者ビューと管理者ビュー (`?view=admin`) を兼ねる
 * データ取得はサーバー側で並行実行される
 */
export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const { teamId } = await params;
  const { tab, view } = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="p-6 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <TeamDetailDataLoader
        teamId={teamId}
        initialTab={tab}
        initialAdminView={isAdminViewParam(view)}
      />
    </Suspense>
  );
}
