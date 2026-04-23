"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { supportsWebCodecs } from "@/lib/cropVideo";

const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false });

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VideoEditorProps {
  file: File;
  onComplete: (editedFile: File, thumbnail: Blob) => void;
  onCancel: () => void;
}

// ---- Dual-handle trim bar ----

interface TrimBarProps {
  duration: number;
  startTime: number;
  endTime: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onRelease: () => void;
}

function formatSec(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${s}秒`;
}

function TrimBar({ duration, startTime, endTime, onChange, onSeek, onRelease }: TrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const getTime = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent, handle: "start" | "end") => {
    e.preventDefault();
    // capture current values at drag start
    const capturedEnd = endTime;
    const capturedStart = startTime;

    const move = (clientX: number) => {
      const t = getTime(clientX);
      if (handle === "start") {
        const next = Math.min(t, capturedEnd - 0.5);
        onChange(Math.max(0, next), capturedEnd);
        onSeek(Math.max(0, next));
      } else {
        const next = Math.max(t, capturedStart + 0.5);
        onChange(capturedStart, Math.min(duration, next));
        onSeek(Math.min(duration, next));
      }
    };

    const onMouseMove = (ev: MouseEvent) => move(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      move(ev.touches[0].clientX);
    };
    const onUp = () => {
      onRelease();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onUp);
    };

    if ("touches" in e.nativeEvent) {
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onUp);
    } else {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onUp);
    }
  };

  const startPct = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPct = duration > 0 ? (endTime / duration) * 100 : 100;
  const clipDuration = endTime - startTime;

  return (
    <div className="space-y-2">
      {/* Time labels */}
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-gray-700">トリミング</span>
        <span className="text-xs text-gray-500">
          {formatSec(startTime)} – {formatSec(endTime)}
          <span className="ml-2 text-blue-600 font-medium">({formatSec(clipDuration)})</span>
        </span>
      </div>

      {/* Track — コンテナ高さ = ハンドル高さ → 上下はみ出しゼロ */}
      <div className="relative h-8 select-none cursor-default" ref={trackRef}>
        {/* Gray background — (32-12)/2=10px inset で垂直中央 */}
        <div className="absolute inset-y-[10px] inset-x-0 bg-gray-300 rounded-full" />
        {/* Dimmed left of start */}
        <div
          className="absolute inset-y-[10px] left-0 bg-gray-400/50 rounded-l-full"
          style={{ width: `${startPct}%` }}
        />
        {/* Active selection — (32-20)/2=6px inset */}
        <div
          className="absolute inset-y-[6px] bg-blue-500"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        {/* Dimmed right of end */}
        <div
          className="absolute inset-y-[10px] right-0 bg-gray-400/50 rounded-r-full"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Start handle — inset-y-0 でコンテナ高さに完全一致、はみ出しなし */}
        <div
          className="absolute inset-y-0 w-4 bg-blue-600 rounded-sm cursor-ew-resize shadow-md flex flex-col items-center justify-center gap-0.5 z-10"
          style={{ left: `${startPct}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => startDrag(e, "start")}
          onTouchStart={(e) => startDrag(e, "start")}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-px h-2 bg-white/80" />
          ))}
        </div>

        {/* End handle */}
        <div
          className="absolute inset-y-0 w-4 bg-blue-600 rounded-sm cursor-ew-resize shadow-md flex flex-col items-center justify-center gap-0.5 z-10"
          style={{ left: `${endPct}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => startDrag(e, "end")}
          onTouchStart={(e) => startDrag(e, "end")}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-px h-2 bg-white/80" />
          ))}
        </div>
      </div>

      {/* Tick labels */}
      <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
        <span>0秒</span>
        <span>{formatSec(duration / 2)}</span>
        <span>{formatSec(duration)}</span>
      </div>
    </div>
  );
}

// ---- Main VideoEditor ----

export default function VideoEditor({ file, onComplete, onCancel }: VideoEditorProps) {
  // Hidden video — used only for duration metadata & thumbnail generation
  const videoRef = useRef<HTMLVideoElement>(null);
  // Wrapper around Cropper — lets us reach its internal <video> for seeking
  const cropContainerRef = useRef<HTMLDivElement>(null);
  // Stable ref so playFromStart always reads the latest startTime
  const startTimeRef = useRef(0);
  // ffmpeg instance — pre-loaded on mount
  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);

  const [objectUrl, setObjectUrl] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const webCodecsAvailable = useMemo(() => supportsWebCodecs(), []);
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);
  const playIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Pre-load ffmpeg.wasm on mount so "Apply" is instant
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFfmpegStatus("loading");
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const ff = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ff.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        if (!cancelled) {
          ffmpegRef.current = ff;
          setFfmpegStatus("ready");
        }
      } catch {
        if (!cancelled) setFfmpegStatus("idle"); // fallback: load on apply
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setEndTime(dur);
    }
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // Seek Cropper's internal video and freeze the frame
  const seekCropperVideo = useCallback((time: number) => {
    const v = cropContainerRef.current?.querySelector("video");
    if (v) {
      v.pause();
      v.currentTime = time;
      setIsPlaying(false);
    }
  }, []);

  // Resume playing from startTime after drag release
  const playFromStart = useCallback(() => {
    const v = cropContainerRef.current?.querySelector("video");
    if (v) {
      v.currentTime = startTimeRef.current;
      void v.play();
      setIsPlaying(true);
    }
  }, []);

  // Play/pause toggle — クロップエリアのクリック/タップで呼び出す
  const togglePlayPause = useCallback(() => {
    const v = cropContainerRef.current?.querySelector("video");
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
    // アイコンを 700ms 表示
    setShowPlayIcon(true);
    if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
    playIconTimerRef.current = setTimeout(() => setShowPlayIcon(false), 700);
  }, []);

  // クリックとパン操作を区別するため、押下位置を記録
  const handleCropPointerDown = useCallback((x: number, y: number) => {
    clickStartRef.current = { x, y };
  }, []);

  // 移動量が 8px 未満なら "クリック" と判定して再生/停止
  const handleCropPointerUp = useCallback((x: number, y: number) => {
    if (!clickStartRef.current) return;
    const dx = Math.abs(x - clickStartRef.current.x);
    const dy = Math.abs(y - clickStartRef.current.y);
    if (dx < 8 && dy < 8) togglePlayPause();
    clickStartRef.current = null;
  }, [togglePlayPause]);

  const generateThumbnail = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video =
        cropContainerRef.current?.querySelector("video") ?? videoRef.current;
      if (!video) {
        reject(new Error("video要素が見つかりません"));
        return;
      }
      const draw = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas context取得失敗")); return; }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error("サムネイル生成失敗")); },
          "image/jpeg",
          0.85,
        );
      };
      if (Math.abs(video.currentTime - startTimeRef.current) < 0.1) {
        draw();
      } else {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); draw(); };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = startTimeRef.current;
      }
    });
  }, []);

  const handleApply = useCallback(async () => {
    setIsProcessing(true);
    setProgress(0);
    try {
      const videoEl =
        cropContainerRef.current?.querySelector("video") ?? videoRef.current;

      const needsCrop = croppedAreaPixels && zoom > 1.05;
      const needsScale = videoEl && videoEl.videoHeight > 1080;
      const needsReencode = needsCrop || needsScale;
      const needsTrim = startTime > 0.05 || endTime < duration - 0.05;

      if (needsReencode) {
        // --- WebCodecs (Chrome/Edge) or MediaRecorder (Safari) ---
        const { cropVideo } = await import("@/lib/cropVideo");

        // クロップ領域: react-easy-crop が返す裁ピクセル座標、またはフル動画
        let cx = 0, cy = 0, cw = videoEl?.videoWidth ?? 1920, ch = videoEl?.videoHeight ?? 1080;
        if (needsCrop && croppedAreaPixels) {
          cx = Math.round(croppedAreaPixels.x);
          cy = Math.round(croppedAreaPixels.y);
          cw = Math.round(croppedAreaPixels.width);
          ch = Math.round(croppedAreaPixels.height);
        }

        // 出力サイズ: 1080p 以下にダウンスケール（アスペクト比維持）
        let outW = cw, outH = ch;
        if (outH > 1080) {
          outW = Math.round((cw / ch) * 1080);
          outH = 1080;
        }
        // 偶数に揃える（H.264 要件）
        outW = outW % 2 === 0 ? outW : outW - 1;
        outH = outH % 2 === 0 ? outH : outH - 1;

        const editedFile = await cropVideo(
          file,
          {
            cropX: cx,
            cropY: cy,
            cropWidth: cw,
            cropHeight: ch,
            outputWidth: outW,
            outputHeight: outH,
            startTime: needsTrim ? startTime : 0,
            endTime: needsTrim ? endTime : duration,
          },
          (p) => setProgress(p),
        );

        const thumbnail = await generateThumbnail();
        onComplete(editedFile, thumbnail);
        return;
      }

      // --- ffmpeg.wasm: trim-only (stream copy, near-instant) or no-op ---
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

      let ffmpeg = ffmpegRef.current;
      if (!ffmpeg) {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        ffmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        ffmpegRef.current = ffmpeg;
      }

      ffmpeg.on("progress", ({ progress: p }) => setProgress(Math.round(p * 100)));

      const inputData = await fetchFile(file);
      await ffmpeg.writeFile("input.mp4", inputData);

      const args: string[] = [];
      if (needsTrim) {
        // Stream copy — no re-encoding, nearly instant
        args.push("-ss", startTime.toFixed(2));
        args.push("-i", "input.mp4");
        args.push("-to", (endTime - startTime).toFixed(2));
        args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
      } else {
        // Nothing to do — copy as-is
        args.push("-i", "input.mp4", "-c", "copy");
      }

      args.push("output.mp4");
      await ffmpeg.exec(args);

      const outputData = await ffmpeg.readFile("output.mp4");
      const outputBlob = new Blob([outputData as unknown as BlobPart], { type: "video/mp4" });
      const editedFile = new File([outputBlob], "edited_video.mp4", { type: "video/mp4" });

      const thumbnail = await generateThumbnail();
      onComplete(editedFile, thumbnail);
    } catch (err) {
      console.error("動画変換エラー:", err);
      alert("動画の変換中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  }, [file, startTime, endTime, duration, croppedAreaPixels, zoom, generateThumbnail, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-medium text-gray-900">動画を編集</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Hidden video — metadata only */}
          {objectUrl && (
            <video
              ref={videoRef}
              src={objectUrl}
              className="hidden"
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
            />
          )}

          {/* Crop preview — クリック/タップで再生・一時停止 */}
          {objectUrl && (
            <div
              ref={cropContainerRef}
              className="relative h-64 bg-gray-900 rounded-lg overflow-hidden cursor-pointer"
              onMouseDown={(e) => handleCropPointerDown(e.clientX, e.clientY)}
              onMouseUp={(e) => handleCropPointerUp(e.clientX, e.clientY)}
              onTouchStart={(e) => {
                const t = e.touches[0];
                handleCropPointerDown(t.clientX, t.clientY);
              }}
              onTouchEnd={(e) => {
                const t = e.changedTouches[0];
                handleCropPointerUp(t.clientX, t.clientY);
              }}
            >
              <Cropper
                video={objectUrl}
                crop={crop}
                zoom={zoom}
                rotation={0}
                aspect={16 / 9}
                minZoom={1}
                maxZoom={3}
                cropShape="rect"
                zoomSpeed={1}
                keyboardStep={1}
                restrictPosition={true}
                style={{}}
                classes={{}}
                mediaProps={{}}
                cropperProps={{}}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />

              {/* 再生/一時停止アイコン — トグル後 700ms 表示 */}
              {showPlayIcon && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 rounded-full p-4 transition-opacity">
                    {isPlaying ? (
                      // Pause icon
                      <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      // Play icon
                      <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Zoom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ズーム: {zoom.toFixed(1)}x
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Dual-handle trim bar */}
          {duration > 0 && (
            <TrimBar
              duration={duration}
              startTime={startTime}
              endTime={endTime}
              onChange={(s, e) => { setStartTime(s); setEndTime(e); }}
              onSeek={seekCropperVideo}
              onRelease={playFromStart}
            />
          )}

          {/* Progress bar */}
          {isProcessing && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
          {/* 処理エンジン状態 */}
          <span className="text-xs text-gray-400">
            {webCodecsAvailable
              ? "✓ ハードウェア変換対応"
              : ffmpegStatus === "loading"
                ? "動画変換エンジンを読み込み中..."
                : ffmpegStatus === "ready"
                  ? "✓ 準備完了"
                  : null}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing ? `変換中... ${Math.round(progress)}%` : "適用してアップロード"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
