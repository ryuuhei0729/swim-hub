'use client'

import { useCallback, useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T, version = 1) {
  const versionedKey = `${key}_v${version}`

  // 初期値を取得する関数
  const getInitialValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    // 1. 現在のバージョンキーを確認
    const item = window.localStorage.getItem(versionedKey)
    if (item) {
      try {
        return JSON.parse(item)
      } catch (error) {
        console.warn(`Corrupted localStorage key "${versionedKey}", removing:`, error)
        window.localStorage.removeItem(versionedKey)
      }
    }

    // 2. 過去バージョンから最新のものを探してマイグレーション
    //    key_v{version-1}, key_v{version-2}, …, key_v1, key の順に検索
    for (let v = version - 1; v >= 0; v--) {
      const legacyKey = v === 0 ? key : `${key}_v${v}`
      const legacyItem = window.localStorage.getItem(legacyKey)
      if (legacyItem) {
        try {
          const parsed = JSON.parse(legacyItem)
          window.localStorage.setItem(versionedKey, JSON.stringify(parsed))
          return parsed
        } catch (error) {
          console.warn(`Corrupted localStorage key "${legacyKey}", removing:`, error)
          window.localStorage.removeItem(legacyKey)
        }
      }
    }

    // 3. 何も見つからなければ初期値を返す
    return initialValue
  }

  const [storedValue, setStoredValue] = useState<T>(getInitialValue)

  // 値を設定する関数（dispatch updater パターンで stale closure を回避）
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(versionedKey, JSON.stringify(valueToStore))
        }

        return valueToStore
      })
    } catch (error) {
      console.warn(`Error setting localStorage key "${versionedKey}":`, error)
    }
  }, [versionedKey])

  // 値を削除する関数
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(versionedKey)
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${versionedKey}":`, error)
    }
  }, [initialValue, versionedKey])

  return [storedValue, setValue, removeValue] as const
}
