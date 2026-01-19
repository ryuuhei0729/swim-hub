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
        
        // ファイル名の拡張子をwebpに変更
        const webpFileName = fileName.replace(/\.\w+$/, '.webp')
        
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

  // ファイル形式チェック（JPEG・PNGのみ）
  const allowedTypes = ['image/jpeg', 'image/png']
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'JPEG、PNG形式の画像ファイルを選択してください' }
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
