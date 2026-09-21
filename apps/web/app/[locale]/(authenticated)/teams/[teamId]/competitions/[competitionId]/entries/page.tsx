import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAuthenticatedServerClient } from "@/lib/supabase-server-auth";
import { parseEntryReturnOrigin } from "@/utils/entryReturnOrigin";
import EntriesDataLoader from "./_server/EntriesDataLoader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; teamId: string; competitionId: string }>;
}): Promise<Metadata> {
  const { locale, competitionId } = await params;
  const t = await getTranslations({ locale, namespace: "competition.entries" });
  const supabase = await createAuthenticatedServerClient();
  const { data: competition } = await supabase
    .from("competitions")
    .select("title")
    .eq("id", competitionId)
    .single<{ title: string }>();

  return {
    title: competition?.title ? `${competition.title} - ${t("pageTitle")}` : t("pageTitle"),
  };
}

interface EntriesPageProps {
  params: Promise<{ teamId: string; competitionId: string }>;
  /**
   * Next.js の searchParams は多重指定 (`?origin=a&origin=b`) で配列になりうる
   * (`string | string[] | undefined`)。`parseEntryReturnOrigin` 側で配列は
   * 許可リスト外として既定値に落とす (先頭要素採用等の解釈はしない)。
   */
  searchParams: Promise<{ origin?: string | string[] }>;
}

/**
 * チーム大会エントリー代理入力ページ（Server Component）
 * adminがチームメンバーのエントリーを代理入力する
 *
 * `origin` クエリ (往路が `/teams/` か `/teams-admin/` か) はここ (Server Component) で
 * enum に正規化してから `EntriesDataLoader` へ prop として渡す (R12)。`useSearchParams` は
 * Client Component 用の hook のため使わない。
 */
export default async function EntriesPage({ params, searchParams }: EntriesPageProps) {
  const { teamId, competitionId } = await params;
  const { origin: rawOrigin } = await searchParams;
  const origin = parseEntryReturnOrigin(rawOrigin);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="p-6 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <EntriesDataLoader teamId={teamId} competitionId={competitionId} returnOrigin={origin} />
    </Suspense>
  );
}
