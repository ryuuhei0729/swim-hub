import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_PROMPT = `あなたは水泳のタイム記録表を読み取るアシスタントです。
手書きの記録表の画像から、以下の情報をJSON形式で抽出してください。

## 重要: 全てのタイムを読み取ること
- 記録表のヘッダーに番号付きの列（1, 2, 3, ... 18, 19, 20 など）がある場合、数字が書かれている列は全て読み取ってください
- 例えば「3s x 6」と書かれている場合、3セット×6本=合計18本分のタイムが記録されています。18本全てを読み取ってください
- 途中で切らず、各選手の行の最後の記録まで全て抽出してください
- 空欄のセル（数字が書かれていない）は無視してください（timesに含めない）
- 赤文字・青文字・黒文字の区別なく、全ての数字を読み取ってください

## 数字の変換ルール
- 3桁の数字（例: 364）は秒+コンマ秒に変換する（364 → 36.4）
- 4桁の数字（例: 1054）は分:秒.コンマ秒に変換する（1054 → 65.4、つまり1分05秒4）
- タイムは秒単位の数値で返す（例: 36.4, 65.4）
- 読み取れない数字がある場合は null とする

## その他のルール
- 種目の略称: Fr=自由形/クロール, Br=平泳ぎ, Ba=背泳ぎ, Fly=バタフライ, IM=個人メドレー
- 欄外のメタ情報（日付、場所、担当、セット説明）も識別する
- 名前が読み取れない場合は空文字とする
- セット平均やまとめの行は無視する（個別タイムのみ抽出）
- 記録表の各行は1人の選手に対応する

## 出力形式
以下のJSON形式のみを出力してください。JSON以外のテキストは含めないでください。

{
  "menu": {
    "distance": 50,
    "repCount": 6,
    "setCount": 3,
    "circle": 90,
    "description": "3s x 6 x 50m 1'30 ゴールセット"
  },
  "swimmers": [
    {
      "no": 1,
      "name": "",
      "style": "Br",
      "times": [36.4, 36.9, 37.4, 37.8, 37.5, 37.2, 37.5, 37.0, 36.7, 36.8, 37.6, 37.8, 37.5, 38.7, 37.8, 36.8, null, null]
    }
  ]
}

フィールド説明:
- menu.distance: 1本の距離(m)
- menu.repCount: 1セットあたりの本数
- menu.setCount: セット数
- menu.circle: サークルタイム(秒)、読み取れなければ null
- menu.description: セットの説明文（読み取れる範囲で）
- swimmers[].no: 選手番号（記録表の行番号）
- swimmers[].name: 選手名（読み取れない場合は空文字）
- swimmers[].style: 種目 (Fr/Br/Ba/Fly/IM)、判別できなければ "Fr"
- swimmers[].times: repCount × setCount の全本分のタイム(秒)の配列。読み取れない場合は null。空欄の列は含めない`

interface ScanRequest {
  image: string
  mimeType: 'image/jpeg' | 'image/png'
}

interface ErrorResponse {
  error: string
  code: 'PARSE_ERROR' | 'IMAGE_ERROR' | 'API_ERROR' | 'AUTH_ERROR'
}

function errorResponse(error: string, code: ErrorResponse['code'], status: number): Response {
  return new Response(
    JSON.stringify({ error, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function callGeminiApi(apiKey: string, image: string, mimeType: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

  const payload = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType,
            data: image,
          },
        },
        {
          text: GEMINI_PROMPT,
        },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  }

  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('認証が必要です', 'AUTH_ERROR', 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('認証に失敗しました', 'AUTH_ERROR', 401)
    }

    // Parse request body
    const body: ScanRequest = await req.json()

    // Validate mimeType
    if (!body.mimeType || !['image/jpeg', 'image/png'].includes(body.mimeType)) {
      return errorResponse('画像形式はJPEGまたはPNGのみ対応しています', 'IMAGE_ERROR', 400)
    }

    // Validate image
    if (!body.image || typeof body.image !== 'string') {
      return errorResponse('画像データが必要です', 'IMAGE_ERROR', 400)
    }

    // Check base64 size (approximate: base64 is ~4/3 of original)
    const estimatedSize = body.image.length * 0.75
    if (estimatedSize > 5 * 1024 * 1024) {
      return errorResponse('画像サイズは5MB以下にしてください', 'IMAGE_ERROR', 400)
    }

    // Call Gemini API
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return errorResponse('Gemini APIキーが設定されていません', 'API_ERROR', 500)
    }

    let geminiResponse = await callGeminiApi(apiKey, body.image, body.mimeType)

    // Retry once on failure
    if (!geminiResponse.ok) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      geminiResponse = await callGeminiApi(apiKey, body.image, body.mimeType)
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', errorText)
      return errorResponse('AI解析サービスでエラーが発生しました', 'API_ERROR', 502)
    }

    const geminiData = await geminiResponse.json()

    // Extract text from Gemini response
    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!responseText) {
      return errorResponse('画像を解析できませんでした。鮮明な画像で再試行してください', 'PARSE_ERROR', 422)
    }

    // Parse JSON from response
    let scanResult
    try {
      scanResult = JSON.parse(responseText)
    } catch {
      return errorResponse('解析結果の読み取りに失敗しました。再試行してください', 'PARSE_ERROR', 422)
    }

    // Basic structure validation
    if (!scanResult.menu || !Array.isArray(scanResult.swimmers)) {
      return errorResponse('解析結果の形式が不正です。再試行してください', 'PARSE_ERROR', 422)
    }

    return new Response(
      JSON.stringify(scanResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return errorResponse('サーバーエラーが発生しました', 'API_ERROR', 500)
  }
})
