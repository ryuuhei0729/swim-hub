import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import {
  validatePracticeImageFile,
  canDecodeHeic,
  resetHeicSupportCache,
  PRACTICE_IMAGE_CONFIG,
} from '../../utils/imageUtils'

// navigator.userAgentのモック
let mockUserAgent = ''

// Canvas contextのモック
const mockContext = {
  drawImage: vi.fn(),
  imageSmoothingEnabled: false,
  imageSmoothingQuality: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
  
  Object.defineProperty(window.navigator, 'userAgent', {
    get: () => mockUserAgent,
    configurable: true,
  })
  
  // Canvasのモック（getContextが動作するように）
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext)
  
  // キャッシュをリセット
  resetHeicSupportCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('canDecodeHeic', () => {
  it('Safari on macOSの場合、HEICをサポートと判定する', async () => {
    mockUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    const result = await canDecodeHeic()
    expect(result).toBe(true)
  })

  it('iOSの場合、HEICをサポートと判定する', async () => {
    mockUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    const result = await canDecodeHeic()
    expect(result).toBe(true)
  })

  it('Chrome on Windowsの場合、HEICを非サポートと判定する', async () => {
    mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const result = await canDecodeHeic()
    expect(result).toBe(false)
  })

  it('Firefox on Linuxの場合、HEICを非サポートと判定する', async () => {
    mockUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0'
    const result = await canDecodeHeic()
    expect(result).toBe(false)
  })
})

describe('validatePracticeImageFile', () => {
  describe('正常系', () => {
    it('有効なJPEGファイルを受け入れる', async () => {
      const file = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('有効なPNGファイルを受け入れる', async () => {
      const file = new File(['dummy content'], 'test.png', { type: 'image/png' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('有効なWebPファイルを受け入れる', async () => {
      const file = new File(['dummy content'], 'test.webp', { type: 'image/webp' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('10MB以下のファイルを受け入れる', async () => {
      // 9MBのファイル
      const content = new Array(9 * 1024 * 1024).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('ちょうど10MBのファイルを受け入れる', async () => {
      // 10MBのファイル
      const content = new Array(PRACTICE_IMAGE_CONFIG.MAX_FILE_SIZE).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('HEIC/HEIFサポートチェック', () => {
    it('Safari on macOSでHEICファイル（拡張子）を受け入れる', async () => {
      mockUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      const file = new File(['dummy content'], 'test.heic', { type: 'image/heic' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('Safari on macOSでHEIFファイル（拡張子）を受け入れる', async () => {
      mockUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      const file = new File(['dummy content'], 'test.heif', { type: 'image/heif' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('iOSでHEICファイルを受け入れる', async () => {
      mockUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      const file = new File(['dummy content'], 'IMG_1234.HEIC', { type: 'image/heic' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('Chrome on WindowsでHEICファイル（拡張子）を拒否する', async () => {
      mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const file = new File(['dummy content'], 'test.heic', { type: 'image/heic' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('HEIC形式はこのブラウザでサポートされていません。JPEG、PNG、WebP形式をご利用ください。')
    })

    it('Firefox on LinuxでHEICファイル（拡張子）を拒否する', async () => {
      mockUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0'
      const file = new File(['dummy content'], 'photo.heic', { type: '' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('HEIC形式はこのブラウザでサポートされていません。JPEG、PNG、WebP形式をご利用ください。')
    })

    it('MIMEタイプがimage/heicの場合もチェックされる', async () => {
      mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      // 拡張子はjpgだがMIMEタイプがheic（理論的には起こらないが）
      const file = new File(['dummy content'], 'test.jpg', { type: 'image/heic' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('HEIC形式はこのブラウザでサポートされていません。JPEG、PNG、WebP形式をご利用ください。')
    })
  })

  describe('異常系', () => {
    it('10MB超のファイルを拒否する', async () => {
      // 11MBのファイル
      const content = new Array(11 * 1024 * 1024).fill('a').join('')
      const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('ファイルサイズは10MB以下にしてください')
    })

    it('未対応の形式（GIF）を拒否する', async () => {
      const file = new File(['dummy content'], 'test.gif', { type: 'image/gif' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP、HEIC形式の画像ファイルを選択してください')
    })

    it('未対応の形式（BMP）を拒否する', async () => {
      const file = new File(['dummy content'], 'test.bmp', { type: 'image/bmp' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP、HEIC形式の画像ファイルを選択してください')
    })

    it('未対応の形式（SVG）を拒否する', async () => {
      const file = new File(['dummy content'], 'test.svg', { type: 'image/svg+xml' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP、HEIC形式の画像ファイルを選択してください')
    })

    it('未対応の形式（PDF）を拒否する', async () => {
      const file = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('JPEG、PNG、WebP、HEIC形式の画像ファイルを選択してください')
    })
  })

  describe('エッジケース', () => {
    it('拡張子がない場合、MIMEタイプでチェックする', async () => {
      const file = new File(['dummy content'], 'testfile', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('MIMEタイプが空文字の場合、拡張子でチェックする', async () => {
      const file = new File(['dummy content'], 'test.jpg', { type: '' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('大文字拡張子も正しく処理される', async () => {
      const file = new File(['dummy content'], 'photo.JPG', { type: 'image/jpeg' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('大文字HEIC拡張子も正しく処理される（Safari）', async () => {
      mockUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      const file = new File(['dummy content'], 'IMG_1234.HEIC', { type: '' })
      const result = await validatePracticeImageFile(file)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })
})
