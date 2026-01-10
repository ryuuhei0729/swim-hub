// =============================================================================
// React Native 静的モック - Vitest用
// =============================================================================

import React from 'react'
import { vi } from 'vitest'

// React Nativeコンポーネントのモック
export const View = ({
  children,
  style,
  ...props
}: { children?: React.ReactNode; style?: unknown } & Record<string, unknown>) => {
  // styleプロップを処理（配列の場合はマージ）
  const processedStyle = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style
  return React.createElement('div', { ...props, style: processedStyle }, children)
}

export const Text = ({
  children,
  style,
  numberOfLines,
  ...props
}: { children?: React.ReactNode; style?: unknown; numberOfLines?: number } & Record<string, unknown>) => {
  // styleプロップを処理（配列の場合はマージ）
  const processedStyle = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style
  // numberOfLinesはDOM要素では無視（React Native専用プロップ）
  // DOM要素ではCSSのline-clampを使用するが、テストでは無視してOK
  return React.createElement('span', { ...props, style: processedStyle }, children)
}

export const Pressable = ({
  children,
  onPress,
  style,
  ...props
}: { children?: React.ReactNode; onPress?: () => void; style?: unknown } & Record<string, unknown>) => {
  // styleプロップを処理（関数の場合は実行結果を使用）
  let processedStyle = style
  if (typeof style === 'function') {
    processedStyle = style({ pressed: false })
  } else if (Array.isArray(style)) {
    processedStyle = Object.assign({}, ...style.filter(Boolean))
  }
  return React.createElement('button', { ...props, style: processedStyle, onClick: onPress }, children)
}

export const ScrollView = ({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) =>
  React.createElement('div', { ...props, style: { overflow: 'auto' } }, children)

export const FlatList = ({
  data,
  renderItem,
  keyExtractor,
  ...props
}: {
  data?: unknown[]
  renderItem?: ({ item, index }: { item: unknown; index: number }) => React.ReactNode
  keyExtractor?: (item: unknown, index: number) => string | number
  children?: React.ReactNode
} & Record<string, unknown>) => {
  const items = data?.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : index
    return renderItem ? React.createElement('div', { key }, renderItem({ item, index })) : null
  })
  return React.createElement('div', props, items)
}

export const ActivityIndicator = ({ ...props }: Record<string, unknown>) =>
  React.createElement('div', props, 'Loading...')

export const RefreshControl = ({ ...props }: Record<string, unknown>) =>
  React.createElement('div', props)

export const Image = ({
  source,
  ...props
}: { source?: { uri?: string } | string } & Record<string, unknown>) => {
  const src = typeof source === 'string' ? source : source?.uri
  return React.createElement('img', { ...props, src })
}

export const TextInput = ({ ...props }: Record<string, unknown>) =>
  React.createElement('input', { type: 'text', ...props })

// StyleSheet API
// React NativeのStyleSheetは数値や文字列のスタイルを返すが、
// DOM要素ではオブジェクト形式が必要なため、変換を行う
export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => {
    // スタイルオブジェクトをそのまま返す（DOM要素でも動作するように）
    return Object.keys(styles).reduce((acc, key) => {
      const style = styles[key]
      if (typeof style === 'object' && style !== null) {
        // ネストされたスタイルオブジェクトをフラット化
        acc[key] = { ...style }
      } else {
        acc[key] = style
      }
      return acc
    }, {} as T)
  },
  flatten: <T>(style: T): T => {
    // スタイルをフラット化（DOM要素用に変換）
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean)) as T
    }
    return style
  },
}

// Platform API
export const Platform = {
  OS: 'web' as const,
  select: <T,>(obj: { web?: T; default?: T }): T | undefined => obj.web ?? obj.default,
}

// Alert API
export const Alert = {
  alert: vi.fn(),
  prompt: vi.fn(),
}

// デフォルトエクスポート（React Nativeのデフォルトエクスポートパターンに対応）
const ReactNative = {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
}

export default ReactNative
