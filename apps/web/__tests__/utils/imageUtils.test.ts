import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAspectRatio,
  getCroppedImg,
  getMaxImageSize,
  validateImageFile,
} from '../../utils/imageUtils'

describe('validateImageFile', () => {
  describe('正常系', () => {
    it('有効なJPEGファイルを受け入れる', () => {
      const file = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('有効なPNGファイルを受け入れる', () => {
      const file = new File(['dummy content'], 'test.png', { type: 'image/png' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('有効なWebPファイルを受け入れる', () => {
      const file = new File(['dummy content'], 'test.webp', { type: 'image/webp' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('5MB以下のファイルを受け入れる', () => {
      // 4MBのファイル
      const content = new Array(4 * 1024 * 1024).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('ちょうど5MBのファイルを受け入れる', () => {
      // 5MBのファイル
      const content = new Array(5 * 1024 * 1024).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('異常系', () => {
    it('5MB超のファイルを拒否する', () => {
      // 6MBのファイル
      const content = new Array(6 * 1024 * 1024).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('ファイルサイズは5MB以下にしてください')
    })

    it('未対応の形式（GIF）を拒否する', () => {
      const file = new File(['dummy content'], 'test.gif', { type: 'image/gif' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP形式の画像ファイルを選択してください')
    })

    it('未対応の形式（BMP）を拒否する', () => {
      const file = new File(['dummy content'], 'test.bmp', { type: 'image/bmp' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP形式の画像ファイルを選択してください')
    })

    it('未対応の形式（SVG）を拒否する', () => {
      const file = new File(['dummy content'], 'test.svg', { type: 'image/svg+xml' })
      const result = validateImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP形式の画像ファイルを選択してください')
    })
  })
})

describe('getAspectRatio', () => {
  it('横長画像のアスペクト比を計算できる', () => {
    const aspectRatio = getAspectRatio(1920, 1080)
    expect(aspectRatio).toBeCloseTo(1.7778, 4)
  })

  it('縦長画像のアスペクト比を計算できる', () => {
    const aspectRatio = getAspectRatio(1080, 1920)
    expect(aspectRatio).toBeCloseTo(0.5625, 4)
  })

  it('正方形画像のアスペクト比を計算できる', () => {
    const aspectRatio = getAspectRatio(1000, 1000)
    expect(aspectRatio).toBe(1)
  })

  it('小さい画像でもアスペクト比を計算できる', () => {
    const aspectRatio = getAspectRatio(100, 50)
    expect(aspectRatio).toBe(2)
  })

  it('非常に横長の画像でもアスペクト比を計算できる', () => {
    const aspectRatio = getAspectRatio(3000, 500)
    expect(aspectRatio).toBe(6)
  })
})

describe('getMaxImageSize', () => {
  describe('横長画像', () => {
    it('デフォルトのmaxSize（800）で最大サイズを計算できる', () => {
      const size = getMaxImageSize(1920, 1080)
      
      expect(size.width).toBe(800)
      expect(size.height).toBeCloseTo(450, 0)
    })

    it('カスタムmaxSizeで最大サイズを計算できる', () => {
      const size = getMaxImageSize(1920, 1080, 1000)
      
      expect(size.width).toBe(1000)
      expect(size.height).toBeCloseTo(562.5, 0)
    })

    it('元画像がmaxSizeより小さい場合でも計算できる', () => {
      const size = getMaxImageSize(640, 480)
      
      expect(size.width).toBe(800)
      expect(size.height).toBe(600)
    })
  })

  describe('縦長画像', () => {
    it('デフォルトのmaxSize（800）で最大サイズを計算できる', () => {
      const size = getMaxImageSize(1080, 1920)
      
      expect(size.width).toBeCloseTo(450, 0)
      expect(size.height).toBe(800)
    })

    it('カスタムmaxSizeで最大サイズを計算できる', () => {
      const size = getMaxImageSize(1080, 1920, 1000)
      
      expect(size.width).toBeCloseTo(562.5, 0)
      expect(size.height).toBe(1000)
    })

    it('元画像がmaxSizeより小さい場合でも計算できる', () => {
      const size = getMaxImageSize(480, 640)
      
      expect(size.width).toBe(600)
      expect(size.height).toBe(800)
    })
  })

  describe('正方形画像', () => {
    it('デフォルトのmaxSize（800）で最大サイズを計算できる', () => {
      const size = getMaxImageSize(1000, 1000)
      
      expect(size.width).toBe(800)
      expect(size.height).toBe(800)
    })

    it('カスタムmaxSizeで最大サイズを計算できる', () => {
      const size = getMaxImageSize(1000, 1000, 600)
      
      expect(size.width).toBe(600)
      expect(size.height).toBe(600)
    })
  })
})

describe('getCroppedImg', () => {
  let mockCanvas: {
    width: number
    height: number
    getContext: ReturnType<typeof vi.fn>
    toBlob: ReturnType<typeof vi.fn>
  }
  let mockContext: Partial<CanvasRenderingContext2D>
  let mockImage: HTMLImageElement

  beforeEach(() => {
    vi.clearAllMocks()

    // Canvas contextのモック
    mockContext = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'high',
    }

    // Canvasのモック
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toBlob: vi.fn(),
    }

    // document.createElementのモック
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement
      }
      return document.createElement(tagName)
    })

    // HTMLImageElementのモック
    mockImage = {
      width: 1000,
      height: 1000,
      src: 'test-image.jpg',
    } as HTMLImageElement
  })

  describe('正常系', () => {
    it('トリミングした画像をWebP形式で返す', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 0, y: 0, width: 500, height: 500 }
      const fileName = 'test.jpg'

      const result = await getCroppedImg(mockImage, crop, fileName)

      // Fileオブジェクトが返される
      expect(result).toBeInstanceOf(File)
      expect(result.type).toBe('image/webp')
      expect(result.name).toBe('test.webp')
    })

    it('ファイル名の拡張子がwebpに変換される', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 0, y: 0, width: 500, height: 500 }

      // 様々な拡張子でテスト
      const testCases = [
        { input: 'photo.jpg', expected: 'photo.webp' },
        { input: 'image.png', expected: 'image.webp' },
        { input: 'picture.jpeg', expected: 'picture.webp' },
        { input: 'file.gif', expected: 'file.webp' },
      ]

      for (const { input, expected } of testCases) {
        const result = await getCroppedImg(mockImage, crop, input)
        expect(result.name).toBe(expected)
      }
    })

    it('Canvasに正しいサイズが設定される', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 100, y: 100, width: 600, height: 600 }
      await getCroppedImg(mockImage, crop, 'test.jpg')

      // 出力サイズは150x150に固定
      expect(mockCanvas.width).toBe(150)
      expect(mockCanvas.height).toBe(150)
    })

    it('drawImageが正しいパラメータで呼ばれる', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 100, y: 200, width: 300, height: 400 }
      await getCroppedImg(mockImage, crop, 'test.jpg')

      expect(mockContext.drawImage).toHaveBeenCalledWith(
        mockImage,
        100, // crop.x
        200, // crop.y
        300, // crop.width
        400, // crop.height
        0,   // dest x
        0,   // dest y
        150, // dest width (output size)
        150  // dest height (output size)
      )
    })

    it('画像スムージングが有効化される', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 0, y: 0, width: 500, height: 500 }
      await getCroppedImg(mockImage, crop, 'test.jpg')

      expect(mockContext.imageSmoothingEnabled).toBe(true)
      expect(mockContext.imageSmoothingQuality).toBe('high')
    })

    it('toBlobが正しいパラメータで呼ばれる', async () => {
      const mockBlob = new Blob(['mock image data'], { type: 'image/webp' })
      
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(mockBlob)
      })

      const crop = { x: 0, y: 0, width: 500, height: 500 }
      await getCroppedImg(mockImage, crop, 'test.jpg')

      expect(mockCanvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        'image/webp',
        0.7 // 品質70%
      )
    })
  })

  describe('異常系', () => {
    it('Canvas contextが取得できないときエラーをthrowする', async () => {
      mockCanvas.getContext.mockReturnValue(null)

      const crop = { x: 0, y: 0, width: 500, height: 500 }

      try {
        await getCroppedImg(mockImage, crop, 'test.jpg')
        expect.fail('エラーがthrowされるべき')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Canvas context not available')
      }
    })

    it('toBlobがnullを返すときエラーをthrowする', async () => {
      mockCanvas.toBlob.mockImplementation((callback: BlobCallback) => {
        callback(null)
      })

      const crop = { x: 0, y: 0, width: 500, height: 500 }

      try {
        await getCroppedImg(mockImage, crop, 'test.jpg')
        expect.fail('エラーがthrowされるべき')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Canvas is empty')
      }
    })
  })
})
