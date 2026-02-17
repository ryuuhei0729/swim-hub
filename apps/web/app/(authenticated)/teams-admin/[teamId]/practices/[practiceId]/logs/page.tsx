import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import PracticeLogDataLoader from './_server/PracticeLogDataLoader'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string; practiceId: string }>
}): Promise<Metadata> {
  const { practiceId } = await params
  const supabase = await createAuthenticatedServerClient()
  const { data: practice } = await supabase
    .from('practices')
    .select('title')
    .eq('id', practiceId)
    .single<{ title: string | null }>()

  return {
    title: practice?.title
      ? `${practice.title} - 練習記録 | SwimHub`
      : '練習記録 | SwimHub',
  }
}

interface PracticeLogPageProps {
  params: Promise<{ teamId: string; practiceId: string }>
}

/**
 * チーム練習代理入力ページ（Server Component）
 * adminがチームメンバーのPractice_Log/Practice_timeを代理入力する
 */
export default async function PracticeLogPage({ params }: PracticeLogPageProps) {
  const { teamId, practiceId } = await params

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
      <PracticeLogDataLoader teamId={teamId} practiceId={practiceId} />
    </Suspense>
  )
}
