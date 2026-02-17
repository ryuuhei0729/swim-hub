import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import TeamDetailDataLoader from './_server/TeamDetailDataLoader'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>
}): Promise<Metadata> {
  const { teamId } = await params
  const supabase = await createAuthenticatedServerClient()
  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .single<{ name: string }>()

  return {
    title: team?.name
      ? `${team.name} | SwimHub`
      : 'チーム | SwimHub',
  }
}

interface TeamDetailPageProps {
  params: Promise<{ teamId: string }>
  searchParams: Promise<{ tab?: string }>
}

/**
 * チーム詳細ページ（Server Component）
 * データ取得はサーバー側で並行実行される
 */
export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const { teamId } = await params
  const { tab } = await searchParams

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
      <TeamDetailDataLoader teamId={teamId} initialTab={tab} />
    </Suspense>
  )
}
