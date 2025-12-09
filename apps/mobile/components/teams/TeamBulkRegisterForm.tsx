import React, { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform } from 'react-native'
import { format } from 'date-fns'
import { TeamBulkRegisterAPI, type BulkRegisterInput } from '@apps/shared/api/teams/bulkRegister'
import { useAuth } from '@/contexts/AuthProvider'

interface PracticeRow {
  date: string
  title: string
  place: string
  note: string
}

interface CompetitionRow {
  date: string
  endDate: string
  title: string
  place: string
  poolType: number // 0: 短水路(25m), 1: 長水路(50m)
  note: string
}

interface TeamBulkRegisterFormProps {
  teamId: string
  onSuccess?: () => void
}

type Mode = 'practice' | 'competition'

type Result = {
  practicesCreated: number
  competitionsCreated: number
  errors: string[]
} | null

/**
 * チーム練習・大会一括登録フォーム（手動入力）
 */
export const TeamBulkRegisterForm: React.FC<TeamBulkRegisterFormProps> = ({ teamId, onSuccess }) => {
  const { supabase } = useAuth()
  const api = useMemo(() => new TeamBulkRegisterAPI(supabase), [supabase])

  const today = format(new Date(), 'yyyy-MM-dd')

  const [mode, setMode] = useState<Mode>('practice')
  const [practiceRows, setPracticeRows] = useState<PracticeRow[]>([
    { date: today, title: '', place: '', note: '' },
  ])
  const [competitionRows, setCompetitionRows] = useState<CompetitionRow[]>([
    { date: today, endDate: '', title: '', place: '', poolType: 0, note: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result>(null)

  const handleAddPracticeRow = () => {
    setPracticeRows((prev) => [...prev, { date: today, title: '', place: '', note: '' }])
  }

  const handleRemovePracticeRow = (index: number) => {
    setPracticeRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const handlePracticeChange = (index: number, key: keyof PracticeRow, value: string) => {
    setPracticeRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const handleAddCompetitionRow = () => {
    setCompetitionRows((prev) => [...prev, { date: today, endDate: '', title: '', place: '', poolType: 0, note: '' }])
  }

  const handleRemoveCompetitionRow = (index: number) => {
    setCompetitionRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const handleCompetitionChange = (index: number, key: keyof CompetitionRow, value: string | number) => {
    setCompetitionRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const validatePracticeRows = (): string[] => {
    const errors: string[] = []
    practiceRows.forEach((row, idx) => {
      if (!row.date.trim()) {
        errors.push(`${idx + 1}行目: 日付は必須です`)
      }
    })
    return errors
  }

  const validateCompetitionRows = (): string[] => {
    const errors: string[] = []
    competitionRows.forEach((row, idx) => {
      if (!row.date.trim()) {
        errors.push(`${idx + 1}行目: 開始日は必須です`)
      }
      if (row.endDate && row.endDate < row.date) {
        errors.push(`${idx + 1}行目: 終了日は開始日以降の日付を指定してください`)
      }
    })
    return errors
  }

  const buildInput = (): BulkRegisterInput => {
    return {
      practices: practiceRows
        .filter((row) => row.date.trim())
        .map((row) => ({
          date: row.date.trim(),
          title: row.title.trim() || null,
          place: row.place.trim() || null,
          note: row.note.trim() || null,
        })),
      competitions: competitionRows
        .filter((row) => row.date.trim())
        .map((row) => ({
          date: row.date.trim(),
          end_date: row.endDate.trim() || null,
          title: row.title.trim() || null,
          place: row.place.trim() || null,
          pool_type: row.poolType,
          note: row.note.trim() || null,
        })),
    }
  }

  const handleSubmit = async () => {
    setResult(null)
    setError(null)

    const errors = mode === 'practice' ? validatePracticeRows() : validateCompetitionRows()
    if (errors.length > 0) {
      setError(errors.join('\n'))
      return
    }

    const input = buildInput()
    if (mode === 'practice' && input.practices.length === 0) {
      setError('登録する練習データがありません')
      return
    }
    if (mode === 'competition' && input.competitions.length === 0) {
      setError('登録する大会データがありません')
      return
    }

    try {
      setLoading(true)
      const result = await api.bulkRegister(teamId, input)
      setResult({
        practicesCreated: result.practicesCreated,
        competitionsCreated: result.competitionsCreated,
        errors: result.errors,
      })
      if (result.success && onSuccess) {
        onSuccess()
      }
      // 正常終了時はフォームをリセット
      if (result.success) {
        setPracticeRows([{ date: today, title: '', place: '', note: '' }])
        setCompetitionRows([{ date: today, endDate: '', title: '', place: '', poolType: 0, note: '' }])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '一括登録に失敗しました'
      setError(message)
      if (Platform.OS === 'web') {
        window.alert(message)
      } else {
        Alert.alert('エラー', message, [{ text: 'OK' }])
      }
    } finally {
      setLoading(false)
    }
  }

  const renderPracticeRows = () => (
    <View style={styles.section}>
      {practiceRows.map((row, index) => (
        <View key={index} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>練習 {index + 1}</Text>
            {practiceRows.length > 1 && (
              <Pressable onPress={() => handleRemovePracticeRow(index)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>削除</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>日付 *</Text>
            <TextInput
              style={styles.input}
              value={row.date}
              onChangeText={(text) => handlePracticeChange(index, 'date', text)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>タイトル</Text>
            <TextInput
              style={styles.input}
              value={row.title}
              onChangeText={(text) => handlePracticeChange(index, 'title', text)}
              placeholder="例: 朝練"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>場所</Text>
            <TextInput
              style={styles.input}
              value={row.place}
              onChangeText={(text) => handlePracticeChange(index, 'place', text)}
              placeholder="例: 市民プール"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>備考</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={row.note}
              onChangeText={(text) => handlePracticeChange(index, 'note', text)}
              placeholder="メモ"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>
        </View>
      ))}
      <Pressable style={styles.addRowButton} onPress={handleAddPracticeRow}>
        <Text style={styles.addRowButtonText}>+ 行を追加</Text>
      </Pressable>
    </View>
  )

  const renderCompetitionRows = () => (
    <View style={styles.section}>
      {competitionRows.map((row, index) => (
        <View key={index} style={styles.rowCard}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>大会 {index + 1}</Text>
            {competitionRows.length > 1 && (
              <Pressable onPress={() => handleRemoveCompetitionRow(index)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>削除</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>開始日 *</Text>
            <TextInput
              style={styles.input}
              value={row.date}
              onChangeText={(text) => handleCompetitionChange(index, 'date', text)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>終了日</Text>
            <TextInput
              style={styles.input}
              value={row.endDate}
              onChangeText={(text) => handleCompetitionChange(index, 'endDate', text)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>大会名</Text>
            <TextInput
              style={styles.input}
              value={row.title}
              onChangeText={(text) => handleCompetitionChange(index, 'title', text)}
              placeholder="大会名"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>場所</Text>
            <TextInput
              style={styles.input}
              value={row.place}
              onChangeText={(text) => handleCompetitionChange(index, 'place', text)}
              placeholder="例: 市民プール"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>プール種別</Text>
            <View style={styles.poolTypeContainer}>
              <Pressable
                style={[styles.poolTypeButton, row.poolType === 0 && styles.poolTypeButtonActive]}
                onPress={() => handleCompetitionChange(index, 'poolType', 0)}
              >
                <Text style={[styles.poolTypeText, row.poolType === 0 && styles.poolTypeTextActive]}>25m</Text>
              </Pressable>
              <Pressable
                style={[styles.poolTypeButton, row.poolType === 1 && styles.poolTypeButtonActive]}
                onPress={() => handleCompetitionChange(index, 'poolType', 1)}
              >
                <Text style={[styles.poolTypeText, row.poolType === 1 && styles.poolTypeTextActive]}>50m</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>備考</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={row.note}
              onChangeText={(text) => handleCompetitionChange(index, 'note', text)}
              placeholder="メモ"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>
        </View>
      ))}
      <Pressable style={styles.addRowButton} onPress={handleAddCompetitionRow}>
        <Text style={styles.addRowButtonText}>+ 行を追加</Text>
      </Pressable>
    </View>
  )

  const renderPreview = () => {
    const input = buildInput()
    const hasPractices = input.practices.length > 0
    const hasCompetitions = input.competitions.length > 0
    if (!hasPractices && !hasCompetitions) return null

    return (
      <View style={styles.previewContainer}>
        <Text style={styles.previewTitle}>プレビュー</Text>
        {hasPractices && (
          <View style={styles.previewSection}>
            <Text style={styles.previewSectionTitle}>練習 {input.practices.length}件</Text>
            {input.practices.slice(0, 5).map((p, idx) => (
              <Text key={idx} style={styles.previewItem}>
                {p.date} / {p.title || '練習'} / {p.place || '-'}
              </Text>
            ))}
            {input.practices.length > 5 && (
              <Text style={styles.previewMore}>他 {input.practices.length - 5}件</Text>
            )}
          </View>
        )}
        {hasCompetitions && (
          <View style={styles.previewSection}>
            <Text style={styles.previewSectionTitle}>大会 {input.competitions.length}件</Text>
            {input.competitions.slice(0, 5).map((c, idx) => (
              <Text key={idx} style={styles.previewItem}>
                {c.date}{c.end_date ? `〜${c.end_date}` : ''} / {c.title || '大会'} / {c.place || '-'} / {c.pool_type === 0 ? '25m' : '50m'}
              </Text>
            ))}
            {input.competitions.length > 5 && (
              <Text style={styles.previewMore}>他 {input.competitions.length - 5}件</Text>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* モード切り替え */}
      <View style={styles.modeTabs}>
        <Pressable
          style={[styles.modeTab, mode === 'practice' && styles.modeTabActive]}
          onPress={() => setMode('practice')}
        >
          <Text style={[styles.modeTabText, mode === 'practice' && styles.modeTabTextActive]}>練習</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, mode === 'competition' && styles.modeTabActive]}
          onPress={() => setMode('competition')}
        >
          <Text style={[styles.modeTabText, mode === 'competition' && styles.modeTabTextActive]}>大会</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.formArea} contentContainerStyle={styles.formContent}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {mode === 'practice' ? renderPracticeRows() : renderCompetitionRows()}

        {renderPreview()}

        {/* 登録ボタン */}
        <Pressable
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>{loading ? '登録中...' : '一括登録'}</Text>
        </Pressable>

        {/* 結果表示 */}
        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>登録結果</Text>
            {result.practicesCreated > 0 && (
              <Text style={styles.resultText}>練習: {result.practicesCreated}件登録</Text>
            )}
            {result.competitionsCreated > 0 && (
              <Text style={styles.resultText}>大会: {result.competitionsCreated}件登録</Text>
            )}
            {result.errors.length > 0 && (
              <Text style={[styles.resultText, styles.resultError]}>
                エラー: {result.errors.join(', ')}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
  },
  modeTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  modeTabActive: {
    backgroundColor: '#2563EB',
  },
  modeTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  formArea: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 24,
    gap: 12,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  rowCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
  },
  fieldGroup: {
    marginTop: 8,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  poolTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  poolTypeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  poolTypeButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  poolTypeText: {
    fontSize: 14,
    color: '#374151',
  },
  poolTypeTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  addRowButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  addRowButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  previewContainer: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    gap: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  previewSection: {
    gap: 4,
  },
  previewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  previewItem: {
    fontSize: 13,
    color: '#374151',
  },
  previewMore: {
    fontSize: 12,
    color: '#6B7280',
  },
  submitButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resultBox: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    gap: 4,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  resultText: {
    fontSize: 13,
    color: '#1E3A8A',
  },
  resultError: {
    color: '#DC2626',
  },
})
