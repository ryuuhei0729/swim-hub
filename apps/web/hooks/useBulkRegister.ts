import { useState, useMemo, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { TeamBulkRegisterAPI, BulkRegisterInput } from '@apps/shared/api/teams/bulkRegister'
import { parsePracticeExcelFile } from '@/utils/practiceExcel'
import { parseCompetitionExcelFile } from '@/utils/competitionExcel'
import type { ParsedData, RegisterResult } from '@/types/bulk-register'

export function useBulkRegister(supabase: SupabaseClient | null, teamId: string) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null)

  const bulkRegisterAPI = useMemo(() => {
    if (!supabase) return null
    return new TeamBulkRegisterAPI(supabase)
  }, [supabase])

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Excelファイル（.xlsx または .xls）を選択してください')
      return
    }

    setSelectedFile(file)
    setError(null)
    setSuccess(null)
    setRegisterResult(null)
    setLoading(true)

    try {
      const fileName = file.name.toLowerCase()

      if (fileName.includes('練習') || fileName.includes('practice')) {
        const data = await parsePracticeExcelFile(file)
        setParsedData({ type: 'practice', data })

        if (data.errors.length > 0) {
          setError(`${data.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
        }
      } else if (fileName.includes('大会') || fileName.includes('competition')) {
        const data = await parseCompetitionExcelFile(file)
        setParsedData({ type: 'competition', data })

        if (data.errors.length > 0) {
          setError(`${data.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
        }
      } else {
        // 自動判別
        try {
          const practiceData = await parsePracticeExcelFile(file)
          if (practiceData.practices.length > 0) {
            setParsedData({ type: 'practice', data: practiceData })
            if (practiceData.errors.length > 0) {
              setError(`${practiceData.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
            }
            return
          }
        } catch {
          // Ignore
        }

        try {
          const competitionData = await parseCompetitionExcelFile(file)
          if (competitionData.competitions.length > 0) {
            setParsedData({ type: 'competition', data: competitionData })
            if (competitionData.errors.length > 0) {
              setError(`${competitionData.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
            }
            return
          }
        } catch {
          // Ignore
        }

        setError('ファイルの形式を判別できませんでした。「練習一括登録」または「大会一括登録」のテンプレートを使用してください。')
        setParsedData(null)
      }
    } catch (err) {
      setError('ファイルの読み込みに失敗しました')
      console.error('ファイル読み込みエラー:', err)
      setParsedData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBulkRegister = useCallback(async () => {
    if (!parsedData || !bulkRegisterAPI) return

    const totalItems = parsedData.type === 'practice'
      ? parsedData.data.practices.length
      : parsedData.data.competitions.length

    if (totalItems === 0) {
      setError('登録するデータがありません')
      return
    }

    const errors = parsedData.type === 'practice'
      ? parsedData.data.errors
      : parsedData.data.errors

    if (errors.length > 0) {
      const confirmed = window.confirm(
        `${errors.length}件のエラーがありますが、エラーのないデータのみ登録しますか？`
      )
      if (!confirmed) return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setRegisterResult(null)

    try {
      const input: BulkRegisterInput = {
        practices: parsedData.type === 'practice' ? parsedData.data.practices : [],
        competitions: parsedData.type === 'competition' ? parsedData.data.competitions : []
      }

      const result = await bulkRegisterAPI.bulkRegister(teamId, input)

      setRegisterResult({
        practicesCreated: result.practicesCreated,
        competitionsCreated: result.competitionsCreated,
        errors: result.errors
      })

      if (result.success) {
        const message = parsedData.type === 'practice'
          ? `練習 ${result.practicesCreated}件の登録が完了しました`
          : `大会 ${result.competitionsCreated}件の登録が完了しました`
        setSuccess(message)
        setSelectedFile(null)
        setParsedData(null)
      } else {
        setError(`一部の登録に失敗しました: ${result.errors.join(', ')}`)
      }
    } catch (err) {
      setError('一括登録に失敗しました')
      console.error('一括登録エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [parsedData, bulkRegisterAPI, teamId])

  return {
    selectedFile,
    parsedData,
    loading,
    error,
    success,
    registerResult,
    handleFileSelect,
    handleBulkRegister,
    setLoading,
    setError
  }
}
