import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from 'vitest'

import {
  ImageFile,
  ImageValidationResult,
  useImageUpload,
  UseImageUploadOptions,
} from '../../components/forms/shared/ImageUploader/hooks/useImageUpload'

// URL.createObjectURL / URL.revokeObjectURL のモック
const mockCreateObjectURL = vi.fn()
const mockRevokeObjectURL = vi.fn()

// crypto.randomUUID のモック
const mockRandomUUID = vi.fn()

describe('useImageUpload', () => {
  let mockValidateFile: Mock<(file: File) => Promise<ImageValidationResult>>
  let mockOnImagesChange: Mock<(newFiles: ImageFile[], deletedIds: string[]) => void>

  const createMockFile = (name = 'test.jpg', type = 'image/jpeg', size = 1024) => {
    const file = new File(['test content'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  const defaultOptions: UseImageUploadOptions = {
    maxImages: 5,
    currentCount: 0,
    validateFile: vi.fn().mockResolvedValue({ valid: true }),
    onImagesChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // URL APIのモック
    mockCreateObjectURL.mockImplementation(() => `blob:${URL.name}/${Math.random()}`)
    mockRevokeObjectURL.mockImplementation(() => undefined)
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    // crypto.randomUUID のモック
    let uuidCounter = 0
    mockRandomUUID.mockImplementation(() => `uuid-${++uuidCounter}`)
    global.crypto.randomUUID = mockRandomUUID

    mockValidateFile = vi.fn().mockResolvedValue({ valid: true })
    mockOnImagesChange = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('初期状態', () => {
    it('newFilesの初期値は空配列である', () => {
      const { result } = renderHook(() => useImageUpload(defaultOptions))
      expect(result.current.newFiles).toEqual([])
    })

    it('deletedIdsの初期値は空配列またはinitialDeletedIdsである', () => {
      const { result: result1 } = renderHook(() => useImageUpload(defaultOptions))
      expect(result1.current.deletedIds).toEqual([])

      const { result: result2 } = renderHook(() =>
        useImageUpload({ ...defaultOptions, initialDeletedIds: ['id-1', 'id-2'] })
      )
      expect(result2.current.deletedIds).toEqual(['id-1', 'id-2'])
    })

    it('isDraggingの初期値はfalseである', () => {
      const { result } = renderHook(() => useImageUpload(defaultOptions))
      expect(result.current.isDragging).toBe(false)
    })

    it('errorの初期値はnullである', () => {
      const { result } = renderHook(() => useImageUpload(defaultOptions))
      expect(result.current.error).toBeNull()
    })

    it('canAddMoreは上限に達していなければtrueである', () => {
      const { result } = renderHook(() =>
        useImageUpload({ ...defaultOptions, maxImages: 5, currentCount: 2 })
      )
      expect(result.current.canAddMore).toBe(true)
    })

    it('canAddMoreは上限に達していればfalseである', () => {
      const { result } = renderHook(() =>
        useImageUpload({ ...defaultOptions, maxImages: 5, currentCount: 5 })
      )
      expect(result.current.canAddMore).toBe(false)
    })
  })

  describe('validateFile - バリデーション成功', () => {
    it('バリデーション成功時にファイルが追加される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const file = createMockFile()

      await act(async () => {
        await result.current.handleFiles([file])
      })

      expect(result.current.newFiles).toHaveLength(1)
      expect(result.current.newFiles[0].file).toBe(file)
      expect(mockCreateObjectURL).toHaveBeenCalledWith(file)
      expect(mockOnImagesChange).toHaveBeenCalledWith(result.current.newFiles, [])
    })

    it('複数ファイルを同時に追加できる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const files = [createMockFile('test1.jpg'), createMockFile('test2.jpg'), createMockFile('test3.jpg')]

      await act(async () => {
        await result.current.handleFiles(files)
      })

      expect(result.current.newFiles).toHaveLength(3)
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(3)
    })
  })

  describe('validateFile - バリデーション失敗', () => {
    it('バリデーション失敗時にエラーが設定される', async () => {
      const mockFailingValidate = vi.fn().mockResolvedValue({
        valid: false,
        error: 'ファイルサイズが大きすぎます',
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockFailingValidate,
          onImagesChange: mockOnImagesChange,
        })
      )

      const file = createMockFile()

      await act(async () => {
        await result.current.handleFiles([file])
      })

      expect(result.current.error).toBe('ファイルサイズが大きすぎます')
      expect(result.current.newFiles).toHaveLength(0)
      expect(mockOnImagesChange).not.toHaveBeenCalled()
    })

    it('バリデーション失敗時にデフォルトエラーメッセージが使用される', async () => {
      const mockFailingValidate = vi.fn().mockResolvedValue({
        valid: false,
        // error は undefined
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockFailingValidate,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      expect(result.current.error).toBe('無効なファイルです')
    })

    it('複数ファイルで1つがバリデーション失敗した場合、既に作成されたURLがクリーンアップされる', async () => {
      let callCount = 0
      const mockValidateWithFailure = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          return { valid: false, error: '2番目のファイルが無効です' }
        }
        return { valid: true }
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateWithFailure,
          onImagesChange: mockOnImagesChange,
        })
      )

      const files = [createMockFile('test1.jpg'), createMockFile('test2.jpg'), createMockFile('test3.jpg')]

      await act(async () => {
        await result.current.handleFiles(files)
      })

      // 最初のファイルのURLは作成されたが、クリーンアップされるべき
      expect(mockRevokeObjectURL).toHaveBeenCalled()
      expect(result.current.error).toBe('2番目のファイルが無効です')
      expect(result.current.newFiles).toHaveLength(0)
    })
  })

  describe('validateFile - 例外発生', () => {
    it('バリデーション関数が例外を投げた場合、エラーが設定される', async () => {
      const mockThrowingValidate = vi.fn().mockRejectedValue(new Error('ネットワークエラー'))

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockThrowingValidate,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      expect(result.current.error).toBe('ネットワークエラー')
      expect(result.current.newFiles).toHaveLength(0)
    })

    it('非Errorオブジェクトが投げられた場合、デフォルトメッセージが使用される', async () => {
      const mockThrowingValidate = vi.fn().mockRejectedValue('string error')

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockThrowingValidate,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      expect(result.current.error).toBe('無効なファイルです')
    })

    it('例外発生時に既に作成されたURLとcurrentURLがクリーンアップされる', async () => {
      let callCount = 0
      const mockValidateWithException = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          throw new Error('バリデーションエラー')
        }
        return { valid: true }
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateWithException,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile('test1.jpg'), createMockFile('test2.jpg')])
      })

      // URL.revokeObjectURLが呼ばれていることを確認（クリーンアップ）
      expect(mockRevokeObjectURL).toHaveBeenCalled()
      expect(result.current.newFiles).toHaveLength(0)
    })
  })

  describe('maxImages と currentCount による制限', () => {
    it('残りスロット数を超えるファイル追加時にエラーが表示される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 3,
          currentCount: 2,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // 残り1スロットのところに2ファイル追加しようとする
      const files = [createMockFile('test1.jpg'), createMockFile('test2.jpg')]

      await act(async () => {
        await result.current.handleFiles(files)
      })

      expect(result.current.error).toBe('あと1枚まで追加できます（最大3枚）')
      expect(result.current.newFiles).toHaveLength(0)
      expect(mockOnImagesChange).not.toHaveBeenCalled()
    })

    it('削除済みファイルを考慮して残りスロットが計算される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 4,
          initialDeletedIds: ['deleted-1', 'deleted-2'],
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // currentCount(4) - deletedIds(2) + newFiles(0) = 2
      // maxImages(5) - 2 = 3 slots remaining

      const files = [createMockFile('test1.jpg'), createMockFile('test2.jpg'), createMockFile('test3.jpg')]

      await act(async () => {
        await result.current.handleFiles(files)
      })

      expect(result.current.newFiles).toHaveLength(3)
      expect(result.current.error).toBeNull()
    })

    it('canAddMoreが上限に達するとfalseになる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 2,
          currentCount: 0,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      expect(result.current.canAddMore).toBe(true)

      await act(async () => {
        await result.current.handleFiles([createMockFile('test1.jpg'), createMockFile('test2.jpg')])
      })

      expect(result.current.canAddMore).toBe(false)
    })
  })

  describe('URL クリーンアップ - 画像削除時', () => {
    it('handleRemoveNewFileでオブジェクトURLが解放される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // ファイルを追加
      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      const addedFileId = result.current.newFiles[0].id
      mockRevokeObjectURL.mockClear()

      // ファイルを削除
      act(() => {
        result.current.handleRemoveNewFile(addedFileId)
      })

      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1)
      expect(result.current.newFiles).toHaveLength(0)
    })

    it('存在しないIDで削除を試みてもエラーにならない', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      mockRevokeObjectURL.mockClear()

      act(() => {
        result.current.handleRemoveNewFile('non-existent-id')
      })

      // URLの解放は呼ばれない（ファイルが見つからないため）
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
      expect(result.current.newFiles).toHaveLength(1)
    })
  })

  describe('URL クリーンアップ - アンマウント時', () => {
    it('アンマウント時に全てのオブジェクトURLが解放される', async () => {
      const { result, unmount } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // 複数ファイルを追加
      await act(async () => {
        await result.current.handleFiles([
          createMockFile('test1.jpg'),
          createMockFile('test2.jpg'),
          createMockFile('test3.jpg'),
        ])
      })

      expect(result.current.newFiles).toHaveLength(3)
      mockRevokeObjectURL.mockClear()

      // アンマウント
      unmount()

      // 3つのURLが全て解放される
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(3)
    })
  })

  describe('onImagesChange コールバック', () => {
    it('ファイル追加時にonImagesChangeが呼ばれる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      expect(mockOnImagesChange).toHaveBeenCalledWith(result.current.newFiles, [])
    })

    it('新規ファイル削除時にonImagesChangeが呼ばれる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      const fileId = result.current.newFiles[0].id
      mockOnImagesChange.mockClear()

      act(() => {
        result.current.handleRemoveNewFile(fileId)
      })

      expect(mockOnImagesChange).toHaveBeenCalledWith([], [])
    })

    it('既存画像削除時にonImagesChangeが呼ばれる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      act(() => {
        result.current.handleRemoveExistingImage('existing-image-1')
      })

      expect(mockOnImagesChange).toHaveBeenCalledWith([], ['existing-image-1'])
    })

    it('initialDeletedIdsが正しくdeletedIdsに反映される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          initialDeletedIds: ['pre-deleted-1', 'pre-deleted-2'],
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      expect(result.current.deletedIds).toEqual(['pre-deleted-1', 'pre-deleted-2'])

      // 既存画像を削除
      act(() => {
        result.current.handleRemoveExistingImage('existing-image-1')
      })

      expect(mockOnImagesChange).toHaveBeenCalledWith([], ['pre-deleted-1', 'pre-deleted-2', 'existing-image-1'])
    })

    it('ファイル追加と既存画像削除の組み合わせで正しいペイロードが渡される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          initialDeletedIds: ['pre-deleted-1'],
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // ファイル追加
      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      const addedFiles = [...result.current.newFiles]

      // 既存画像削除
      act(() => {
        result.current.handleRemoveExistingImage('existing-1')
      })

      expect(mockOnImagesChange).toHaveBeenLastCalledWith(addedFiles, ['pre-deleted-1', 'existing-1'])
    })
  })

  describe('ドラッグ&ドロップ', () => {
    const createDragEvent = (files: File[]): React.DragEvent => {
      const dataTransfer = {
        files: files as unknown as FileList,
        items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
        types: ['Files'],
      }

      return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer,
      } as unknown as React.DragEvent
    }

    it('handleDragOverでisDraggingがtrueになる（追加可能時）', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 0,
          validateFile: mockValidateFile,
        })
      )

      const event = createDragEvent([])

      act(() => {
        result.current.handleDragOver(event)
      })

      expect(result.current.isDragging).toBe(true)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
    })

    it('handleDragOverで追加不可能時はisDraggingがfalseのまま', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 2,
          currentCount: 2,
          validateFile: mockValidateFile,
        })
      )

      const event = createDragEvent([])

      act(() => {
        result.current.handleDragOver(event)
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('handleDragLeaveでisDraggingがfalseになる', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
        })
      )

      const event = createDragEvent([])

      act(() => {
        result.current.handleDragOver(event)
      })

      expect(result.current.isDragging).toBe(true)

      act(() => {
        result.current.handleDragLeave(event)
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('handleDropでファイルが処理される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const files = [createMockFile('dropped.jpg')]
      const event = createDragEvent(files)

      await act(async () => {
        await result.current.handleDrop(event)
      })

      expect(result.current.isDragging).toBe(false)
      expect(result.current.newFiles).toHaveLength(1)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
    })

    it('handleDropで追加不可能時はファイルが処理されない', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 1,
          currentCount: 1,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const files = [createMockFile('dropped.jpg')]
      const event = createDragEvent(files)

      await act(async () => {
        await result.current.handleDrop(event)
      })

      expect(result.current.newFiles).toHaveLength(0)
      expect(mockOnImagesChange).not.toHaveBeenCalled()
    })

    it('handleDropでファイルが空の場合は何もしない', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const event = createDragEvent([])
      // filesを空に設定
      Object.defineProperty(event.dataTransfer, 'files', {
        value: { length: 0 },
        writable: true,
      })

      await act(async () => {
        await result.current.handleDrop(event)
      })

      expect(mockValidateFile).not.toHaveBeenCalled()
    })
  })

  describe('ファイル入力', () => {
    it('handleFileInputChangeでファイルが処理される', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const file = createMockFile('selected.jpg')
      const event = {
        target: {
          files: [file] as unknown as FileList,
          value: 'C:\\fakepath\\selected.jpg',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>

      Object.defineProperty(event.target.files, 'length', { value: 1 })

      await act(async () => {
        await result.current.handleFileInputChange(event)
      })

      expect(result.current.newFiles).toHaveLength(1)
      // 入力値がリセットされる
      expect(event.target.value).toBe('')
    })

    it('handleFileInputChangeでファイルがない場合は何もしない', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      const event = {
        target: {
          files: null,
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>

      await act(async () => {
        await result.current.handleFileInputChange(event)
      })

      expect(mockValidateFile).not.toHaveBeenCalled()
    })
  })

  describe('エラーメッセージ', () => {
    it('エラーが設定されclearErrorでクリアできる', async () => {
      const mockFailingValidate = vi.fn().mockResolvedValue({
        valid: false,
        error: 'エラーメッセージ',
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockFailingValidate,
        })
      )

      await act(async () => {
        await result.current.handleFiles([createMockFile()])
      })

      expect(result.current.error).toBe('エラーメッセージ')

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })

    it('新しいファイル処理開始時にエラーがクリアされる', async () => {
      const callCount = { value: 0 }
      const mockValidateOnce = vi.fn().mockImplementation(async () => {
        callCount.value++
        if (callCount.value === 1) {
          return { valid: false, error: '最初のエラー' }
        }
        return { valid: true }
      })

      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateOnce,
          onImagesChange: mockOnImagesChange,
        })
      )

      // 最初のファイルでエラー
      await act(async () => {
        await result.current.handleFiles([createMockFile('first.jpg')])
      })

      expect(result.current.error).toBe('最初のエラー')

      // 2回目のファイル処理でエラーがクリアされる（handleFilesの最初でsetError(null)が呼ばれる）
      await act(async () => {
        await result.current.handleFiles([createMockFile('second.jpg')])
      })

      expect(result.current.error).toBeNull()
      expect(result.current.newFiles).toHaveLength(1)
    })
  })

  describe('UI操作', () => {
    it('handleClickでファイル入力がクリックされる（追加可能時）', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 0,
        })
      )

      // fileInputRefにモックを設定
      const mockClick = vi.fn()
      // @ts-expect-error - テスト用にcurrentを直接設定
      result.current.fileInputRef.current = { click: mockClick }

      act(() => {
        result.current.handleClick()
      })

      expect(mockClick).toHaveBeenCalled()
    })

    it('handleClickで追加不可能時はファイル入力がクリックされない', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 1,
          currentCount: 1,
        })
      )

      const mockClick = vi.fn()
      // @ts-expect-error - テスト用にcurrentを直接設定
      result.current.fileInputRef.current = { click: mockClick }

      act(() => {
        result.current.handleClick()
      })

      expect(mockClick).not.toHaveBeenCalled()
    })

    it('handleKeyDownでEnterキーでhandleClickが呼ばれる', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 0,
        })
      )

      const mockClick = vi.fn()
      // @ts-expect-error - テスト用にcurrentを直接設定
      result.current.fileInputRef.current = { click: mockClick }

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLButtonElement>

      act(() => {
        result.current.handleKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
    })

    it('handleKeyDownでSpaceキーでhandleClickが呼ばれる', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 0,
        })
      )

      const mockClick = vi.fn()
      // @ts-expect-error - テスト用にcurrentを直接設定
      result.current.fileInputRef.current = { click: mockClick }

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLButtonElement>

      act(() => {
        result.current.handleKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
    })

    it('handleKeyDownで他のキーでは何もしない', () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 5,
          currentCount: 0,
        })
      )

      const mockClick = vi.fn()
      // @ts-expect-error - テスト用にcurrentを直接設定
      result.current.fileInputRef.current = { click: mockClick }

      const event = {
        key: 'Tab',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLButtonElement>

      act(() => {
        result.current.handleKeyDown(event)
      })

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockClick).not.toHaveBeenCalled()
    })
  })

  describe('複数ファイルの追加・削除シナリオ', () => {
    it('複数回に分けてファイルを追加し、一部を削除できる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          maxImages: 10,
          currentCount: 0,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // 最初のファイル追加
      await act(async () => {
        await result.current.handleFiles([createMockFile('file1.jpg'), createMockFile('file2.jpg')])
      })

      expect(result.current.newFiles).toHaveLength(2)
      const firstBatchIds = result.current.newFiles.map((f) => f.id)

      // 2回目のファイル追加
      await act(async () => {
        await result.current.handleFiles([createMockFile('file3.jpg')])
      })

      expect(result.current.newFiles).toHaveLength(3)

      // 最初のファイルを削除
      act(() => {
        result.current.handleRemoveNewFile(firstBatchIds[0])
      })

      expect(result.current.newFiles).toHaveLength(2)

      // 既存画像も削除
      act(() => {
        result.current.handleRemoveExistingImage('existing-1')
      })

      expect(result.current.deletedIds).toContain('existing-1')

      // 最終状態の確認
      const lastCall = mockOnImagesChange.mock.calls[mockOnImagesChange.mock.calls.length - 1]
      expect(lastCall[0]).toHaveLength(2) // newFiles
      expect(lastCall[1]).toEqual(['existing-1']) // deletedIds
    })
  })

  describe('FileListの処理', () => {
    it('FileListを正しく処理できる', async () => {
      const { result } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
          onImagesChange: mockOnImagesChange,
        })
      )

      // FileListをシミュレート
      const files = [createMockFile('file1.jpg'), createMockFile('file2.jpg')]
      const fileList = {
        0: files[0],
        1: files[1],
        length: 2,
        item: (index: number) => files[index],
        [Symbol.iterator]: function* () {
          yield files[0]
          yield files[1]
        },
      } as unknown as FileList

      await act(async () => {
        await result.current.handleFiles(fileList)
      })

      expect(result.current.newFiles).toHaveLength(2)
    })
  })

  describe('コールバックの安定性', () => {
    it('handleFilesは依存関係変更時に新しい参照になる', async () => {
      const { result, rerender } = renderHook(
        ({ maxImages }) =>
          useImageUpload({
            ...defaultOptions,
            maxImages,
            validateFile: mockValidateFile,
            onImagesChange: mockOnImagesChange,
          }),
        { initialProps: { maxImages: 5 } }
      )

      const firstCallback = result.current.handleFiles

      rerender({ maxImages: 10 })

      // maxImagesが変わったので新しい参照になる
      expect(result.current.handleFiles).not.toBe(firstCallback)
    })

    it('clearErrorは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useImageUpload({
          ...defaultOptions,
          validateFile: mockValidateFile,
        })
      )

      const firstCallback = result.current.clearError

      rerender()

      expect(result.current.clearError).toBe(firstCallback)
    })
  })
})
