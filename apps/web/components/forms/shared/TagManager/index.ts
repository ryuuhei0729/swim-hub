// フック
export {
  useTagManager,
  type Tag,
  type UseTagManagerOptions,
  type UseTagManagerReturn,
  PRESET_COLORS,
  getRandomColor,
  normalizeColor,
  isValidColor,
} from './hooks/useTagManager'

// 既存のコンポーネントへの参照
// TagInputとTagManagementModalは既存の場所から使用
// 将来的にここに移動する可能性あり
