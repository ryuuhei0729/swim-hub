"use client";

// =============================================================================
// WebCodecs / MediaRecorder による動画クロップ処理
// Chrome/Edge: requestVideoFrameCallback + VideoEncoder + mp4-muxer (ハードウェア加速)
// Safari/Firefox: canvas.captureStream() + MediaRecorder (フォールバック)
// 注意: 音声トラックはストリップされる（将来的に対応予定）
// =============================================================================

export interface CropVideoOptions {
  /** クロップ領域（元動画のピクセル座標） */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  /** 出力サイズ（スケールダウン済み） */
  outputWidth: number;
  outputHeight: number;
  /** トリム範囲（秒） */
  startTime: number;
  endTime: number;
}

/** WebCodecs API が利用可能か判定 */
export function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype
  );
}

// --------------------------------------------------------------------------
// 解像度に応じた AVC コーデック文字列を返す
// Level 3.0: max 414,720 px  (≤ ~720×576)
// Level 3.1: max 921,600 px  (≤ 1280×720)
// Level 4.0: max 2,097,152 px (≤ 1920×1080)
// --------------------------------------------------------------------------
function getAvcCodec(width: number, height: number): string {
  const pixels = width * height;
  if (pixels <= 414_720) return "avc1.42001e"; // Baseline 3.0
  if (pixels <= 921_600) return "avc1.42001f"; // Baseline 3.1
  return "avc1.640028"; // High Profile 4.0（1080p まで対応）
}

// --------------------------------------------------------------------------
// WebCodecs path（Chrome / Edge — ハードウェアアクセラレーション）
// --------------------------------------------------------------------------

export async function cropWithWebCodecs(
  file: File,
  options: CropVideoOptions,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const { cropX, cropY, cropWidth, cropHeight, outputWidth, outputHeight, startTime, endTime } =
    options;
  const duration = endTime - startTime;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("動画の読み込みに失敗しました")),
      { once: true },
    );
  });

  // mp4-muxer は動的インポート（クライアント側のみ）
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: outputWidth,
      height: outputHeight,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset", // 最初のフレームが0でなくても自動オフセット
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? {}),
    error: (e) => {
      throw e;
    },
  });

  encoder.configure({
    codec: getAvcCodec(outputWidth, outputHeight), // 解像度に応じたレベルを自動選択
    width: outputWidth,
    height: outputHeight,
    bitrate: 4_000_000, // 4 Mbps
    framerate: 30,
  });

  // OffscreenCanvas は colorSpace を返せないケースがあるため通常の Canvas を使用
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context の取得に失敗しました");

  let frameIndex = 0;
  let done = false; // resolve 後の二重コール防止

  await new Promise<void>((resolve, reject) => {
    // requestVideoFrameCallback の型は TypeScript に含まれない場合があるため any キャスト
    type VFC = (now: DOMHighResTimeStamp, meta: { presentedFrames: number }) => void;
    const rvfc = (video as unknown as { requestVideoFrameCallback: (cb: VFC) => void })
      .requestVideoFrameCallback.bind(video);

    const handleFrame: VFC = (_now, _meta) => {
      if (done) return; // encoder が close 済みなら何もしない
      if (video.currentTime >= endTime - 0.03) {
        done = true;
        resolve();
        return;
      }

      // クロップ + スケールをオフスクリーンキャンバスに描画
      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      const timestamp = Math.round((video.currentTime - startTime) * 1_000_000); // マイクロ秒
      const frame = new VideoFrame(canvas, { timestamp });
      encoder.encode(frame, { keyFrame: frameIndex % 60 === 0 });
      frame.close();

      frameIndex++;
      onProgress?.(Math.min(94, ((video.currentTime - startTime) / duration) * 100));
      rvfc(handleFrame);
    };

    video.addEventListener("error", () => reject(new Error("動画再生エラー")), { once: true });

    const onSeeked = () => {
      rvfc(handleFrame);
      video.play().catch(reject);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = startTime;
  });

  video.pause();
  URL.revokeObjectURL(url);

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  onProgress?.(100);

  const outputBlob = new Blob([target.buffer], { type: "video/mp4" });
  return new File([outputBlob], "edited_video.mp4", { type: "video/mp4" });
}

// --------------------------------------------------------------------------
// MediaRecorder path（Safari / Firefox フォールバック）
// --------------------------------------------------------------------------

export async function cropWithMediaRecorder(
  file: File,
  options: CropVideoOptions,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const { cropX, cropY, cropWidth, cropHeight, outputWidth, outputHeight, startTime, endTime } =
    options;
  const duration = endTime - startTime;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("動画の読み込みに失敗しました")),
      { once: true },
    );
  });

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context の取得に失敗しました");

  const stream = canvas.captureStream(30);

  // Safari は video/mp4 をサポートしている場合がある
  const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
    ? "video/mp4;codecs=avc1"
    : MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : "video/webm;codecs=vp8";

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let rafId = 0;
  const drawFrame = () => {
    if (video.currentTime >= endTime) {
      recorder.stop();
      return;
    }
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
    onProgress?.(Math.min(94, ((video.currentTime - startTime) / duration) * 100));
    rafId = requestAnimationFrame(drawFrame);
  };

  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => reject(new Error("録画エラーが発生しました"));
    video.addEventListener("error", () => reject(new Error("動画再生エラー")), { once: true });

    const onSeeked = () => {
      recorder.start(100); // 100ms ごとにチャンクを取得
      rafId = requestAnimationFrame(drawFrame);
      video.play().catch(reject);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = startTime;
  });

  URL.revokeObjectURL(url);
  onProgress?.(100);

  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const finalMimeType = mimeType.split(";")[0];
  return new File([outputBlob], `edited_video.${ext}`, { type: finalMimeType });
}

// --------------------------------------------------------------------------
// エントリーポイント — WebCodecs か MediaRecorder を自動選択
// --------------------------------------------------------------------------

export async function cropVideo(
  file: File,
  options: CropVideoOptions,
  onProgress?: (percent: number) => void,
): Promise<File> {
  if (supportsWebCodecs()) {
    return cropWithWebCodecs(file, options, onProgress);
  }
  return cropWithMediaRecorder(file, options, onProgress);
}
