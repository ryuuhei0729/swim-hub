/**
 * 画像処理ユーティリティ関数
 */

/**
 * ファイルを画像として読み込む
 */
export const createImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

/**
 * トリミングした画像をCanvasで生成
 * WebP形式で出力し、ファイルサイズを最適化
 */
export const getCroppedImg = (
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  fileName: string
): Promise<File> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Canvas context not available')
  }

  // 出力サイズ（小さめの正方形）- プロフィール画像用
  const outputSize = 150
  canvas.width = outputSize
  canvas.height = outputSize

  // 画像のスムージングを有効化（縮小時の品質向上）
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // トリミング範囲をCanvasに描画
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize
  )

  return new Promise((resolve, reject) => {
    // WebP形式で出力（JPEGより約25-35%小さいファイルサイズ）
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'))
          return
        }
        
        // ファイル名の拡張子をwebpに変更（拡張子がない場合は追加）
        const webpFileName = /\.\w+$/.test(fileName)
          ? fileName.replace(/\.\w+$/, '.webp')
          : `${fileName}.webp`
        
        // Fileオブジェクトに変換
        const file = new File([blob], webpFileName, {
          type: 'image/webp',
          lastModified: Date.now(),
        })
        resolve(file)
      },
      'image/webp',
      0.7 // 品質70%（WebPは低品質でも高画質を維持）
    )
  })
}

/**
 * 画像ファイルのサイズをチェック
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  // ファイルサイズチェック（5MB以下）
  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    return { valid: false, error: 'ファイルサイズは5MB以下にしてください' }
  }

  // ファイル形式チェック（JPEG・PNG・WebPのみ）
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'JPEG、PNG、WebP形式の画像ファイルを選択してください' }
  }

  return { valid: true }
}

/**
 * 画像のアスペクト比を計算
 */
export const getAspectRatio = (width: number, height: number): number => {
  return width / height
}

/**
 * 画像の最大サイズを計算（表示用）
 */
export const getMaxImageSize = (imageWidth: number, imageHeight: number, maxSize: number = 800): { width: number; height: number } => {
  const aspectRatio = getAspectRatio(imageWidth, imageHeight)
  
  if (imageWidth > imageHeight) {
    return {
      width: maxSize,
      height: maxSize / aspectRatio
    }
  } else {
    return {
      width: maxSize * aspectRatio,
      height: maxSize
    }
  }
}

// =============================================================================
// 練習画像用のユーティリティ関数
// =============================================================================

/**
 * 練習画像用の定数
 */
export const PRACTICE_IMAGE_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGES: 3, // 最大3枚
  ORIGINAL_MAX_SIZE: 1600, // オリジナル画像の最大幅/高さ
  THUMBNAIL_SIZE: 400, // サムネイルのサイズ
  ORIGINAL_QUALITY: 0.75, // オリジナル画像の品質（75%）
  THUMBNAIL_QUALITY: 0.70, // サムネイルの品質（70%）
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
} as const

/**
 * ブラウザがHEIC/HEIF形式をデコードできるかチェック
 * @returns Promise<boolean> - デコード可能な場合true
 */
let heicSupportCache: boolean | null = null

// テスト用：キャッシュをリセットする関数
export const resetHeicSupportCache = () => {
  heicSupportCache = null
}

export const canDecodeHeic = async (): Promise<boolean> => {
  // キャッシュがあればそれを返す
  if (heicSupportCache !== null) {
    return heicSupportCache
  }

  try {
    // 1x1ピクセルの透明なWebP画像のbase64（フォールバック用）
    // HEIC/HEIFのテスト用データURLを作成するのは難しいため、
    // 実際にImageオブジェクトが'image/heic'をサポートしているかを
    // より実践的な方法でチェックする
    
    // Canvas APIを使ってブラウザのデコード機能をチェック
    // HTMLImageElementがHEICをサポートしているか確認
    const testCanvas = document.createElement('canvas')
    const testCtx = testCanvas.getContext('2d')
    
    if (!testCtx) {
      heicSupportCache = false
      return false
    }

    // Image.decode()をサポートしているブラウザでは、より確実なチェックができる
    // しかし、実際にはHEICファイルを使わないとテストできないため、
    // ブラウザのユーザーエージェントやWebP/HEIC変換ライブラリの有無で判定する
    
    // Safari on iOS/macOS は HEIC をネイティブサポート
    // Chromeなど他のブラウザは通常サポートしていない
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isMacOS = /Macintosh/.test(navigator.userAgent)
    
    // SafariまたはiOS/macOSの場合のみHEICをサポートと判定
    heicSupportCache = isIOS || (isSafari && isMacOS)
    return heicSupportCache
  } catch {
    heicSupportCache = false
    return false
  }
}

/**
 * HEIC/HEIFファイルかどうかを判定
 */
const isHeicOrHeif = (file: File): boolean => {
  const fileExtension = file.name.toLowerCase().split('.').pop()
  const isHeicByExtension = ['heic', 'heif'].includes(fileExtension || '')
  const isHeicByType = file.type === 'image/heic' || file.type === 'image/heif'
  
  return isHeicByExtension || isHeicByType
}

/**
 * 練習画像ファイルのバリデーション（非同期版）
 */
export const validatePracticeImageFile = async (file: File): Promise<{ valid: boolean; error?: string }> => {
  // ファイルサイズチェック（10MB以下）
  if (file.size > PRACTICE_IMAGE_CONFIG.MAX_FILE_SIZE) {
    return { valid: false, error: 'ファイルサイズは10MB以下にしてください' }
  }

  // ファイル形式チェック
  // 注意: HEICファイルはブラウザによってはMIMEタイプが正しく判定されないことがある
  const fileExtension = file.name.toLowerCase().split('.').pop()
  const isValidByExtension = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fileExtension || '')
  const allowedTypes: readonly string[] = PRACTICE_IMAGE_CONFIG.ALLOWED_TYPES
  // 空のMIMEタイプは拡張子が有効な場合のみ許可
  const isValidByType = allowedTypes.includes(file.type) || (file.type === '' && isValidByExtension)
  
  if (!isValidByExtension && !isValidByType) {
    return { valid: false, error: 'JPEG、PNG、WebP、HEIC形式の画像ファイルを選択してください' }
  }

  // HEIC/HEIF形式の場合、ブラウザサポートをチェック
  if (isHeicOrHeif(file)) {
    const canDecode = await canDecodeHeic()
    if (!canDecode) {
      return { 
        valid: false, 
        error: 'HEIC形式はこのブラウザでサポートされていません。JPEG、PNG、WebP形式をご利用ください。' 
      }
    }
  }

  return { valid: true }
}

/**
 * 画像をリサイズしてWebP形式に変換
 * @param image HTMLImageElement
 * @param maxSize 最大幅/高さ（長辺）
 * @param quality 品質（0-1）
 * @param fileName 出力ファイル名
 */
export const resizeImageToWebP = (
  image: HTMLImageElement,
  maxSize: number,
  quality: number,
  fileName: string
): Promise<File> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Canvas context not available')
  }

  // アスペクト比を維持してリサイズ
  let { width, height } = image
  
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((height * maxSize) / width)
      width = maxSize
    } else {
      width = Math.round((width * maxSize) / height)
      height = maxSize
    }
  }

  canvas.width = width
  canvas.height = height

  // 画像のスムージングを有効化（縮小時の品質向上）
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 画像を描画
  ctx.drawImage(image, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'))
          return
        }
        
        // ファイル名の拡張子をwebpに変更（拡張子がない場合は追加）
        const webpFileName = /\.\w+$/.test(fileName)
          ? fileName.replace(/\.\w+$/, '.webp')
          : `${fileName}.webp`
        
        const file = new File([blob], webpFileName, {
          type: 'image/webp',
          lastModified: Date.now(),
        })
        resolve(file)
      },
      'image/webp',
      quality
    )
  })
}

/**
 * FileからHTMLImageElementを作成
 */
export const createImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const url = e.target?.result as string
      if (!url) {
        reject(new Error('Failed to read file'))
        return
      }
      
      createImage(url)
        .then(resolve)
        .catch(reject)
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * 練習画像を処理（オリジナル＋サムネイル生成）
 * @param file 入力ファイル
 * @returns オリジナル画像とサムネイル画像
 */
export const processPracticeImage = async (
  file: File
): Promise<{ original: File; thumbnail: File }> => {
  // バリデーション（非同期）
  const validation = await validatePracticeImageFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // 画像を読み込み
  const image = await createImageFromFile(file)

  // UUIDを生成
  const uuid = crypto.randomUUID()

  // オリジナル画像を生成（最大1600px）
  const original = await resizeImageToWebP(
    image,
    PRACTICE_IMAGE_CONFIG.ORIGINAL_MAX_SIZE,
    PRACTICE_IMAGE_CONFIG.ORIGINAL_QUALITY,
    `original_${uuid}.webp`
  )

  // サムネイル画像を生成（400px）
  const thumbnail = await resizeImageToWebP(
    image,
    PRACTICE_IMAGE_CONFIG.THUMBNAIL_SIZE,
    PRACTICE_IMAGE_CONFIG.THUMBNAIL_QUALITY,
    `thumb_${uuid}.webp`
  )

  return { original, thumbnail }
}

/**
 * 複数の練習画像を処理
 * @param files 入力ファイル配列
 * @returns 処理結果の配列
 */
export const processPracticeImages = async (
  files: File[]
): Promise<Array<{ original: File; thumbnail: File; originalFileName: string }>> => {
  // 最大枚数チェック
  if (files.length > PRACTICE_IMAGE_CONFIG.MAX_IMAGES) {
    throw new Error(`画像は最大${PRACTICE_IMAGE_CONFIG.MAX_IMAGES}枚までです`)
  }

  const results = await Promise.all(
    files.map(async (file) => {
      const { original, thumbnail } = await processPracticeImage(file)
      return {
        original,
        thumbnail,
        originalFileName: file.name
      }
    })
  )

  return results
}
