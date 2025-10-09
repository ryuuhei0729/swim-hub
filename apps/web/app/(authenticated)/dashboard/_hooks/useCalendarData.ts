import { CalendarItem, MonthlySummary } from '@/types'
import { useQuery } from '@apollo/client/react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { useEffect, useMemo } from 'react'
import { useAuth } from '../../../../contexts'
import { GET_CALENDAR_DATA, GET_PRACTICES, GET_RECORDS } from '../../../../graphql/queries'
import { GET_MY_COMPETITIONS } from '../../../../graphql/queries/competition'
import { GET_TEAM_COMPETITIONS_FOR_CALENDAR, GET_TEAM_PRACTICES_FOR_CALENDAR, GET_TEAM_RECORDS } from '../../../../graphql/queries/teams'
import { formatTime } from '../../../../utils/formatters'
export function useCalendarData(currentDate: Date, userId?: string) {
  const { profile } = useAuth()
  const _targetUserId = userId || profile?.id

  // 月の開始日と終了日を計算
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')

  // 実際のデータベースを使用
  const USE_MOCK_DATA = false

  // カレンダーデータを取得（新しい個人利用機能）
  const { data: calendarData, loading: calendarLoading, error: calendarError, refetch } = useQuery(
    GET_CALENDAR_DATA,
    {
      variables: {
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1
      },
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first', // キャッシュ優先でリアルタイム更新に対応
      nextFetchPolicy: 'cache-first', // 次回以降もキャッシュ優先
      notifyOnNetworkStatusChange: true, // ネットワーク状態の変更を通知
      errorPolicy: 'ignore' // エラーを無視して処理を続行
    }
  )

  // 練習記録を取得（新しい正規化構造対応）
  const { data: practicesData, loading: practiceLoading, error: practiceError, refetch: refetchPractices } = useQuery(
    GET_PRACTICES,
    {
      variables: {
        startDate,
        endDate
      },
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first', // キャッシュ優先でリアルタイム更新に対応
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all' // エラーも含めて全てのデータを取得
    }
  )

  // 記録データを取得（個人記録）
  const { data: recordsData, loading: recordsLoading, error: recordsError, refetch: refetchRecords } = useQuery(
    GET_RECORDS,
    {
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first', // キャッシュ優先でリアルタイム更新に対応
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all' // エラーも含めて全てのデータを取得
    }
  )

  // チーム記録データを取得
  const { data: teamRecordsData, loading: teamRecordsLoading, error: teamRecordsError, refetch: refetchTeamRecords } = useQuery(
    GET_TEAM_RECORDS,
    {
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first',
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all'
    }
  )

  // チーム練習データを取得
  const { data: teamPracticesData, loading: teamPracticesLoading, error: teamPracticesError, refetch: refetchTeamPractices } = useQuery(
    GET_TEAM_PRACTICES_FOR_CALENDAR,
    {
      variables: {
        startDate,
        endDate
      },
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first',
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all'
    }
  )

  // 個人大会データを取得
  const { data: competitionsData, loading: competitionsLoading, error: competitionsError, refetch: refetchCompetitions } = useQuery(
    GET_MY_COMPETITIONS,
    {
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first',
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all'
    }
  )

  // チーム大会データを取得
  const { data: teamCompetitionsData, loading: teamCompetitionsLoading, error: teamCompetitionsError, refetch: refetchTeamCompetitions } = useQuery(
    GET_TEAM_COMPETITIONS_FOR_CALENDAR,
    {
      skip: USE_MOCK_DATA,
      fetchPolicy: 'cache-first',
      nextFetchPolicy: 'cache-first',
      notifyOnNetworkStatusChange: true,
      errorPolicy: 'all'
    }
  )

  // エラーログ出力
  useEffect(() => {
    if (calendarError) {
      console.error('Calendar data fetch error:', calendarError)
      if ((calendarError as any).graphQLErrors) {
        console.error('GraphQL errors:', (calendarError as any).graphQLErrors)
      }
      if ((calendarError as any).networkError) {
        console.error('Network error:', (calendarError as any).networkError)
      }
    }
    if (practiceError) {
      console.error('Practice logs fetch error:', practiceError)
      if ((practiceError as any).graphQLErrors) {
        console.error('Practice GraphQL errors:', (practiceError as any).graphQLErrors)
      }
      if ((practiceError as any).networkError) {
        console.error('Practice Network error:', (practiceError as any).networkError)
      }
    }
    if (recordsError) {
      console.error('Records fetch error:', recordsError)
      if ((recordsError as any).graphQLErrors) {
        console.error('Records GraphQL errors:', (recordsError as any).graphQLErrors)
      }
      if ((recordsError as any).networkError) {
        console.error('Records Network error:', (recordsError as any).networkError)
      }
    }
    if (teamRecordsError) {
      console.error('Team records fetch error:', teamRecordsError)
    }
    if (teamPracticesError) {
      console.error('Team practices fetch error:', teamPracticesError)
    }
    if (competitionsError) {
      console.error('Competitions fetch error:', competitionsError)
    }
    if (teamCompetitionsError) {
      console.error('Team competitions fetch error:', teamCompetitionsError)
    }
  }, [calendarError, practiceError, recordsError, teamRecordsError, teamPracticesError, competitionsError, teamCompetitionsError, practicesData, recordsData, practiceLoading, recordsLoading])

  // データを統合してカレンダー表示用に変換
  const calendarItems: CalendarItem[] = useMemo(() => {
    // モックデータを使用する場合
    if (USE_MOCK_DATA) {
      const mockItems: CalendarItem[] = []
      
      // 今月の日付でいくつかのモックデータを生成
      const today = new Date()
      const currentMonth = currentDate.getMonth()
      const currentYear = currentDate.getFullYear()
      
      // 今月の5日に練習記録
      if (currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
        mockItems.push({
          id: 'mock-practice-1',
          item_type: 'practice',
          item_date: format(new Date(currentYear, currentMonth, 5), 'yyyy-MM-dd'),
          title: '練習: AN2, EN3',
          location: '市営プール'
        })
        
        // 今月の15日に大会記録
        mockItems.push({
          id: 'mock-record-1',
          item_type: 'record',
          item_date: format(new Date(currentYear, currentMonth, 15), 'yyyy-MM-dd'),
          title: '50m自由形: 26.45s',
          location: '県立水泳場',
          time_result: 2645,
          pool_type: 1
        })
        
        // 今月の20日に練習記録
        mockItems.push({
          id: 'mock-practice-2',
          item_type: 'practice',
          item_date: format(new Date(currentYear, currentMonth, 20), 'yyyy-MM-dd'),
          title: '練習: 長水路',
          location: '総合体育館プール'
        })
        
        // 今月の25日に大会記録
        mockItems.push({
          id: 'mock-record-2',
          item_type: 'record',
          item_date: format(new Date(currentYear, currentMonth, 25), 'yyyy-MM-dd'),
          title: '100m背泳ぎ: 58.32s',
          location: '国際水泳場',
          time_result: 5832,
          pool_type: 1
        })
      }
      
      return mockItems
    }

    // GraphQLデータを使用する場合
    const items: CalendarItem[] = []

    // 練習記録を追加（新しい正規化構造：Practiceベース）
    if (practicesData && (practicesData as any).myPractices) {
      (practicesData as any).myPractices.forEach((practice: any) => {
        const practiceDate = practice.date
        const practicePlace = practice.place || 'プール'
        const practiceLogs = practice.practiceLogs || []
        
        if (practiceDate) {
          const logDate = new Date(practiceDate)
          if (logDate >= monthStart && logDate <= monthEnd) {
            // 練習内容の詳細を生成
            let title: string
            if (practiceLogs.length > 0) {
              const firstLog = practiceLogs[0]
              const distance = firstLog.distance || 0
              const repCount = firstLog.repCount || 0
              const setCount = firstLog.setCount || 1
              const circle = firstLog.circle || 0
              const style = firstLog.style || 'Fr'
              
              // サークル時間のフォーマット
              const circleTime = circle > 0 ? `${Math.floor(circle / 60)}'${Math.floor(circle % 60).toString().padStart(2, '0')}"` : ''
              
              // セット数が1の場合は省略
              const setDisplay = setCount > 1 ? `×${setCount}` : ''
              
              title = `${distance}m×${repCount}${setDisplay}　${circleTime} ${style}`
            } else {
              title = `練習: ${practicePlace}`
            }
            
            items.push({
              id: practice.id, // Practice ID
              item_type: 'practice',
              item_date: practiceDate,
              title,
              location: practicePlace
            })
          }
        }
      })
    }

    // 大会記録を追加（個人記録）
    if (recordsData && (recordsData as any).myRecords) {
      (recordsData as any).myRecords.forEach((record: any) => {
        // 日付範囲でフィルタリング（competitionのdateを使用）
        if (record.competition && record.competition.date) {
          const recordDate = new Date(record.competition.date)
          if (recordDate >= monthStart && recordDate <= monthEnd) {
            const timeString = record.time ? formatTime(record.time) : ''
            const relayIndicator = record.isRelaying ? 'R' : ''
            const styleInfo = record.style ? `${(record.style as any).name}` : '記録'
            const title = `${styleInfo}: ${timeString}${relayIndicator}`
            
            const item: any = {
              id: record.id,
              item_type: 'record',
              item_date: record.competition.date,
              title,
              location: record.competition.title || '大会',
              is_relaying: record.isRelaying || false
            }

            // record.timeが有限数値の場合のみtime_resultを設定
            if (Number.isFinite(Number(record.time))) {
              item.time_result = Math.round(Number(record.time) * 100) // 秒を百分の一秒に変換
            }

            // pool_typeは不明な場合は設定しない
            if (record.competition?.poolType !== undefined) {
              item.pool_type = record.competition.poolType
            }

            items.push(item)
          }
        }
      })
    }

    // チーム記録を追加
    if (teamRecordsData && (teamRecordsData as any).teamRecords) {
      (teamRecordsData as any).teamRecords.forEach((record: any) => {
        // 日付範囲でフィルタリング（competitionのdateを使用）
        if (record.competition && record.competition.date) {
          const recordDate = new Date(record.competition.date)
          if (recordDate >= monthStart && recordDate <= monthEnd) {
            const timeString = record.time ? formatTime(record.time) : ''
            const relayIndicator = record.isRelaying ? 'R' : ''
            const styleInfo = record.style ? `${(record.style as any).name}` : '記録'
            const userName = record.user ? record.user.name : 'チームメンバー'
            const title = `${userName} - ${styleInfo}: ${timeString}${relayIndicator}`
            
            const item: any = {
              id: `team-${record.id}`, // チーム記録はIDにプレフィックスを追加
              item_type: 'record',
              item_date: record.competition.date,
              title,
              location: record.competition.title || '大会',
              is_relaying: record.isRelaying || false,
              team_record: true // チーム記録であることを示すフラグ
            }

            // record.timeが有限数値の場合のみtime_resultを設定
            if (Number.isFinite(Number(record.time))) {
              item.time_result = Math.round(Number(record.time) * 100)
            }

            // pool_typeは不明な場合は設定しない
            if (record.competition?.poolType !== undefined) {
              item.pool_type = record.competition.poolType
            }

            items.push(item)
          }
        }
      })
    }

    // チーム練習を追加
    if (teamPracticesData && (teamPracticesData as any).teamPracticesForCalendar) {
      (teamPracticesData as any).teamPracticesForCalendar.forEach((practice: any) => {
        const practiceDate = new Date(practice.date)
        if (practiceDate >= monthStart && practiceDate <= monthEnd) {
          const practicePlace = practice.place || '練習場'
          const practiceLogs = practice.practiceLogs || []
          const userName = practice.user ? practice.user.name : 'チームメンバー'
          
          if (practiceLogs.length > 0) {
            practiceLogs.forEach((log: any) => {
              const logDate = new Date(practice.date)
              if (logDate >= monthStart && logDate <= monthEnd) {
                const distance = log.distance || 0
                const time = log.time || 0
                const style = log.style ? log.style.name : 'Fr'
                const title = `${userName} - ${distance}m ${style} ${time > 0 ? formatTime(time) : ''}`
                
                items.push({
                  id: practice.id, // 実際のpractice.idを使用（詳細表示のため）
                  item_type: 'practice',
                  item_date: practice.date,
                  title,
                  location: practicePlace,
                  team_practice: true // チーム練習であることを示すフラグ
                })
              }
            })
          } else {
            // 練習ログがない場合
            const title = `${userName} - 練習: ${practicePlace}`
            items.push({
              id: practice.id, // 実際のpractice.idを使用（詳細表示のため）
              item_type: 'practice',
              item_date: practice.date,
              title,
              location: practicePlace,
              team_practice: true
            })
          }
        }
      })
    }

    // 個人大会を追加（記録がない大会も表示）
    if (competitionsData && (competitionsData as any).myCompetitions) {
      (competitionsData as any).myCompetitions.forEach((competition: any) => {
        if (competition.date) {
          const competitionDate = new Date(competition.date)
          if (competitionDate >= monthStart && competitionDate <= monthEnd) {
            // この大会に記録が既に存在するかチェック
            const hasRecord = items.some(item => 
              item.item_type === 'record' && 
              item.location === competition.title
            )
            
            // 記録がない場合のみ大会として追加
            if (!hasRecord) {
              items.push({
                id: `competition-${competition.id}`,
                item_type: 'competition',
                item_date: competition.date,
                title: competition.title,
                location: competition.place || '大会会場',
                pool_type: competition.poolType
              })
            }
          }
        }
      })
    }

    // チーム大会を追加（記録がない大会も表示）
    if (teamCompetitionsData && (teamCompetitionsData as any).teamCompetitionsForCalendar) {
      (teamCompetitionsData as any).teamCompetitionsForCalendar.forEach((competition: any) => {
        if (competition.date) {
          const competitionDate = new Date(competition.date)
          if (competitionDate >= monthStart && competitionDate <= monthEnd) {
            // この大会に記録が既に存在するかチェック
            const hasRecord = items.some(item => 
              item.item_type === 'record' && 
              item.location === competition.title &&
              item.team_record === true
            )
            
            // 記録がない場合のみ大会として追加
            if (!hasRecord) {
              items.push({
                id: `team-competition-${competition.id}`,
                item_type: 'competition',
                item_date: competition.date,
                title: `${competition.title}`,
                location: competition.place || '大会会場',
                pool_type: competition.poolType,
                team_record: true // チーム大会であることを示すフラグ
              })
            }
          }
        }
      })
    }

    return items
  }, [practicesData, recordsData, teamRecordsData, teamPracticesData, competitionsData, teamCompetitionsData, currentDate, USE_MOCK_DATA, monthStart, monthEnd])

  // 月間サマリー
  const monthlySummary: MonthlySummary = useMemo(() => {
    // モックデータを使用する場合
    if (USE_MOCK_DATA) {
      const practiceCount = calendarItems.filter(e => e.item_type === 'practice').length
      const recordCount = calendarItems.filter(e => e.item_type === 'record').length
      
      return {
        practiceCount,
        recordCount,
        totalDistance: 2500, // 2.5km
        averageTime: 2700 // 27.00s
      }
    }

    // GraphQLデータを使用する場合
    if (calendarData && (calendarData as any).calendarData?.summary) {
      const summary = (calendarData as any).calendarData.summary
      return {
        practiceCount: summary.totalPractices || 0,
        recordCount: summary.totalRecords || 0,
        totalDistance: undefined,
        averageTime: undefined
      }
    }

    // フォールバック: エントリーから計算
    const practiceCount = calendarItems.filter(e => e.item_type === 'practice').length
    const recordCount = calendarItems.filter(e => e.item_type === 'record').length

    return {
      practiceCount,
      recordCount
    }
  }, [calendarData, calendarItems, USE_MOCK_DATA])

  return {
    calendarItems,
    monthlySummary,
    loading: USE_MOCK_DATA ? false : (calendarLoading || practiceLoading || recordsLoading || teamRecordsLoading || teamPracticesLoading || competitionsLoading || teamCompetitionsLoading),
    error: USE_MOCK_DATA ? null : (calendarError || practiceError || recordsError || teamRecordsError || teamPracticesError || competitionsError || teamCompetitionsError),
    refetch: async () => {
      if (!USE_MOCK_DATA) {
        // すべてのクエリを並行して再実行
        await Promise.all([
          refetch(),
          refetchPractices(),
          refetchRecords(),
          refetchTeamRecords(),
          refetchTeamPractices(),
          refetchCompetitions(),
          refetchTeamCompetitions()
        ])
      }
    }
  }
}

export default useCalendarData
