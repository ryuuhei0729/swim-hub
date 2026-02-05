import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { usePracticeTimeStore } from '@/stores/practiceTimeStore'
import type { MainStackParamList } from '@/navigation/types'
import type { TimeEntry } from '@apps/shared/types/ui'
import { formatTime } from '@/utils/formatters'
import { useQuickTimeInput } from '@/hooks/useQuickTimeInput'

type PracticeTimeFormScreenRouteProp = RouteProp<MainStackParamList, 'PracticeTimeForm'>
type PracticeTimeFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

// タイムエントリー（表示用にidとdisplayValueを追加）
interface TimeEntryWithDisplay extends TimeEntry {
  id: string
  displayValue?: string
}

/**
 * タイム入力画面
 * セット数×本数のタイムを入力
 */
export const PracticeTimeFormScreen: React.FC = () => {
  const route = useRoute<PracticeTimeFormScreenRouteProp>()
  const navigation = useNavigation<PracticeTimeFormScreenNavigationProp>()
  const { setCount, repCount, initialTimes = [] } = route.params
  const { setTimes: saveTimes, currentMenuId } = usePracticeTimeStore()

  // クイック入力フック
  const { parseInput, resetContext } = useQuickTimeInput()

  // タイムエントリー
  const [times, setTimes] = useState<TimeEntryWithDisplay[]>([])

  // 入力フィールドの参照（フォーカス遷移用）
  const inputRefs = useRef<(TextInput | null)[]>([])

  // 初期化
  useEffect(() => {
    // クイック入力コンテキストをリセット
    resetContext()

    // refs配列を初期化
    inputRefs.current = new Array(setCount * repCount).fill(null)

    // 全てのセット・レップの組み合わせを生成
    const allCombinations: TimeEntryWithDisplay[] = []
    for (let set = 1; set <= setCount; set++) {
      for (let rep = 1; rep <= repCount; rep++) {
        const existingTime = initialTimes.find(
          (t) => t.setNumber === set && t.repNumber === rep
        )

        allCombinations.push({
          id: existingTime?.id || `${set}-${rep}-${Date.now()}-${Math.random()}`,
          setNumber: set,
          repNumber: rep,
          time: existingTime?.time || 0,
          displayValue: existingTime && existingTime.time > 0 ? formatTime(existingTime.time) : '',
        })
      }
    }
    setTimes(allCombinations)
  }, [setCount, repCount, initialTimes, resetContext])

  // タイム入力の変更（入力中は表示値のみ更新）
  const handleTimeChange = (id: string, value: string) => {
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              displayValue: value,
            }
          : t
      )
    )
  }

  // タイム入力の確定（フォーカスアウト時 or Enter時）
  const handleTimeConfirm = (id: string, value: string) => {
    const { time, displayValue } = parseInput(value)
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              time,
              displayValue,
            }
          : t
      )
    )
  }

  // 次の入力フィールドへフォーカス
  const focusNextInput = (currentIndex: number) => {
    const nextIndex = currentIndex + 1
    if (nextIndex < inputRefs.current.length) {
      inputRefs.current[nextIndex]?.focus()
    }
  }

  // セットごとのタイムを取得
  const getTimesBySet = (setNumber: number) => {
    return times.filter((t) => t.setNumber === setNumber)
  }

  // セットごとの平均タイムを計算
  const getSetAverage = (setNumber: number) => {
    const setTimes = getTimesBySet(setNumber)
    const validTimes = setTimes.filter((t) => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // 全体の平均タイムを計算
  const getOverallAverage = () => {
    const validTimes = times.filter((t) => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // 最速タイムを取得
  const getFastestTime = () => {
    const validTimes = times.filter((t) => t.time > 0)
    if (validTimes.length === 0) return 0
    return Math.min(...validTimes.map((t) => t.time))
  }

  // 保存処理
  const handleSave = () => {
    // タイムデータをストアに保存（TimeEntry形式に変換）
    if (currentMenuId) {
      const timeEntries: TimeEntry[] = times.map((t) => ({
        setNumber: t.setNumber,
        repNumber: t.repNumber,
        time: t.time,
      }))
      saveTimes(currentMenuId, timeEntries)
    }
    navigation.goBack()
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>タイム入力</Text>
        <Text style={styles.subtitle}>
          {setCount}セット × {repCount}本のタイムを入力してください
        </Text>
      </View>

      <View style={styles.timesContainer}>
        {Array.from({ length: setCount }, (_, setIndex) => {
          const setNumber = setIndex + 1
          const setTimes = getTimesBySet(setNumber)
          const setAverage = getSetAverage(setNumber)
          const validTimesCount = setTimes.filter((t) => t.time > 0).length

          return (
            <View key={setNumber} style={styles.setContainer}>
              <View style={styles.setHeader}>
                <Text style={styles.setTitle}>セット {setNumber}</Text>
                <Text style={styles.setAverage}>
                  平均: {setAverage > 0 ? formatTime(setAverage) : '未入力'}
                  {validTimesCount > 0 && ` (${validTimesCount}本)`}
                </Text>
              </View>

              <View style={styles.timesGrid}>
                {setTimes.map((timeEntry, repIndex) => {
                  // 全体のインデックスを計算（セット数×本数）
                  const globalIndex = (setNumber - 1) * repCount + repIndex
                  const isLastInput = globalIndex === setCount * repCount - 1

                  return (
                    <View key={timeEntry.id} style={styles.timeInputContainer}>
                      <Text style={styles.timeLabel}>{timeEntry.repNumber}本目</Text>
                      <TextInput
                        ref={(ref) => {
                          inputRefs.current[globalIndex] = ref
                        }}
                        style={styles.timeInput}
                        value={timeEntry.displayValue || ''}
                        onChangeText={(value) => handleTimeChange(timeEntry.id, value)}
                        onBlur={() => handleTimeConfirm(timeEntry.id, timeEntry.displayValue || '')}
                        onSubmitEditing={() => {
                          handleTimeConfirm(timeEntry.id, timeEntry.displayValue || '')
                          focusNextInput(globalIndex)
                        }}
                        placeholder="例: 31-2"
                        keyboardType="default"
                        autoCapitalize="none"
                        returnKeyType={isLastInput ? 'done' : 'next'}
                        blurOnSubmit={false}
                      />
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })}
      </View>

      {/* 統計情報 */}
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>全体平均:</Text>
          <Text style={styles.statValue}>
            {getOverallAverage() > 0 ? formatTime(getOverallAverage()) : '未入力'}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>最速:</Text>
          <Text style={[styles.statValue, styles.statValueFastest]}>
            {getFastestTime() > 0 ? formatTime(getFastestTime()) : '未入力'}
          </Text>
        </View>
      </View>

      {/* ボタン */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.saveButton]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>保存</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  timesContainer: {
    gap: 16,
    marginBottom: 24,
  },
  setContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  setHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  setAverage: {
    fontSize: 12,
    color: '#6B7280',
  },
  timesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeInputContainer: {
    flex: 1,
    minWidth: '30%',
    gap: 4,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  timeInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  statsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  statValueFastest: {
    color: '#DC2626',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#2563EB',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
