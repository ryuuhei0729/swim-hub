'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import Calendar from './_components/Calendar'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import RecordForm from '@/components/forms/RecordForm'
import { useMutation, useQuery } from '@apollo/client/react'
import { gql } from '@apollo/client'
import { apolloClient } from '@/lib/apollo-client'
import { CREATE_PRACTICE, CREATE_PRACTICE_LOG, CREATE_RECORD, DELETE_PRACTICE, DELETE_PRACTICE_LOG, DELETE_RECORD, UPDATE_PRACTICE, UPDATE_PRACTICE_LOG, UPDATE_RECORD, CREATE_PRACTICE_TIME, UPDATE_PRACTICE_TIME, DELETE_PRACTICE_TIME, CREATE_COMPETITION, ADD_PRACTICE_LOG_TAG, REMOVE_PRACTICE_LOG_TAG } from '@/graphql/mutations'
import { GET_CALENDAR_DATA, GET_STYLES, GET_PRACTICE, GET_PRACTICE_LOG, GET_RECORD, GET_PRACTICE_LOGS, GET_RECORDS, GET_PRACTICES } from '@/graphql/queries'

export default function DashboardPage() {
  const { profile } = useAuth()
  const [showPracticeForm, setShowPracticeForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editingData, setEditingData] = useState<any>(null)


  // スタイルデータを取得
  const { data: stylesData } = useQuery(GET_STYLES)
  const styles = (stylesData as any)?.styles || []

  // 編集時の詳細データを取得
  const { data: practiceData, loading: practiceDataLoading, error: practiceDataError } = useQuery(GET_PRACTICE, {
    variables: { id: editingItem?.id },
    skip: !editingItem || editingItem.item_type !== 'practice',
  })

  // デバッグ: 練習記録データの取得状況をログ出力（開発環境でのみ）
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && editingItem?.item_type === 'practice') {
      console.log('Dashboard: editingItem for practice:', editingItem)
      console.log('Dashboard: practiceData:', practiceData)
      console.log('Dashboard: practiceDataLoading:', practiceDataLoading)
      console.log('Dashboard: practiceDataError:', practiceDataError)
    }
  }, [editingItem, practiceData, practiceDataLoading, practiceDataError])

  const { data: recordData, loading: recordLoading, error: recordError } = useQuery(GET_RECORD, {
    variables: { id: editingItem?.id },
    skip: !editingItem || editingItem.item_type !== 'record',
  })

  // デバッグ: 大会記録データの取得状況をログ出力（開発環境でのみ）
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && editingItem && editingItem.item_type === 'record') {
      console.log('Dashboard: Record query status:', {
        editingItemId: editingItem.id,
        recordLoading,
        recordError,
        recordData
      })
    }
  }, [editingItem, recordData, recordLoading, recordError])

  // GraphQLミューテーション
  const [createPractice] = useMutation(CREATE_PRACTICE, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      },
    ],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('練習の作成に失敗しました:', error)
      alert('練習の作成に失敗しました。')
    }
  })

  const [createPracticeLog] = useMutation(CREATE_PRACTICE_LOG, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      },
    ],
    awaitRefetchQueries: true,
    // キャッシュの更新はrefetchQueriesで自動的に行われるため、手動更新は不要
    onCompleted: () => {
      setShowPracticeForm(false)
      setSelectedDate(null)
    },
    onError: (error) => {
      console.error('練習記録の作成に失敗しました:', error)
      alert('練習記録の作成に失敗しました。')
    }
  })

  const [createRecord] = useMutation(CREATE_RECORD, {
    refetchQueries: [
      { query: GET_RECORDS },
      { 
        query: GET_CALENDAR_DATA,
        variables: { 
          year: new Date().getFullYear(), 
          month: new Date().getMonth() + 1 
        }
      }
    ],
    awaitRefetchQueries: true,
    onCompleted: () => {
      setShowRecordForm(false)
      setSelectedDate(null)
    },
    onError: (error) => {
      console.error('記録の作成に失敗しました:', error)
      alert('記録の作成に失敗しました。')
    }
  })

  const [deletePractice] = useMutation(DELETE_PRACTICE, {
    optimisticResponse: (variables) => ({
      deletePractice: true
    }),
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      },
    ],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('練習記録の削除に失敗しました:', error)
      alert('練習記録の削除に失敗しました。')
    }
  })

  const [deletePracticeLog] = useMutation(DELETE_PRACTICE_LOG, {
    optimisticResponse: (variables) => ({
      deletePracticeLog: true
    }),
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
    ],
    awaitRefetchQueries: true,
    update: (cache, { data }, { variables }) => {
      if (data?.deletePracticeLog) {
        // キャッシュから削除されたエントリーを除去
        cache.evict({ id: `PracticeLog:${variables?.id}` })

        // GET_PRACTICE_LOGSクエリのキャッシュからも削除
        try {
          const practiceLogsData = cache.readQuery({ query: GET_PRACTICE_LOGS }) as any
          if (practiceLogsData && practiceLogsData.myPracticeLogs) {
            const filteredLogs = practiceLogsData.myPracticeLogs.filter(
              (log: any) => log.id !== variables?.id
            )
            
            cache.writeQuery({
              query: GET_PRACTICE_LOGS,
              data: {
                myPracticeLogs: filteredLogs
              }
            })
          }
        } catch (error) {
          console.log('Practice logs cache update failed:', error)
        }
        
        cache.gc() // ガベージコレクション
      }
    },
    onError: (error) => {
      console.error('練習記録の削除に失敗しました:', error)
      alert('練習記録の削除に失敗しました。')
    }
  })

  const [deleteRecord] = useMutation(DELETE_RECORD, {
    optimisticResponse: (variables) => ({
      deleteRecord: true
    }),
    refetchQueries: [{
      query: GET_CALENDAR_DATA,
      variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
    }],
    awaitRefetchQueries: true,
    update: (cache, { data }, { variables }) => {
      if (data?.deleteRecord) {
        // キャッシュから削除されたエントリーを除去
        cache.evict({ id: `Record:${variables?.id}` })

        // GET_RECORDSクエリのキャッシュからも削除
        try {
          const recordsData = cache.readQuery({ query: GET_RECORDS }) as any
          if (recordsData && recordsData.myRecords) {
            const filteredRecords = recordsData.myRecords.filter(
              (record: any) => record.id !== variables?.id
            )
            
            cache.writeQuery({
              query: GET_RECORDS,
              data: {
                myRecords: filteredRecords
              }
            })
          }
        } catch (error) {
          console.log('Records cache update failed:', error)
        }
        
        cache.gc() // ガベージコレクション
      }
    },
    onError: (error) => {
      console.error('記録の削除に失敗しました:', error)
      alert('記録の削除に失敗しました。')
    }
  })

  const [updatePractice] = useMutation(UPDATE_PRACTICE, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      },
    ],
    awaitRefetchQueries: true,
    onError: (error) => {
      console.error('練習の更新に失敗しました:', error)
      alert('練習の更新に失敗しました。')
    }
  })

  const [updatePracticeLog] = useMutation(UPDATE_PRACTICE_LOG, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      },
    ],
    awaitRefetchQueries: true,
    update: (cache, { data }) => {
      if (data?.updatePracticeLog) {

        // GET_PRACTICE_LOGSクエリのキャッシュも更新
        try {
          const practiceLogsData = cache.readQuery({ query: GET_PRACTICE_LOGS }) as any
          if (practiceLogsData && practiceLogsData.myPracticeLogs) {
            const updatedLogs = practiceLogsData.myPracticeLogs.map((log: any) => {
              if (log.id === data.updatePracticeLog.id) {
                return data.updatePracticeLog
              }
              return log
            })
            
            cache.writeQuery({
              query: GET_PRACTICE_LOGS,
              data: {
                myPracticeLogs: updatedLogs
              }
            })
          }
        } catch (error) {
          console.log('Practice logs cache update failed:', error)
        }

        // キャッシュの更新はrefetchQueriesで自動的に行われるため、手動更新は不要
      }
    },
    onError: (error) => {
      console.error('練習記録の更新に失敗しました:', error)
      alert('練習記録の更新に失敗しました。')
    }
  })

  const [createPracticeTime] = useMutation(CREATE_PRACTICE_TIME, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      }
    ],
    awaitRefetchQueries: true
  })
  const [updatePracticeTime] = useMutation(UPDATE_PRACTICE_TIME)
  const [deletePracticeTime] = useMutation(DELETE_PRACTICE_TIME)
  const [createCompetition] = useMutation(CREATE_COMPETITION)

  const [addPracticeLogTag] = useMutation(ADD_PRACTICE_LOG_TAG)
  const [removePracticeLogTag] = useMutation(REMOVE_PRACTICE_LOG_TAG)

  const [updateRecord] = useMutation(UPDATE_RECORD, {
    optimisticResponse: (variables) => ({
      updateRecord: {
        __typename: 'Record',
        id: variables.id,
        userId: profile?.id,
        competitionId: null,
        styleId: variables.input.styleId,
        time: variables.input.time,
        videoUrl: variables.input.videoUrl,
        note: variables.input.note,
        style: styles.find(s => s.id === variables.input.styleId) || null,
        competition: null
      }
    }),
    refetchQueries: [{
      query: GET_CALENDAR_DATA,
      variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
    }],
    awaitRefetchQueries: true,
    update: (cache, { data }) => {
      if (data?.updateRecord) {

        // GET_RECORDSクエリのキャッシュも更新
        try {
          const recordsData = cache.readQuery({ query: GET_RECORDS }) as any
          if (recordsData && recordsData.myRecords) {
            const updatedRecords = recordsData.myRecords.map((record: any) => {
              if (record.id === data.updateRecord.id) {
                return data.updateRecord
              }
              return record
            })
            
            cache.writeQuery({
              query: GET_RECORDS,
              data: {
                myRecords: updatedRecords
              }
            })
          }
        } catch (error) {
          console.log('Records cache update failed:', error)
        }

        // 特定の記録のキャッシュも更新
        cache.writeFragment({
          id: `Record:${data.updateRecord.id}`,
          fragment: gql`
            fragment UpdatedRecord on Record {
              id
              userId
              competitionId
              styleId
              time
              videoUrl
              note
            }
          `,
          data: data.updateRecord
        })
      }
    },
    onCompleted: (data) => {
      console.log('Dashboard: Record update completed successfully:', data)
      setShowRecordForm(false)
      setSelectedDate(null)
      setEditingItem(null)
      setEditingData(null)
    },
    onError: (error) => {
      console.error('記録の更新に失敗しました:', error)
      alert('記録の更新に失敗しました。')
    }
  })

  // 詳細データが取得されたときにeditingDataを更新
  useEffect(() => {
    if (editingItem && editingItem.item_type === 'practice' && (practiceData as any)?.practice) {
      const practice = (practiceData as any).practice
      
      // Practice_logの数に応じて適切なデータ構造を設定
      const practiceLogs = practice.practiceLogs || []
      let newEditingData: any
      
      if (practiceLogs.length > 1) {
        // 複数のPractice_logを表示するために、Practice全体のデータを渡す
        newEditingData = {
          id: practice.id, // Practice ID
          practiceId: practice.id, // Practice ID
          date: practice.date || new Date().toISOString().split('T')[0],
          place: practice.place || '',
          note: practice.note || '',
          practiceLogs: practiceLogs // 複数のPractice_logを渡す
        }
        console.log('編集時 - 複数Practice_logのタイムデータ:', practiceLogs.map(log => ({ id: log.id, times: log.times })))
      } else if (practiceLogs.length === 1) {
        // 単一のPractice_logの場合、従来の構造を維持
        const practiceLog = practiceLogs[0]
        newEditingData = {
          id: practiceLog.id, // Practice_log ID
          practiceId: practice.id, // Practice ID
          date: practice.date || new Date().toISOString().split('T')[0],
          place: practice.place || '',
          note: practice.note || '',
          style: practiceLog.style,
          repCount: practiceLog.repCount,
          setCount: practiceLog.setCount,
          distance: practiceLog.distance,
          circle: practiceLog.circle,
          times: practiceLog.times || [], // 単一のPractice_logのタイムデータ
          tags: practiceLog.tags || [] // 単一のPractice_logのタグデータ
        }
        console.log('編集時 - 単一Practice_logのタイムデータ:', practiceLog.times)
      } else {
        // Practice_logがない場合（通常は発生しない）
        newEditingData = {
          id: practice.id,
          practiceId: practice.id,
          date: practice.date || new Date().toISOString().split('T')[0],
          place: practice.place || '',
          note: practice.note || ''
        }
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('Dashboard: New editing data for practice with multiple logs:', newEditingData)
      }
      setEditingData(newEditingData)
      if (process.env.NODE_ENV === 'development') {
        console.log('Dashboard: editingData has been set with practiceLogs array')
      }
    } else if (editingItem && editingItem.item_type === 'record' && (recordData as any)?.record) {
      const record = (recordData as any).record
      if (process.env.NODE_ENV === 'development') {
        console.log('Setting record data:', record)
      }
      const newEditingData = {
        id: record.id,
        recordDate: record.competition?.date || new Date().toISOString().split('T')[0],
        location: record.competition?.place || '',
        competitionName: record.competition?.title || '',
        poolType: record.competition?.poolType || 0,
        styleId: record.styleId,
        time: record.time,
        isRelaying: record.isRelay || false,
        splitTimes: record.splitTimes || [],
        videoUrl: record.videoUrl,
        note: record.note,
        competition: record.competition,
        style: record.style
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('New editing data for record:', newEditingData)
      }
      setEditingData(newEditingData)
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('No data to set, clearing editingData')
      }
      setEditingData(null)
    }
  }, [editingItem, practiceData, recordData])


  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
  }

  const handleAddItem = (date: Date, type: 'practice' | 'record') => {
    setSelectedDate(date)
    setEditingItem(null)
    setEditingData(null)
    if (type === 'practice') {
      setShowPracticeForm(true)
    } else {
      setShowRecordForm(true)
    }
  }

  const handleEditItem = (item: any) => {
    setEditingItem(item)
    setEditingData(null) // 編集データをリセット
    setSelectedDate(new Date(item.item_date))
    if (item.item_type === 'practice') {
      setShowPracticeForm(true)
    } else {
      setShowRecordForm(true)
    }
  }

  // タイムデータの変更を検知する関数
  const hasTimeDataChanged = (existingTimes: any[], newTimes: any[]): boolean => {
    // 長さが違う場合は変更あり
    if (existingTimes.length !== newTimes.length) {
      return true
    }

    // 各タイムを比較
    for (let i = 0; i < existingTimes.length; i++) {
      const existing = existingTimes[i]
      const newTime = newTimes[i]
      
      // 時間を数値に変換して比較
      const existingTimeNum = parseFloat(existing.time)
      const newTimeNum = parseFloat(newTime.time)
      
      if (existingTimeNum !== newTimeNum || 
          existing.repNumber !== newTime.repNumber || 
          existing.setNumber !== newTime.setNumber) {
        return true
      }
    }

    return false
  }

  // タイムデータを更新する関数
  const updatePracticeTimes = async (practiceLogId: string, existingTimes: any[], newTimes: any[]) => {
    // 既存のタイムを更新
    for (let i = 0; i < Math.min(existingTimes.length, newTimes.length); i++) {
      const existingTime = existingTimes[i]
      const newTime = newTimes[i]
      
      // 時間を数値に変換
      const newTimeNum = parseFloat(newTime.time)
      
      if (newTimeNum > 0) {
        try {
          await updatePracticeTime({
            variables: {
              id: existingTime.id,
              input: {
                time: newTimeNum,
                repNumber: newTime.repNumber,
                setNumber: newTime.setNumber
              }
            }
          })
        } catch (updateError) {
          console.error('タイム更新でエラーが発生しました:', updateError)
        }
      }
    }
    
    // 新しいタイムが既存より多い場合は追加作成
    if (newTimes.length > existingTimes.length) {
      for (let i = existingTimes.length; i < newTimes.length; i++) {
        const newTime = newTimes[i]
        const newTimeNum = parseFloat(newTime.time)
        
        if (newTimeNum > 0) {
          try {
            await createPracticeTime({
              variables: {
                input: {
                  practiceLogId,
                  repNumber: newTime.repNumber,
                  setNumber: newTime.setNumber,
                  time: newTimeNum
                }
              }
            })
          } catch (createError) {
            console.error('タイム作成でエラーが発生しました:', createError)
          }
        }
      }
    }
    
    // 既存のタイムが新しいタイムより多い場合は削除
    if (existingTimes.length > newTimes.length) {
      for (let i = newTimes.length; i < existingTimes.length; i++) {
        const existingTime = existingTimes[i]
        try {
          await deletePracticeTime({ variables: { id: existingTime.id } })
        } catch (deleteError) {
          console.error('タイム削除でエラーが発生しました:', deleteError)
        }
      }
    }
  }

  // タグの保存処理
  const savePracticeLogTags = async (practiceLogId: string, tags: any[], existingTags: any[] = []) => {
    try {
      console.log('savePracticeLogTags - practiceLogId:', practiceLogId)
      console.log('savePracticeLogTags - new tags:', tags)
      console.log('savePracticeLogTags - existing tags:', existingTags)
      
      // 既存のタグをすべて削除
      for (const existingTag of existingTags) {
        try {
          await removePracticeLogTag({
            variables: {
              practiceLogId: practiceLogId,
              practiceTagId: existingTag.id
            }
          })
        } catch (error) {
          console.warn('既存タグの削除に失敗しました:', error)
        }
      }
      
      // 新しいタグを追加
      for (const tag of tags) {
        try {
          await addPracticeLogTag({
            variables: {
              practiceLogId: practiceLogId,
              practiceTagId: tag.id
            }
          })
          console.log('タグを追加しました:', tag.name)
        } catch (error) {
          console.error('タグの追加に失敗しました:', error)
        }
      }
    } catch (error) {
      console.error('タグの保存に失敗しました:', error)
    }
  }

  const handlePracticeSubmit = async (formData: any) => {
    setIsLoading(true)
    try {
      const menus = Array.isArray(formData.sets) ? formData.sets : []

      // 編集時: 従来のPracticeLogのみを更新、新規時: Practice作成→PracticeLog作成
      const createdPracticeLogIds: string[] = []

      if (editingData && editingItem?.item_type === 'practice') {
        // 編集時: まずPractice本体を更新
        const practiceInput = {
          date: formData.practiceDate,
          place: formData.location,
          note: formData.note
        }
        await updatePractice({ variables: { id: editingData.practiceId, input: practiceInput } })

        // 編集時: 複数のPractice_logがある場合の処理
        if (editingData.practiceLogs && editingData.practiceLogs.length > 0) {
          // 複数のPractice_logを更新
          for (let i = 0; i < menus.length && i < editingData.practiceLogs.length; i++) {
            const m = menus[i]
            const existingLog = editingData.practiceLogs[i]
            const repsPerSet = (m?.reps as number) || 0
            const setCount = (m?.setCount as number) || 1
            const distancePerRep = (m?.distance as number) || 0
            const input = {
              practiceId: editingData.practiceId,
              style: m?.style || 'Fr',
              repCount: repsPerSet,
              setCount: setCount,
              distance: distancePerRep,
              circle: m?.circleTime || null,
              note: m?.note || ''
            }
            await updatePracticeLog({ variables: { id: existingLog.id, input } })
            
            // タグの保存
            const existingTags = existingLog.tags || []
            await savePracticeLogTags(existingLog.id, m?.tags || [], existingTags)
            
            // タイムデータの変更を確認してから更新処理を実行
            try {
              // 最新のPractice_logデータを取得
              const { data: latestPracticeLogData } = await apolloClient.query({
                query: GET_PRACTICE_LOG,
                variables: { id: existingLog.id },
                fetchPolicy: 'network-only' // キャッシュを無視して最新データを取得
              })
              
              const latestPracticeLog = (latestPracticeLogData as any)?.practiceLog
              const existingTimes = latestPracticeLog?.times || []
              const newTimes = m?.times || []
              
              // タイムデータに変更があるかチェック
              const hasChanged = hasTimeDataChanged(existingTimes, newTimes)
              
              if (hasChanged) {
                await updatePracticeTimes(existingLog.id, existingTimes, newTimes)
              }
            } catch (fetchError) {
              console.error('最新のPractice_logデータの取得に失敗しました:', fetchError)
              // フォールバック: 強制的に更新処理を実行
              await updatePracticeTimes(existingLog.id, existingLog.times || [], m?.times || [])
            }
            
            createdPracticeLogIds.push(existingLog.id)
          }
        } else {
          // 単一のPractice_logの場合の従来の処理
          const m = menus[0] || {}
          const repsPerSet = (m?.reps as number) || 0
          const setCount = (m?.setCount as number) || 1
          const distancePerRep = (m?.distance as number) || 0
          const input = {
            practiceId: editingData.practiceId, // 既存のPractice IDを使用
            style: m?.style || 'Fr',
            repCount: repsPerSet,
            setCount: setCount,
            distance: distancePerRep,
            circle: m?.circleTime || null,
            note: m?.note || ''
          }
          await updatePracticeLog({ variables: { id: editingData.id, input } })
          
          // タグの保存
          const existingTags = editingData.tags || []
          await savePracticeLogTags(editingData.id, m?.tags || [], existingTags)
          
          // タイムデータの変更を確認してから更新処理を実行
          try {
            // 最新のPractice_logデータを取得
            const { data: latestPracticeLogData } = await apolloClient.query({
              query: GET_PRACTICE_LOG,
              variables: { id: editingData.id },
              fetchPolicy: 'network-only' // キャッシュを無視して最新データを取得
            })
            
            const latestPracticeLog = (latestPracticeLogData as any)?.practiceLog
            const existingTimes = latestPracticeLog?.times || []
            const newTimes = m?.times || []
            
            // タイムデータに変更があるかチェック
            const hasChanged = hasTimeDataChanged(existingTimes, newTimes)
            
            if (hasChanged) {
              await updatePracticeTimes(editingData.id, existingTimes, newTimes)
            }
          } catch (fetchError) {
            console.error('最新のPractice_logデータの取得に失敗しました:', fetchError)
            // フォールバック: 強制的に更新処理を実行
            await updatePracticeTimes(editingData.id, editingData.times || [], m?.times || [])
          }
          
          createdPracticeLogIds.push(editingData.id)
        }
      } else {
        // 新規時: まずPracticeを作成
        const practiceInput = {
          date: formData.practiceDate,
          place: formData.location,
          note: formData.note
        }
        const practiceResult = await createPractice({ variables: { input: practiceInput } })
        const practiceId = (practiceResult.data as any)?.createPractice?.id

        if (practiceId) {
          // 各メニューをPracticeLogとして作成
          for (const m of menus) {
            const repsPerSet = (m?.reps as number) || 0
            const setCount = (m?.setCount as number) || 1
            const distancePerRep = (m?.distance as number) || 0
            const input = {
              practiceId: practiceId,
              style: m?.style || 'Fr',
              repCount: repsPerSet,
              setCount: setCount,
              distance: distancePerRep,
              circle: m?.circleTime || null,
              note: m?.note || ''
            }
            const result = await createPracticeLog({ variables: { input } })
            const id = (result.data as any)?.createPracticeLog?.id
            if (id) {
              createdPracticeLogIds.push(id)
              
              // タグの保存（新規作成時は既存タグなし）
              await savePracticeLogTags(id, m?.tags || [], [])
            }
          }
        }
      }

      // タイムデータの管理（新規作成時のみ）
      if (createdPracticeLogIds.length > 0 && menus.length > 0 && !editingData) {
        // メニューごとに新しいタイムを保存
        for (let i = 0; i < menus.length; i++) {
          const set = menus[i]
          const practiceLogId = createdPracticeLogIds[i] || createdPracticeLogIds[0]
          if (practiceLogId && set?.times && set.times.length > 0) {
            for (const timeRecord of set.times) {
              if (timeRecord.time > 0) {
                try {
                  await createPracticeTime({
                    variables: {
                      input: {
                        practiceLogId,
                        repNumber: timeRecord.repNumber,
                        setNumber: timeRecord.setNumber,
                        time: timeRecord.time
                      }
                    }
                  })
                } catch (timeError) {
                  console.error('タイム記録の保存でエラーが発生しました:', timeError)
                }
              }
            }
          }
        }
      }

      // すべてのミューテーション完了後、手動でキャッシュを更新
      try {
        await apolloClient.refetchQueries({
          include: [GET_CALENDAR_DATA, GET_PRACTICES]
        })
      } catch (refetchError) {
        console.error('キャッシュの手動更新でエラーが発生しました:', refetchError)
      }
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
      alert('練習記録の保存に失敗しました。エラー内容をコンソールで確認してください。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecordSubmit = async (formData: any) => {
    console.log('Dashboard: handleRecordSubmit called with:', formData)
    console.log('Dashboard: editingData:', editingData)
    console.log('Dashboard: editingItem:', editingItem)
    setIsLoading(true)
    try {
      let competitionId = null

      if (formData.id) {
        // 編集時は既存のCompetition IDを使用
        competitionId = editingData?.competition?.id || null
        console.log('Dashboard: Using existing competition ID:', competitionId)
      } else {
        // 新規作成時は大会情報が入力されている場合、先に大会を作成
        if (formData.competitionName && formData.location) {
          const competitionInput = {
            title: formData.competitionName,
            date: formData.recordDate,
            place: formData.location,
            poolType: formData.poolType,
            note: ''
          }

          const competitionResult = await createCompetition({
            variables: { input: competitionInput }
          })
          
          competitionId = (competitionResult.data as any)?.createCompetition?.id
        }
      }

      const recordInput = {
        styleId: parseInt(formData.styleId),
        time: formData.time,
        videoUrl: formData.videoUrl,
        note: formData.note,
        competitionId: competitionId,
        splitTimes: formData.splitTimes || []
      }

      if (formData.id) {
        // 更新処理
        console.log('Dashboard: Updating record with ID:', formData.id)
        console.log('Dashboard: Update input:', recordInput)
        const updateResult = await updateRecord({
          variables: {
            id: formData.id,
            input: recordInput
          }
        })
        console.log('Dashboard: Update result:', updateResult)
      } else {
        // 作成処理
        console.log('Dashboard: Creating new record')
        console.log('Dashboard: Create input:', recordInput)
        let createResult
        try {
          createResult = await createRecord({
            variables: { input: recordInput }
          })
        } catch (err: any) {
          // 一部の環境でCreateRecordInputにsplitTimesが未定義な場合のフォールバック
          const message = err?.message || ''
          const isSplitTimesFieldError = message.includes('Field "splitTimes" is not defined') || message.includes('Field \"splitTimes\" is not defined')
          if (isSplitTimesFieldError) {
            console.warn('splitTimesが未対応のためフォールバック実行: Recordのみ先に作成し、その後にスプリットを個別作成します。')
            const fallbackInput = { ...recordInput }
            delete (fallbackInput as any).splitTimes

            // Recordのみ作成
            createResult = await createRecord({ variables: { input: fallbackInput } })

            // 作成されたRecord IDを取得し、スプリットを個別追加
            const createdRecordId = (createResult as any)?.data?.createRecord?.id
            const splits: Array<{ distance: number; splitTime: number }> = recordInput.splitTimes || []
            if (createdRecordId && splits.length > 0) {
              for (const st of splits) {
                try {
                  await apolloClient.mutate({
                    mutation: gql`
                      mutation CreateSplitTime($input: CreateSplitTimeInput!) {
                        createSplitTime(input: $input) { id }
                      }
                    `,
                    variables: {
                      input: { recordId: createdRecordId, distance: st.distance, splitTime: st.splitTime }
                    }
                  })
                } catch (splitErr) {
                  console.error('スプリットの個別作成に失敗しました:', splitErr)
                }
              }
            }
          } else {
            throw err
          }
        }
        console.log('Dashboard: Create result:', createResult)
      }
    } catch (error) {
      console.error('大会記録の保存に失敗しました:', error)
      alert('大会記録の保存に失敗しました。')
    } finally {
      setIsLoading(false)
      // フォームを閉じる（onCompletedで処理されるが、エラー時も閉じる）
      if (!formData.id) {
        setShowRecordForm(false)
        setSelectedDate(null)
        setEditingItem(null)
        setEditingData(null)
      }
    }
  }

  const handleDeleteItem = async (itemId: string, itemType?: 'practice' | 'record') => {
    if (!itemType) {
      console.error('アイテムタイプが不明です')
      return
    }

    try {
      if (itemType === 'practice') {
        // Practice本体を削除（カスケード削除により関連するPracticeLogとPracticeTimeも削除される）
        await deletePractice({
          variables: { id: itemId }
        })
      } else {
        await deleteRecord({
          variables: { id: itemId }
        })
      }
      
      // 削除成功の通知
      console.log('記録が正常に削除されました')
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
      alert('記録の削除に失敗しました。')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full">
        {/* ページヘッダー */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            ダッシュボード
          </h1>
          <p className="text-gray-600">
            {profile?.name || 'ユーザー'}さん、お疲れ様です！
          </p>
        </div>
        
        {/* カレンダーコンポーネント */}
        <Calendar 
          onDateClick={handleDateClick}
          onAddItem={handleAddItem} 
          onEditItem={handleEditItem}
          onDeleteItem={handleDeleteItem}
        />
      </div>

      {/* 練習記録フォーム */}
      <PracticeLogForm
        isOpen={showPracticeForm}
        onClose={() => {
          setShowPracticeForm(false)
          setSelectedDate(null)
          setEditingItem(null)
          setEditingData(null)
        }}
        onSubmit={handlePracticeSubmit}
        onDeletePracticeLog={async (practiceLogId: string) => {
          try {
            await deletePracticeLog({
              variables: { id: practiceLogId }
            })
          } catch (error) {
            console.error('Practice_logの削除に失敗しました:', error)
            throw error
          }
        }}
        initialDate={selectedDate}
        editData={editingData}
        isLoading={isLoading}
      />

      {/* 大会記録フォーム */}
      <RecordForm
        isOpen={showRecordForm}
        onClose={() => {
          setShowRecordForm(false)
          setSelectedDate(null)
          setEditingItem(null)
          setEditingData(null)
        }}
        onSubmit={handleRecordSubmit}
        initialDate={selectedDate}
        editData={editingData}
        isLoading={isLoading}
        styles={styles}
      />
    </div>
  )
}

