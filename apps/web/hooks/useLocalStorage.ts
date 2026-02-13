import { useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T, version = 1) {
  const versionedKey = `${key}_v${version}`

  // 初期値を取得する関数
  const getInitialValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const item = window.localStorage.getItem(versionedKey)
      if (item) {
        return JSON.parse(item)
      }
      // 旧バージョンのキーがある場合はマイグレーション
      const oldItem = window.localStorage.getItem(key)
      if (oldItem && version > 1) {
        // 旧キーは削除せず、新しいバージョンのキーにコピー
        const parsed = JSON.parse(oldItem)
        window.localStorage.setItem(versionedKey, JSON.stringify(parsed))
        return parsed
      }
      return initialValue
    } catch {
      window.localStorage.removeItem(versionedKey)
      return initialValue
    }
  }

  const [storedValue, setStoredValue] = useState<T>(getInitialValue)

  // 値を設定する関数
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(versionedKey, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${versionedKey}":`, error)
    }
  }

  // 値を削除する関数
  const removeValue = () => {
    try {
      setStoredValue(initialValue)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(versionedKey)
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${versionedKey}":`, error)
    }
  }

  return [storedValue, setValue, removeValue] as const
}
