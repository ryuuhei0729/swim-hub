'use client'

import { useState, useCallback, useMemo } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { StyleAPI } from '@apps/shared/api/styles'
import { EntryAPI } from '@apps/shared/api/entries'
import { EntryWithDetails } from '@apps/shared/types'
import type { Style } from '@apps/shared/types'
import type {
  EntryCompetition,
  UserEntry,
  EntryFormData,
  EntryFormErrors
} from '@/types/team-entry'
import { formatTime } from '@/utils/formatters'

const DEFAULT_FORM_DATA: EntryFormData = {
  styleId: '',
  entryTime: '',
  note: '',
  editingEntryId: null
}

// タイム文字列をパース（秒数に変換）
export function parseTime(timeStr: string): number | null {
  if (!timeStr || timeStr.trim() === '') return null

  const trimmed = timeStr.trim()

  try {
    const parts = trimmed.split(':')
    if (parts.length > 2) return null

    if (parts.length === 2) {
      const minutes = parseInt(parts[0].trim(), 10)
      const seconds = parseFloat(parts[1].trim())

      if (
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds) ||
        Number.isNaN(minutes) ||
        Number.isNaN(seconds) ||
        minutes < 0 ||
        seconds < 0
      ) {
        return null
      }

      return minutes * 60 + seconds
    } else {
      const seconds = parseFloat(trimmed)

      if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
        return null
      }

      return seconds
    }
  } catch {
    return null
  }
}

// エントリータイムのバリデーション
function validateEntryTime(entryTime: string): string | undefined {
  if (entryTime.trim() === '') return undefined

  const parsed = parseTime(entryTime)
  if (parsed === null) {
    return 'タイムの形式が正しくありません（例: 1:23.45 または 83.45）'
  }
  return undefined
}

export function useTeamEntry(supabase: SupabaseClient, teamId: string) {
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState<EntryCompetition[]>([])
  const [styles, setStyles] = useState<Style[]>([])
  const [expandedCompetitions, setExpandedCompetitions] = useState<Set<string>>(new Set())
  const [userEntries, setUserEntries] = useState<Record<string, UserEntry[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState<Record<string, EntryFormData>>({})
  const [errors, setErrors] = useState<Record<string, EntryFormErrors>>({})

  const styleAPI = useMemo(() => new StyleAPI(supabase), [supabase])
  const entryAPI = useMemo(() => new EntryAPI(supabase), [supabase])

  // データ読み込み
  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // エントリー受付中の大会を取得
      const { data: openComps, error: compsError } = await supabase
        .from('competitions')
        .select('*')
        .eq('team_id', teamId)
        .eq('entry_status', 'open')
        .order('date', { ascending: true })

      if (compsError) throw compsError
      setCompetitions(openComps)

      // 種目一覧を取得
      const stylesData = await styleAPI.getStyles()
      setStyles(stylesData)

      // 各大会のユーザーエントリーを取得
      if (openComps.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const entriesData: Record<string, UserEntry[]> = {}
        await Promise.all(
          openComps.map(async (comp: EntryCompetition) => {
            const entries = await entryAPI.getEntriesByCompetition(comp.id)
            const mine = (entries || []).filter(
              (e: EntryWithDetails) => e.user_id === user.id
            )
            const convertedEntries = mine.map((entry: EntryWithDetails) => ({
              ...entry,
              style: Array.isArray(entry.style) ? entry.style[0] : entry.style
            }))
            entriesData[comp.id] = convertedEntries
          })
        )
        setUserEntries(entriesData)
        setExpandedCompetitions(new Set())
      }
    } catch (error) {
      console.error('データの取得に失敗:', error)
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, styleAPI, entryAPI])

  // 大会の展開/折りたたみ
  const toggleCompetition = useCallback((competitionId: string) => {
    setExpandedCompetitions((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(competitionId)) {
        newExpanded.delete(competitionId)
      } else {
        newExpanded.add(competitionId)
      }
      return newExpanded
    })
  }, [])

  // フォームデータ取得
  const getFormData = useCallback(
    (competitionId: string): EntryFormData => {
      return formData[competitionId] || DEFAULT_FORM_DATA
    },
    [formData]
  )

  // フォームデータ更新
  const updateFormData = useCallback(
    (competitionId: string, updates: Partial<EntryFormData>) => {
      setFormData((prev) => {
        const currentForm = prev[competitionId] || DEFAULT_FORM_DATA
        const newForm = {
          ...currentForm,
          ...updates
        }

        // エントリータイムが更新された場合、バリデーション
        if ('entryTime' in updates) {
          const entryTimeError = validateEntryTime(newForm.entryTime)
          setErrors((prevErrors) => {
            const newErrors = { ...prevErrors }
            if (entryTimeError) {
              newErrors[competitionId] = {
                ...newErrors[competitionId],
                entryTime: entryTimeError
              }
            } else if (newErrors[competitionId]) {
              delete newErrors[competitionId].entryTime
              if (Object.keys(newErrors[competitionId]).length === 0) {
                delete newErrors[competitionId]
              }
            }
            return newErrors
          })
        }

        return {
          ...prev,
          [competitionId]: newForm
        }
      })
    },
    []
  )

  // ユーザーエントリー再取得
  const refetchUserEntries = useCallback(
    async (competitionId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const allEntries = await entryAPI.getEntriesByCompetition(competitionId)
      const mine = (allEntries || []).filter(
        (e: EntryWithDetails) => e.user_id === user.id
      )
      const convertedEntries = mine.map((entry: EntryWithDetails) => ({
        ...entry,
        style: Array.isArray(entry.style) ? entry.style[0] : entry.style
      }))

      setUserEntries((prev) => ({
        ...prev,
        [competitionId]: convertedEntries
      }))
    },
    [supabase, entryAPI]
  )

  // エントリー送信
  const handleSubmitEntry = useCallback(
    async (competitionId: string) => {
      const form = getFormData(competitionId)

      if (!form.styleId) {
        console.error('種目を選択してください')
        return
      }

      // エントリータイムのバリデーション
      const entryTimeError = validateEntryTime(form.entryTime)
      if (entryTimeError) {
        setErrors((prev) => ({
          ...prev,
          [competitionId]: {
            ...prev[competitionId],
            entryTime: entryTimeError
          }
        }))
        console.error('タイムの形式が正しくありません:', form.entryTime)
        return
      }

      // バリデーション通過後にパース（空文字の場合はnull）
      const entryTime = parseTime(form.entryTime)

      try {
        setSubmitting(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const entryData = {
          competition_id: competitionId,
          style_id: parseInt(form.styleId),
          entry_time: entryTime,
          note: form.note || null
        }

        const updatePayload = {
          style_id: parseInt(form.styleId),
          entry_time: entryTime,
          note: form.note || null
        }

        const existingEntry = await entryAPI.checkExistingEntry(
          competitionId,
          user.id,
          parseInt(form.styleId)
        )

        if (form.editingEntryId) {
          await entryAPI.updateEntry(form.editingEntryId, updatePayload)
        } else if (existingEntry) {
          await entryAPI.updateEntry(existingEntry.id, updatePayload)
        } else {
          await entryAPI.createTeamEntry(teamId, user.id, entryData)
        }

        // フォームをリセット
        updateFormData(competitionId, DEFAULT_FORM_DATA)

        // エントリー一覧を再読み込み
        await refetchUserEntries(competitionId)
      } catch (err) {
        console.error('エントリーの送信に失敗:', err)
      } finally {
        setSubmitting(false)
      }
    },
    [supabase, teamId, entryAPI, getFormData, updateFormData, refetchUserEntries]
  )

  // エントリー編集開始
  const handleEditEntry = useCallback(
    (competitionId: string, entry: UserEntry) => {
      updateFormData(competitionId, {
        styleId: entry.style_id.toString(),
        entryTime: entry.entry_time ? formatTime(entry.entry_time) : '',
        note: entry.note || '',
        editingEntryId: entry.id
      })
    },
    [updateFormData]
  )

  // 編集キャンセル
  const handleCancelEdit = useCallback(
    (competitionId: string) => {
      updateFormData(competitionId, DEFAULT_FORM_DATA)
    },
    [updateFormData]
  )

  // エントリー削除
  const handleDeleteEntry = useCallback(
    async (competitionId: string, entryId: string) => {
      if (!confirm('このエントリーを削除しますか？')) return

      try {
        setSubmitting(true)
        await entryAPI.deleteEntry(entryId)
        await refetchUserEntries(competitionId)
        alert('エントリーを削除しました')
      } catch (err) {
        console.error('エントリーの削除に失敗:', err)
      } finally {
        setSubmitting(false)
      }
    },
    [entryAPI, refetchUserEntries]
  )

  return {
    // State
    loading,
    competitions,
    styles,
    expandedCompetitions,
    userEntries,
    submitting,
    errors,

    // Actions
    loadData,
    toggleCompetition,
    getFormData,
    updateFormData,
    handleSubmitEntry,
    handleEditEntry,
    handleCancelEdit,
    handleDeleteEntry
  }
}
