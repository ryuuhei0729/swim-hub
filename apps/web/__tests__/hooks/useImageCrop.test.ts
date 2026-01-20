import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// imageUtilsモジュールのモック（ファイル最上部で設定）
const mockCreateImage = vi.fn()
const mockGetCroppedImg = vi.fn()

vi.mock('../../utils/imageUtils', () => ({
  createImage: mockCreateImage,
  getCroppedImg: mockGetCroppedImg,
}))

// モック後にimport
import { useImageCrop } from '../../hooks/useImageCrop'

describe('useImageCrop', () => {
  let mockOnCropComplete: (croppedFile: File) => void
  let mockOnCancel: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnCropComplete = vi.fn() as (croppedFile: File) => void
    mockOnCancel = vi.fn() as () => void
  })

  describe('初期状態', () => {
    it('cropの初期値はx:0, y:0である', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      expect(result.current.crop).toEqual({ x: 0, y: 0 })
    })

    it('zoomの初期値は1である', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      expect(result.current.zoom).toBe(1)
    })

    it('croppedAreaPixelsの初期値はnullである', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      expect(result.current.croppedAreaPixels).toBeNull()
    })

    it('isProcessingの初期値はfalseである', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      expect(result.current.isProcessing).toBe(false)
    })
  })

  describe('状態遷移', () => {
    it('setCropでcrop値を更新できる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      act(() => {
        result.current.setCrop({ x: 10, y: 20 })
      })

      expect(result.current.crop).toEqual({ x: 10, y: 20 })
    })

    it('setZoomでzoom値を更新できる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      act(() => {
        result.current.setZoom(1.5)
      })

      expect(result.current.zoom).toBe(1.5)
    })

    it('handleCropCompleteでcroppedAreaPixelsを更新できる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const croppedArea = { x: 0, y: 0, width: 100, height: 100 }
      const croppedAreaPixels = { x: 0, y: 0, width: 500, height: 500 }

      act(() => {
        result.current.handleCropComplete(croppedArea, croppedAreaPixels)
      })

      expect(result.current.croppedAreaPixels).toEqual(croppedAreaPixels)
    })

    it('resetCropで全ての状態をリセットできる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      // まず状態を変更
      act(() => {
        result.current.setCrop({ x: 50, y: 50 })
        result.current.setZoom(2)
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 500, height: 500 }
        )
      })

      // リセット
      act(() => {
        result.current.resetCrop()
      })

      expect(result.current.crop).toEqual({ x: 0, y: 0 })
      expect(result.current.zoom).toBe(1)
      expect(result.current.croppedAreaPixels).toBeNull()
    })
  })

  describe('handleSave', () => {
    it('croppedAreaPixelsがnullのとき何もしない', async () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      await act(async () => {
        await result.current.handleSave('data:image/png;base64,test', 'test.jpg')
      })

      expect(mockOnCropComplete).not.toHaveBeenCalled()
    })

    it('成功時にonCropCompleteが呼ばれる', async () => {
      const mockImage = { width: 1000, height: 1000 } as HTMLImageElement
      const mockFile = new File(['cropped'], 'cropped.webp', { type: 'image/webp' })

      mockCreateImage.mockResolvedValue(mockImage)
      mockGetCroppedImg.mockResolvedValue(mockFile)

      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      // croppedAreaPixelsを設定
      act(() => {
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 500, height: 500 }
        )
      })

      // handleSaveを実行
      await act(async () => {
        await result.current.handleSave('data:image/png;base64,test', 'test.jpg')
      })

      await waitFor(() => {
        expect(mockOnCropComplete).toHaveBeenCalledWith(mockFile)
      })
    })

    it('処理完了後にisProcessingがfalseに戻る', async () => {
      const mockImage = { width: 1000, height: 1000 } as HTMLImageElement
      const mockFile = new File(['cropped'], 'cropped.webp', { type: 'image/webp' })

      mockCreateImage.mockResolvedValue(mockImage)
      mockGetCroppedImg.mockResolvedValue(mockFile)

      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      // croppedAreaPixelsを設定
      act(() => {
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 500, height: 500 }
        )
      })

      // handleSaveを実行
      await act(async () => {
        await result.current.handleSave('data:image/png;base64,test', 'test.jpg')
      })

      // 処理完了後はisProcessingがfalseになることを確認
      expect(result.current.isProcessing).toBe(false)
    })

    it('エラー発生時もisProcessingがfalseに戻る', async () => {
      mockCreateImage.mockRejectedValue(new Error('Image load failed'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      // croppedAreaPixelsを設定
      act(() => {
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 500, height: 500 }
        )
      })

      // handleSaveを実行
      await act(async () => {
        await result.current.handleSave('data:image/png;base64,test', 'test.jpg')
      })

      // エラー発生後もisProcessingがfalseに戻る
      expect(result.current.isProcessing).toBe(false)

      // エラーログが出力される
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '画像トリミングエラー:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('createImageとgetCroppedImgが正しいパラメータで呼ばれる', async () => {
      const mockImage = { width: 1000, height: 1000 } as HTMLImageElement
      const mockFile = new File(['cropped'], 'cropped.webp', { type: 'image/webp' })

      mockCreateImage.mockResolvedValue(mockImage)
      mockGetCroppedImg.mockResolvedValue(mockFile)

      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const croppedAreaPixels = { x: 100, y: 200, width: 300, height: 400 }

      // croppedAreaPixelsを設定
      act(() => {
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          croppedAreaPixels
        )
      })

      const imageSrc = 'data:image/png;base64,test'
      const fileName = 'test.jpg'

      // handleSaveを実行
      await act(async () => {
        await result.current.handleSave(imageSrc, fileName)
      })

      await waitFor(() => {
        expect(mockCreateImage).toHaveBeenCalledWith(imageSrc)
        expect(mockGetCroppedImg).toHaveBeenCalledWith(mockImage, croppedAreaPixels, fileName)
      })
    })
  })

  describe('handleCancel', () => {
    it('onCancelが呼ばれる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      act(() => {
        result.current.handleCancel()
      })

      expect(mockOnCancel).toHaveBeenCalledTimes(1)
    })

    it('複数回呼んでも毎回onCancelが呼ばれる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      act(() => {
        result.current.handleCancel()
        result.current.handleCancel()
        result.current.handleCancel()
      })

      expect(mockOnCancel).toHaveBeenCalledTimes(3)
    })
  })

  describe('コールバックの安定性', () => {
    it('handleCropCompleteは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const firstCallback = result.current.handleCropComplete

      rerender()

      expect(result.current.handleCropComplete).toBe(firstCallback)
    })

    it('handleSaveはcroppedAreaPixels変更時に新しい参照になる', () => {
      const { result } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const firstCallback = result.current.handleSave

      act(() => {
        result.current.handleCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 500, height: 500 }
        )
      })

      // croppedAreaPixelsが変わったので新しい参照になる
      expect(result.current.handleSave).not.toBe(firstCallback)
    })

    it('handleCancelは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const firstCallback = result.current.handleCancel

      rerender()

      expect(result.current.handleCancel).toBe(firstCallback)
    })

    it('resetCropは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        useImageCrop({
          onCropComplete: mockOnCropComplete,
          onCancel: mockOnCancel,
        })
      )

      const firstCallback = result.current.resetCrop

      rerender()

      expect(result.current.resetCrop).toBe(firstCallback)
    })
  })
})
