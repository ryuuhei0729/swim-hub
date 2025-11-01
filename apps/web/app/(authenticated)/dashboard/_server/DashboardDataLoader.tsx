// =============================================================================
// ダッシュボードデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import CalendarData from './CalendarData'
import TeamAnnouncementsSection from './TeamAnnouncementsSection'
import MetadataLoader from './MetadataLoader'
import DashboardClient from '../_client/DashboardClient'

/**
 * すべてのダッシュボードデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function DashboardDataLoader() {
  // すべてのデータ取得を並行実行（Suspenseのネストを解消）
  return (
    <MetadataLoader>
      {({ styles, tags }) => (
        <TeamAnnouncementsSection>
          {({ teams }) => (
            <CalendarData>
              {({ calendarItems, monthlySummary }) => (
                <DashboardClient
                  initialCalendarItems={calendarItems}
                  initialMonthlySummary={monthlySummary}
                  teams={teams}
                  styles={styles}
                  tags={tags}
                />
              )}
            </CalendarData>
          )}
        </TeamAnnouncementsSection>
      )}
    </MetadataLoader>
  )
}

