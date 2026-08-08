import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
- swimmers[].times: repCount × setCount の全本分のタイム(秒)の配列。読み取れない場合は null。空欄の列は含めない`;

interface ScanRequest {
  image: string;
  mimeType: "image/jpeg" | "image/png";
}

interface ErrorResponse {
  error: string;
  code: "PARSE_ERROR" | "IMAGE_ERROR" | "API_ERROR" | "AUTH_ERROR";
}

function errorResponse(error: string, code: ErrorResponse["code"], status: number): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * 今日の日付を JST で "YYYY-MM-DD" として返す。
 */
function getTodayJST(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  return jstDate.toISOString().split("T")[0];
}

async function callGeminiApi(apiKey: string, image: string, mimeType: string): Promise<Response> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const payload = {
    contents: [
      {
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
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("認証が必要です", "AUTH_ERROR", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // reserve_user_daily_usage / release_user_daily_usage は service_role 限定
    // (authenticated には EXECUTE 権限を付与していない。C-1 で塞いだ「RPC を
    // 直接連打して daily_tokens_used を自己リセットする」穴が再び開くのを防ぐため)。
    // JWT 検証済みの user.id のみを渡し、クライアント由来の値は一切渡さない。
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse("認証に失敗しました", "AUTH_ERROR", 401);
    }

    // --- 無料枠を原子的に予約する (Gemini 呼び出しの前) ---
    // C-4: 従来は「読み取り(トークンチェック)→Gemini呼び出し(数秒)→加算」という
    // 構造で、読み取りと加算の間に競合窓があった。同一ユーザーが同時に2リクエスト
    // を送ると両方が「まだ枠が残っている」と判定して Gemini を呼べてしまう。
    // reserve_user_daily_usage RPC (service_role 限定) は Premium 判定 (関数内部
    // で user_subscriptions から導出。apps/shared/utils/premium.ts の
    // checkIsPremium() と同一ロジック) と全アプリ横断の使用量加算を
    // pg_advisory_xact_lock で直列化した単一トランザクションで行うため、
    // この競合窓が閉じる。
    const today = getTodayJST();

    const { data: reserveData, error: reserveError } = await supabaseAdmin
      .rpc("reserve_user_daily_usage", {
        p_user_id: user.id,
        p_app: "swimhub",
        p_usage_date: today,
      })
      .single();

    if (reserveError) {
      console.error("reserve_user_daily_usage failed:", reserveError);
      return errorResponse("利用状況の確認に失敗しました。再試行してください", "API_ERROR", 500);
    }

    const reserveResult = reserveData as { allowed: boolean; is_premium: boolean } | null;
    const isPremium = reserveResult?.is_premium ?? false;

    if (!reserveResult?.allowed) {
      return errorResponse(
        "今日の利用回数に達しました。Premiumにアップグレードすると無制限に利用できます",
        "AUTH_ERROR",
        429,
      );
    }

    // 予約成功後のあらゆる離脱経路 (バリデーション失敗・Gemini失敗・パース失敗・
    // 想定外の例外) で、原子的に予約した枠を解放する。scanSucceeded は成功
    // レスポンスを返す直前にのみ true にするため、finally はそれ以外の全ての
    // return / throw で解放を実行する。呼び出しは releaseReservation() 内の
    // released フラグで高々1回に限定する (冪等性)。
    let scanSucceeded = false;
    let released = false;
    const releaseReservation = async () => {
      if (released) return;
      released = true;
      const { error } = await supabaseAdmin.rpc("release_user_daily_usage", {
        p_user_id: user.id,
        p_app: "swimhub",
        p_usage_date: today,
      });
      if (error) {
        console.error("release_user_daily_usage failed:", error);
      }
    };

    try {
      // Parse request body
      let body: ScanRequest;
      try {
        body = await req.json();
      } catch {
        return errorResponse("画像形式はJPEGまたはPNGのみ対応しています", "IMAGE_ERROR", 400);
      }

      // Validate mimeType
      if (!body.mimeType || !["image/jpeg", "image/png"].includes(body.mimeType)) {
        return errorResponse("画像形式はJPEGまたはPNGのみ対応しています", "IMAGE_ERROR", 400);
      }

      // Validate image
      if (!body.image || typeof body.image !== "string") {
        return errorResponse("画像データが必要です", "IMAGE_ERROR", 400);
      }

      // Check base64 size (approximate: base64 is ~4/3 of original)
      const estimatedSize = body.image.length * 0.75;
      if (estimatedSize > 5 * 1024 * 1024) {
        return errorResponse("画像サイズは5MB以下にしてください", "IMAGE_ERROR", 400);
      }

      // Call Gemini API
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        return errorResponse("Gemini APIキーが設定されていません", "API_ERROR", 500);
      }

      let geminiResponse: Response;
      try {
        geminiResponse = await callGeminiApi(apiKey, body.image, body.mimeType);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Timeout on first attempt — retry after delay
          await new Promise((resolve) => setTimeout(resolve, 1000));
          try {
            geminiResponse = await callGeminiApi(apiKey, body.image, body.mimeType);
          } catch (retryErr) {
            const isTimeout = retryErr instanceof DOMException && retryErr.name === "AbortError";
            console.error(`Gemini API ${isTimeout ? "timeout" : "error"} on retry:`, retryErr);
            if (isTimeout) {
              return errorResponse(
                "AI解析がタイムアウトしました。再試行してください",
                "API_ERROR",
                504,
              );
            }
            return errorResponse(
              "AI解析サービスでエラーが発生しました。再試行してください",
              "API_ERROR",
              502,
            );
          }
        } else {
          throw err;
        }
      }

      // Retry once on non-ok response
      if (!geminiResponse.ok) {
        await geminiResponse.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          geminiResponse = await callGeminiApi(apiKey, body.image, body.mimeType);
        } catch (retryErr) {
          const isTimeout = retryErr instanceof DOMException && retryErr.name === "AbortError";
          console.error(`Gemini API ${isTimeout ? "timeout" : "error"} on retry:`, retryErr);
          if (isTimeout) {
            return errorResponse(
              "AI解析がタイムアウトしました。再試行してください",
              "API_ERROR",
              504,
            );
          }
          return errorResponse(
            "AI解析サービスでエラーが発生しました。再試行してください",
            "API_ERROR",
            502,
          );
        }
      }

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", errorText);
        return errorResponse("AI解析サービスでエラーが発生しました", "API_ERROR", 502);
      }

      const geminiData = await geminiResponse.json();

      // Extract text from Gemini response
      const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        return errorResponse(
          "画像を解析できませんでした。鮮明な画像で再試行してください",
          "PARSE_ERROR",
          422,
        );
      }

      // Parse JSON from response
      let scanResult;
      try {
        scanResult = JSON.parse(responseText);
      } catch {
        return errorResponse(
          "解析結果の読み取りに失敗しました。再試行してください",
          "PARSE_ERROR",
          422,
        );
      }

      // Basic structure validation
      if (!scanResult.menu || !Array.isArray(scanResult.swimmers)) {
        return errorResponse("解析結果の形式が不正です。再試行してください", "PARSE_ERROR", 422);
      }

      // OCR が誤読した異常な数値が apps/web/utils/ocrTransform.ts の無制限 .map() に渡ると
      // クライアントを壊すため、水泳ドメインの実態に基づく上限と整数性を検証する。
      // 上限値は swimhub-scanner/apps/shared/validation/scan-result.ts と二重管理。
      // 値を変更する場合は両方を揃えること。
      const { distance, repCount, setCount } = scanResult.menu;
      if (
        !Number.isInteger(distance) || distance < 1 || distance > 4000 ||
        !Number.isInteger(repCount) || repCount < 1 || repCount > 50 ||
        !Number.isInteger(setCount) || setCount < 1 || setCount > 20
      ) {
        return errorResponse("解析結果の形式が不正です。再試行してください", "PARSE_ERROR", 422);
      }

      // スキャン成功時のトークン消費ログ記録（Free ユーザーのみ、監査用）。
      // 使用量そのもの (usage_count/daily_tokens_used) は reserve_user_daily_usage
      // が既に記録済みのため、このログ insert が失敗してもクォータ判定には
      // 影響しない (握りつぶさずログのみ残す)。
      if (!isPremium) {
        const { error: logError } = await supabase.from("token_consumption_log").insert({
          user_id: user.id,
          app: "swimhub",
          token_source: "daily_free",
          action_type: "swimhub_image_analysis",
        });

        if (logError) {
          console.error("token_consumption_log insert failed:", logError);
        }
      }

      scanSucceeded = true;
      return new Response(JSON.stringify(scanResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      if (!scanSucceeded) {
        await releaseReservation();
      }
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse("サーバーエラーが発生しました", "API_ERROR", 500);
  }
});
