'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { 
  PlusIcon, 
  CalendarDaysIcon,
  MapPinIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import TeamPracticeForm from './TeamPracticeForm'
import TeamPracticeLogForm from './TeamPracticeLogForm'

export interface TeamPractice {
  id: string
  user_id: string
  date: string
  place: string | null
  note: string | null
  created_at: string
  created_by: string | null
  users?: {
    name: string
  }
  created_by_user?: {
    name: string
  }
  practice_logs?: {
    id: string
    style: string
    distance: number
    practice_times?: {
      time: number
    }[]
  }[]
}

export interface TeamPracticesProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamPractices({ teamId, isAdmin = false }: TeamPracticesProps) {
  const { supabase } = useAuth()
  const [practices, setPractices] = useState<TeamPractice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPracticeForm, setShowPracticeForm] = useState(false)
  const [showPracticeLogForm, setShowPracticeLogForm] = useState(false)
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [editData, setEditData] = useState<any>(null)

  // チームの練習記録を取得（関数として抽出）
  const loadTeamPractices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // チームIDが設定された練習記録を取得
      const { data: practicesData, error: practicesError } = await supabase
        .from('practices')
        .select(`
          id,
          user_id,
          date,
          place,
          note,
          created_at,
          created_by,
          users!practices_user_id_fkey (
            name
          ),
          created_by_user:users!practices_created_by_fkey (
            name
          ),
          practice_logs (
            id,
            style,
            distance,
            practice_times (time)
          )
        `)
        .eq('team_id', teamId)
        .order('date', { ascending: false })
        .limit(20) // 最新20件のみ

      if (practicesError) throw practicesError

      setPractices(practicesData || [])
    } catch (err) {
      console.error('チーム練習情報の取得に失敗:', err)
      setError('チーム練習情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  // 初回読み込み
  useEffect(() => {
    loadTeamPractices()
  }, [loadTeamPractices])

  const handleAddPractice = () => {
    setShowPracticeForm(true)
  }

  const handlePracticeCreated = () => {
    // 練習記録一覧を再読み込み（画面全体ではなくデータのみ）
    loadTeamPractices()
  }

  const handlePracticeClick = async (practiceId: string) => {
    if (isAdmin) {
      try {
        // チームメンバーを取得
        const teamAPI = new (await import('@apps/shared/api/teams')).TeamAPI(supabase)
        const members = await teamAPI.getTeamMembers(teamId)
        
        setTeamMembers(members)
        setSelectedPracticeId(practiceId)
        setShowPracticeLogForm(true)
      } catch (err) {
        console.error('チームメンバー取得エラー:', err)
        alert('チームメンバーの取得に失敗しました')
      }
    }
  }

  // 既存のPractice_Logを取得して編集モードで開く
  const handleEditPracticeLog = async (practiceId: string) => {
    if (isAdmin) {
      try {
        // 既存のPractice_Logを取得
        const { data: practiceLogs, error: logsError } = await supabase
          .from('practice_logs')
          .select(`
            id,
            style,
            distance,
            rep_count,
            set_count,
            note,
            practice_log_tags (
              practice_tags (
                id,
                name,
                color,
                user_id
              )
            ),
            practice_times (
              id,
              user_id,
              set_number,
              rep_number,
              time
            )
          `)
          .eq('practice_id', practiceId)
          .order('created_at', { ascending: true })

        if (logsError) throw logsError

        // チームメンバーを取得
        const teamAPI = new (await import('@apps/shared/api/teams')).TeamAPI(supabase)
        const members = await teamAPI.getTeamMembers(teamId)

        // 秒数を表示用フォーマットに変換する関数
        const formatTimeFromSeconds = (seconds: number) => {
          if (seconds === 0) return ''
          const minutes = Math.floor(seconds / 60)
          const remainingSeconds = seconds % 60
          return minutes > 0 
            ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
            : `${remainingSeconds.toFixed(2)}`
        }

        // 編集データを構築
        const editData = practiceLogs?.map((log: any) => {
          // 各メンバーごとのタイムデータを整理
          const teamTimes: any[] = []
          
          members.forEach(member => {
            // このメンバーのタイムデータを抽出
            const memberTimes = log.practice_times
              ?.filter((timeEntry: any) => timeEntry.user_id === member.user_id)
              ?.map((timeEntry: any) => ({
                setNumber: timeEntry.set_number,
                repNumber: timeEntry.rep_number,
                time: timeEntry.time,
                displayValue: formatTimeFromSeconds(timeEntry.time)
              })) || []
            
            teamTimes.push({
              memberId: member.id,
              times: memberTimes
            })
          })
          
          return {
            ...log,
            tags: log.practice_log_tags?.map((logTag: any) => logTag.practice_tags) || [],
            times: teamTimes
          }
        }) || []

        setTeamMembers(members)
        setSelectedPracticeId(practiceId)
        setShowPracticeLogForm(true)
        
        // 編集データを状態に保存（後でTeamPracticeLogFormに渡す）
        setEditData(editData)
      } catch (err) {
        console.error('練習ログ取得エラー:', err)
        alert('練習ログの取得に失敗しました')
      }
    }
  }

  const handlePracticeLogCreated = () => {
    // 練習記録一覧を再読み込み（画面全体ではなくデータのみ）
    loadTeamPractices()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            チーム練習記録 ({practices.length}件)
          </h2>
          {isAdmin && (
            <button
              onClick={handleAddPractice}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              練習記録追加
            </button>
          )}
        </div>

      {/* 練習記録一覧 */}
      <div className="space-y-4">
        {practices.map((practice) => (
          <div 
            key={practice.id}
            onClick={() => {
              if (practice.practice_logs && practice.practice_logs.length > 0) {
                // 既存のPractice_Logがある場合は編集モード
                handleEditPracticeLog(practice.id)
              } else {
                // 既存のPractice_Logがない場合は新規作成モード
                handlePracticeClick(practice.id)
              }
            }}
            className={`border border-gray-200 rounded-lg p-4 transition-colors duration-200 ${
              isAdmin ? 'cursor-pointer hover:bg-gray-50' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-lg font-medium text-gray-900">
                    {format(new Date(practice.date), 'M月d日(E)', { locale: ja })}
                  </span>
                  <span className="text-sm text-gray-500">
                    by {practice.users?.name || practice.created_by_user?.name || 'Unknown'}
                  </span>
                </div>
                
                {practice.place && (
                  <div className="flex items-center space-x-2 mb-1">
                    <MapPinIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{practice.place}</span>
                  </div>
                )}
                
                {practice.note && (
                  <p className="text-sm text-gray-600 mb-2">{practice.note}</p>
                )}
                
                {practice.practice_logs && practice.practice_logs.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <ClockIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {practice.practice_logs.length}セットの練習
                    </span>
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {format(new Date(practice.created_at), 'M/d HH:mm')}
                </p>
              </div>
            </div>
          </div>
        ))}
        
        {practices.length === 0 && (
          <div className="text-center py-8">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">練習記録がありません</p>
            {isAdmin && (
              <button
                onClick={handleAddPractice}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                最初の練習記録を追加
              </button>
            )}
          </div>
        )}
      </div>
      </div>

      {/* チーム練習記録作成モーダル */}
      <TeamPracticeForm
        isOpen={showPracticeForm}
        onClose={() => setShowPracticeForm(false)}
        teamId={teamId}
        onSuccess={handlePracticeCreated}
      />

      {/* チーム練習ログ作成モーダル */}
      {selectedPracticeId && (
        <TeamPracticeLogForm
          isOpen={showPracticeLogForm}
          onClose={() => {
            setShowPracticeLogForm(false)
            setSelectedPracticeId(null)
            setEditData(null)
          }}
          practiceId={selectedPracticeId}
          teamMembers={teamMembers}
          onSuccess={handlePracticeLogCreated}
          editData={editData}
        />
      )}
    </>
  )
}
