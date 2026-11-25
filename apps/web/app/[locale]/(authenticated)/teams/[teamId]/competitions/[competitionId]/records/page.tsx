import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createAuthenticatedServerClient } from "@/lib/supabase-server-auth";
import RecordDataLoader from "./_server/RecordDataLoader";
import { FreshServerRender } from "@/components/ui/FreshServerRender";
import CompetitionRecordsLoading from "./loading";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; teamId: string; competitionId: string }>;
}): Promise<Metadata> {
  const { locale, competitionId } = await params;
  const t = await getTranslations({ locale, namespace: "competition.records" });
  const supabase = await createAuthenticatedServerClient();
  const { data: competition } = await supabase
    .from("competitions")
    .select("title")
    .eq("id", competitionId)
    .single<{ title: string }>();

  return {
    title: competition?.title
      ? t("metaTitle", { title: competition.title })
      : t("metaTitleFallback"),
  };
}

interface RecordPageProps {
  params: Promise<{ teamId: string; competitionId: string }>;
}

/**
 * チーム大会Record代理入力ページ（Server Component）
 * adminがチームメンバーのRecord/split_timeを代理入力する
 */
export default async function RecordPage({ params }: RecordPageProps) {
  const { teamId, competitionId } = await params;

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
      {/* 保存した直後に同じ画面を開き直すと、ページ遷移のキャッシュに残った保存前のデータで
          フォームが開き、重複登録や上書きになる。使い回された描画なら最新を取り直す */}
      <FreshServerRender renderId={crypto.randomUUID()} fallback={<CompetitionRecordsLoading />}>
        <RecordDataLoader teamId={teamId} competitionId={competitionId} />
      </FreshServerRender>
    </Suspense>
  );
}
