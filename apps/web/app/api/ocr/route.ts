import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server-auth'
import { parseOcrText } from '@/utils/ocrParser'

// Cloud Vision APIのインポート（動的インポートでエラー回避）
let vision: typeof import('@google-cloud/vision') | null = null

async function getVisionClient() {
  if (!vision) {
    try {
      vision = await import('@google-cloud/vision')
    } catch (error) {
      console.error('Cloud Vision APIのインポートエラー:', error)
      throw new Error('Cloud Vision APIが利用できません')
    }
  }
  return vision
}

/**
 * OCR APIエンドポイント
 * POST /api/ocr
 * 
 * リクエスト: FormData with image file
 * レスポンス: { menus: Array<{ style, distance, reps, sets, circleTime, times }> }
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    // リクエストボディから画像ファイルを取得
    const formData = await request.formData()
    console.log('FormData keys:', Array.from(formData.keys()))
    
    const file = formData.get('image') as File | null

    if (!file) {
      console.error('画像ファイルが取得できませんでした')
      return NextResponse.json(
        { error: '画像ファイルが指定されていません' },
        { status: 400 }
      )
    }

    console.log(`ファイル情報: name=${file.name}, type=${file.type}, size=${file.size}`)

    // ファイル形式チェック
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'JPEG、PNG形式の画像ファイルを選択してください' },
        { status: 400 }
      )
    }

    // ファイルサイズチェック（5MB以下）
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'ファイルサイズは5MB以下にしてください' },
        { status: 400 }
      )
    }

    // 画像をBufferに変換
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Cloud Vision APIでOCR実行
    const visionModule = await getVisionClient()
    
    // 認証情報の設定
    const clientOptions: any = {}
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // サービスアカウントキーファイルのパスが指定されている場合
      clientOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
    } else if (process.env.GOOGLE_CLOUD_KEY) {
      // サービスアカウントキーのJSONが直接指定されている場合
      try {
        clientOptions.credentials = JSON.parse(process.env.GOOGLE_CLOUD_KEY)
      } catch (error) {
        throw new Error('GOOGLE_CLOUD_KEYの形式が正しくありません')
      }
    }
    
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      clientOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
    }
    
    // 認証情報が設定されていない場合のエラーチェック
    if (!clientOptions.keyFilename && !clientOptions.credentials) {
      throw new Error('Cloud Vision APIの認証情報が設定されていません。GOOGLE_APPLICATION_CREDENTIALSまたはGOOGLE_CLOUD_KEYを設定してください。')
    }
    
    const client = new visionModule.ImageAnnotatorClient(clientOptions)

    // 画像データの検証
    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { error: '画像データが空です' },
        { status: 400 }
      )
    }

    console.log(`画像サイズ: ${buffer.length} bytes, ファイルタイプ: ${file.type}`)

    // Cloud Vision APIのImageオブジェクトを作成
    // Node.jsのCloud Vision APIクライアントでは、直接オブジェクトを渡すことができる
    // Base64エンコードされた文字列を渡す（Cloud Vision APIの推奨方法）
    const image = {
      content: buffer.toString('base64'),
    }

    console.log('Cloud Vision APIにリクエスト送信...')
    console.log(`画像データの型: ${typeof image.content}, 長さ: ${image.content.length}`)
    
    try {
      const [result] = await client.textDetection({ image })
      console.log('Cloud Vision APIからのレスポンス受信')
      
      const detections = result.textAnnotations

      if (!detections || detections.length === 0) {
        return NextResponse.json(
          { error: 'テキストが検出されませんでした' },
          { status: 400 }
        )
      }

      // 全文を取得（最初の要素が全文）
      const fullText = detections[0].description || ''

      if (!fullText || fullText.trim() === '') {
        return NextResponse.json(
          { error: 'テキストが検出されませんでした' },
          { status: 400 }
        )
      }

      // OCRテキストを構造化JSONに変換
      const parsedResult = parseOcrText(fullText)

      return NextResponse.json(parsedResult)
    } catch (visionError: any) {
      console.error('Cloud Vision APIエラー:', visionError)
      console.error('エラー詳細:', JSON.stringify(visionError, null, 2))
      
      // Cloud Vision APIのエラーメッセージを確認
      if (visionError.message && visionError.message.includes('No image present')) {
        // Bufferを直接試す
        console.log('Base64が失敗したため、Bufferを直接試します...')
        const imageBuffer = {
          content: buffer,
        }
        const [result] = await client.textDetection({ image: imageBuffer })
        const detections = result.textAnnotations

        if (!detections || detections.length === 0) {
          return NextResponse.json(
            { error: 'テキストが検出されませんでした' },
            { status: 400 }
          )
        }

        const fullText = detections[0].description || ''
        if (!fullText || fullText.trim() === '') {
          return NextResponse.json(
            { error: 'テキストが検出されませんでした' },
            { status: 400 }
          )
        }

        const parsedResult = parseOcrText(fullText)
        return NextResponse.json(parsedResult)
      }
      
      throw visionError
    }
    const detections = result.textAnnotations

    if (!detections || detections.length === 0) {
      return NextResponse.json(
        { error: 'テキストが検出されませんでした' },
        { status: 400 }
      )
    }

    // 全文を取得（最初の要素が全文）
    const fullText = detections[0].description || ''

    if (!fullText || fullText.trim() === '') {
      return NextResponse.json(
        { error: 'テキストが検出されませんでした' },
        { status: 400 }
      )
    }

    // OCRテキストを構造化JSONに変換
    const parsedResult = parseOcrText(fullText)

    return NextResponse.json(parsedResult)
  } catch (error) {
    console.error('OCR処理エラー:', error)
    
    // エラーメッセージを適切に処理
    if (error instanceof Error) {
      const errorMessage = error.message || ''
      
      // Cloud Vision APIのエラーメッセージを確認
      if (errorMessage.includes('No image present') || errorMessage.includes('INVALID_ARGUMENT')) {
        return NextResponse.json(
          { error: '画像データが正しく送信されていません。画像ファイルを再度選択してください。' },
          { status: 400 }
        )
      }
      
      if (errorMessage.includes('Cloud Vision API') || errorMessage.includes('認証情報')) {
        return NextResponse.json(
          { error: 'Cloud Vision APIの設定に問題があります。環境変数を確認してください。' },
          { status: 500 }
        )
      }
      
      if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('UNAUTHENTICATED')) {
        return NextResponse.json(
          { error: 'Cloud Vision APIの認証に失敗しました。認証情報を確認してください。' },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: errorMessage || 'OCR処理中にエラーが発生しました' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'OCR処理中にエラーが発生しました' },
      { status: 500 }
    )
  }
}

