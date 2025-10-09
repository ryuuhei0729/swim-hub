'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import Calendar from './_components/Calendar'
import PracticeForm from '@/components/forms/PracticeForm'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import RecordForm from '@/components/forms/RecordForm'
import { useMutation, useQuery } from '@apollo/client/react'
import { gql } from '@apollo/client'
import { apolloClient } from '@/lib/apollo-client'
import { CREATE_PRACTICE, CREATE_RECORD, DELETE_PRACTICE, DELETE_PRACTICE_LOG, DELETE_RECORD, UPDATE_PRACTICE, UPDATE_PRACTICE_LOG, UPDATE_RECORD, CREATE_PRACTICE_TIME, UPDATE_PRACTICE_TIME, DELETE_PRACTICE_TIME, CREATE_COMPETITION, ADD_PRACTICE_LOG_TAG, REMOVE_PRACTICE_LOG_TAG, CREATE_PRACTICE_LOG } from '@/graphql/mutations'
import { GET_CALENDAR_DATA, GET_STYLES, GET_PRACTICE, GET_PRACTICE_LOG, GET_RECORD, GET_PRACTICE_LOGS, GET_RECORDS, GET_PRACTICES, GET_COMPETITION_WITH_RECORDS } from '@/graphql/queries'

export default function DashboardPage() {
  const { profile } = useAuth()
  const [showPracticeForm, setShowPracticeForm] = useState(false)
  const [showPracticeLogForm, setShowPracticeLogForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editingData, setEditingData] = useState<any>(null)
  const [openDayDetail, setOpenDayDetail] = useState<Date | null>(null)
  const [currentPracticeId, setCurrentPracticeId] = useState<string | null>(null)


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
    }
  }, [editingItem, practiceData, practiceDataLoading, practiceDataError])

  const { data: recordData, loading: recordLoading, error: recordError } = useQuery(GET_RECORD, {
    variables: { id: editingItem?.id },
    skip: !editingItem || editingItem.item_type !== 'record',
  })

  // Competition IDから複数のRecordを取得するクエリ
  const { data: competitionData, loading: competitionLoading, error: competitionError } = useQuery(GET_COMPETITION_WITH_RECORDS, {
    variables: { id: editingItem?.competition_id },
    skip: !editingItem || editingItem.item_type !== 'record' || !editingItem?.competition_id,
  })

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
    awaitRefetchQueries: true
  })

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
      }
      setEditingData(newEditingData)
      if (process.env.NODE_ENV === 'development') {
      }
    } else if (editingItem && editingItem.item_type === 'record') {
      // 複数のRecordがある場合（Competitionから取得）
      if ((competitionData as any)?.competition) {
        const competition = (competitionData as any).competition
        const records = competition.records || []
        
        if (process.env.NODE_ENV === 'development') {
        }
        
        const newEditingData = {
          id: editingItem.id, // 編集対象のRecord ID
          recordDate: competition.date || new Date().toISOString().split('T')[0],
          location: competition.place || '',
          competitionName: competition.title || '',
          poolType: competition.poolType || 0,
          records: records.map((record: any) => ({
            id: record.id,
            styleId: record.styleId.toString(),
            time: record.time,
            isRelaying: record.isRelaying || false,
            splitTimes: record.splitTimes || [],
            videoUrl: record.videoUrl || '',
            note: record.note || ''
          })),
          note: competition.note || '',
          competition: competition
        }
        
        if (process.env.NODE_ENV === 'development') {
        }
        setEditingData(newEditingData)
      } 
      // 単一のRecordの場合（従来の処理）
      else if ((recordData as any)?.record) {
        const record = (recordData as any).record
        if (process.env.NODE_ENV === 'development') {
        }
        const newEditingData = {
          id: record.id,
          recordDate: record.competition?.date || new Date().toISOString().split('T')[0],
          location: record.competition?.place || '',
          competitionName: record.competition?.title || '',
          poolType: record.competition?.poolType || 0,
          records: [{
            id: record.id,
            styleId: record.styleId.toString(),
            time: record.time,
            isRelaying: record.isRelaying || false,
            splitTimes: record.splitTimes || [],
            videoUrl: record.videoUrl || '',
            note: record.note || ''
          }],
          note: record.note || '',
          competition: record.competition,
          style: record.style
        }
        if (process.env.NODE_ENV === 'development') {
        }
        setEditingData(newEditingData)
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
      }
      setEditingData(null)
    }
  }, [editingItem, practiceData, recordData, competitionData])


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

  const handleAddPracticeLog = (practiceId: string) => {
    setCurrentPracticeId(practiceId)
    setShowPracticeLogForm(true)
  }

  const handlePracticeSubmit = async (formData: any) => {
    setIsLoading(true)
    try {
      const practiceInput = {
        date: formData.practiceDate,
        place: formData.place,
        note: formData.note
      }

      if (editingData) {
        // 編集モードの場合
        try {
          await updatePractice({
            variables: {
              id: editingData.id,
              input: practiceInput
            }
          })
        } catch (updateError) {
          console.error('Practice更新エラー:', updateError)
          throw updateError
        }
      } else {
        // 新規作成モードの場合
        const result = await createPractice({ variables: { input: practiceInput } })
        const practiceId = (result.data as any)?.createPractice?.id
        
        if (practiceId) {
          // カレンダーをリロードして記録モーダルに戻る
          setShowPracticeForm(false)
          setEditingItem(null)
          setEditingData(null)
          
          // カレンダーデータをリフレッシュ
          try {
            await apolloClient.refetchQueries({
              include: [GET_CALENDAR_DATA, GET_PRACTICES]
            })
            
            // リフレッシュ後にその日の記録モーダルを開く
            setTimeout(() => {
              if (selectedDate) {
                setOpenDayDetail(selectedDate)
              }
            }, 100)
          } catch (refetchError) {
            console.error('カレンダーのリフレッシュに失敗しました:', refetchError)
          }
        }
      }
      
      // 編集モードの場合もカレンダーをリフレッシュ
      if (editingData) {
        try {
          await apolloClient.refetchQueries({
            include: [GET_CALENDAR_DATA, GET_PRACTICES]
          })
        } catch (refetchError) {
          console.error('カレンダーのリフレッシュに失敗しました:', refetchError)
        }
        setShowPracticeForm(false)
        setEditingItem(null)
        setEditingData(null)
      }
    } catch (error) {
      console.error('練習記録の処理に失敗しました:', error)
      alert('練習記録の処理に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }


  const handleEditItem = (item: any) => {
    setEditingItem(item)
    setSelectedDate(new Date(item.item_date))
    if (item.item_type === 'practice') {
      // Practice編集の場合は、practiceIdを渡してhandleEditPracticeを呼び出す
      handleEditPractice(item.id)
    } else {
      setEditingData(null) // Record編集の場合はリセット
      setShowRecordForm(true)
    }
  }

  // Practice編集のハンドラー
  const handleEditPractice = async (practiceId: string) => {
    try {
      const result = await apolloClient.query({
        query: GET_PRACTICE,
        variables: { id: practiceId },
        fetchPolicy: 'network-only' // キャッシュを無視して最新データを取得
      })
      
      if (result.data && (result.data as any)?.practice) {
        const practiceData = (result.data as any).practice
        setEditingData(practiceData)
        setShowPracticeForm(true)
      } else {
        console.error('Practiceデータが見つかりません:', result.data)
        alert('Practiceデータが見つかりません。')
      }
    } catch (error) {
      console.error('Practiceデータの取得に失敗しました:', error)
      console.error('エラーの詳細:', error.message)
      console.error('エラーのスタック:', error.stack)
      alert(`Practiceデータの取得に失敗しました: ${error.message}`)
    }
  }

  // PracticeLog編集のハンドラー
  const handleEditPracticeLog = async (log: any) => {
    try {
      // PracticeLogの詳細データを取得
      const { data } = await apolloClient.query({
        query: GET_PRACTICE_LOG,
        variables: { id: log.id }
      })
      
      if ((data as any)?.practiceLog) {
        const practiceLog = (data as any).practiceLog
        setEditingData(practiceLog)
        setCurrentPracticeId(practiceLog.practiceId)
        setShowPracticeLogForm(true)
      } else {
        console.error('PracticeLogデータが見つかりません:', data)
        alert('PracticeLogデータが見つかりません。')
      }
    } catch (error) {
      console.error('PracticeLogデータの取得に失敗しました:', error)
      alert('PracticeLogデータの取得に失敗しました。')
    }
  }

  // PracticeLog削除のハンドラー
  const handleDeletePracticeLog = async (logId: string) => {
    if (!confirm('この練習メニューを削除しますか？')) return
    
    try {
      await deletePracticeLog({
        variables: { id: logId }
      })
      
      // カレンダーデータを再取得
      await apolloClient.refetchQueries({
        include: [GET_CALENDAR_DATA]
      })
    } catch (error) {
      console.error('PracticeLogの削除に失敗しました:', error)
      alert('PracticeLogの削除に失敗しました。')
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
        } catch (error) {
          console.error('タグの追加に失敗しました:', error)
        }
      }
    } catch (error) {
      console.error('タグの保存に失敗しました:', error)
    }
  }


  const handleRecordSubmit = async (formData: any) => {
    setIsLoading(true)
    try {
      let competitionId = null

      if (formData.id) {
        // 編集時は既存のCompetition IDを使用
        competitionId = editingData?.competition?.id || null
      } else {
        // 新規作成時は大会情報が入力されている場合、先に大会を作成
        if (formData.competitionName && formData.location) {
          const competitionInput = {
            title: formData.competitionName,
            date: formData.recordDate,
            place: formData.location,
            poolType: formData.poolType,
            note: formData.note || ''
          }

          const competitionResult = await createCompetition({
            variables: { input: competitionInput }
          })
          
          competitionId = (competitionResult.data as any)?.createCompetition?.id
        }
      }

      // 複数のRecordを処理
      const records = formData.records || []

      if (editingData && editingData.records && editingData.records.length > 0) {
        // 編集時: 複数のRecordを更新
        for (let i = 0; i < records.length && i < editingData.records.length; i++) {
          const recordData = records[i]
          const existingRecord = editingData.records[i]
          
          const recordInput = {
            styleId: parseInt(recordData.styleId),
            time: recordData.time,
            videoUrl: recordData.videoUrl,
            note: recordData.note,
            isRelaying: recordData.isRelaying || false,
            competitionId: competitionId,
            splitTimes: recordData.splitTimes || []
          }

          
          const updateResult = await updateRecord({
            variables: {
              id: existingRecord.id,
              input: recordInput
            }
          })
        }
      } else if (records.length > 0) {
        // 新規作成時: 複数のRecordを作成
        for (const recordData of records) {
          const recordInput = {
            styleId: parseInt(recordData.styleId),
            time: recordData.time,
            videoUrl: recordData.videoUrl,
            note: recordData.note,
            isRelaying: recordData.isRelaying || false,
            competitionId: competitionId,
            splitTimes: recordData.splitTimes || []
          }

          
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
        }
      } else {
        // 従来の単一Record処理（後方互換性のため）
        const recordInput = {
          styleId: parseInt(formData.styleId),
          time: formData.time,
          videoUrl: formData.videoUrl,
          note: formData.note,
          isRelaying: formData.isRelaying || false,
          competitionId: competitionId,
          splitTimes: formData.splitTimes || []
        }

        if (formData.id) {
          // 更新処理
          const updateResult = await updateRecord({
            variables: {
              id: formData.id,
              input: recordInput
            }
          })
        } else {
          // 作成処理
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
        }
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
          onAddPracticeLog={handleAddPracticeLog}
          onEditPracticeLog={handleEditPracticeLog}
          onDeletePracticeLog={handleDeletePracticeLog}
          openDayDetail={openDayDetail}
        />
      </div>

      {/* 練習記録フォーム（第1段階：Practiceのみ作成） */}
      <PracticeForm
        isOpen={showPracticeForm}
        onClose={() => {
          setShowPracticeForm(false)
          setSelectedDate(null)
          setEditingItem(null)
          setEditingData(null)
        }}
        onSubmit={handlePracticeSubmit}
        initialDate={selectedDate}
        editData={editingData}
        isLoading={isLoading}
      />

      {/* 練習メニューフォーム（第2段階：PracticeLog作成） */}
      {currentPracticeId && (
        <PracticeLogForm
          isOpen={showPracticeLogForm}
          onClose={() => {
            setShowPracticeLogForm(false)
            setCurrentPracticeId(null)
            setEditingData(null)
          }}
          editData={editingData}
          onSubmit={async (formDataArray) => {
            setIsLoading(true)
            try {
              // 複数のPracticeLogを順次作成
              for (const formData of formDataArray) {
                // PracticeLogを作成
                const practiceLogResult = await createPracticeLog({
                  variables: {
                    input: {
                      practiceId: currentPracticeId!,
                      style: formData.style,
                      repCount: formData.repCount,
                      setCount: formData.setCount,
                      distance: formData.distance,
                      circle: formData.circle,
                      note: formData.note
                    }
                  }
                })
                
                const practiceLogId = (practiceLogResult.data as any)?.createPracticeLog?.id
                
                if (practiceLogId) {
                  // PracticeTimeを作成
                  for (const time of formData.times) {
                    if (time.time > 0) {
                      await createPracticeTime({
                        variables: {
                          input: {
                            practiceLogId: practiceLogId,
                            repNumber: time.repNumber,
                            setNumber: time.setNumber,
                            time: time.time
                          }
                        }
                      })
                    }
                  }
                  
                  // タグを追加
                  for (const tagId of formData.tagIds) {
                    await addPracticeLogTag({
                      variables: {
                        practiceLogId: practiceLogId,
                        practiceTagId: tagId
                      }
                    })
                  }
                }
              }
              
              // カレンダーをリフレッシュ
              await apolloClient.refetchQueries({
                include: [GET_CALENDAR_DATA, GET_PRACTICES]
              })
              
              setShowPracticeLogForm(false)
              setCurrentPracticeId(null)
              
              // その日の記録モーダルを開く
              setTimeout(() => {
                if (selectedDate) {
                  setOpenDayDetail(selectedDate)
                }
              }, 100)
              
            } catch (error) {
              console.error('練習メニューの作成に失敗しました:', error)
              alert('練習メニューの作成に失敗しました。')
            } finally {
              setIsLoading(false)
            }
          }}
          practiceId={currentPracticeId}
          isLoading={isLoading}
        />
      )}


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


