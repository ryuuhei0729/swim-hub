"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import {
  resolveGalleryImages,
  type ImageBucket,
  type ResolvedGalleryImage,
} from "@/utils/imageUpload";

const NO_IMAGES: ResolvedGalleryImage[] = [];

/**
 * private バケットの画像パスから、表示用の署名付きURLを解決する。
 *
 * 署名付きURLは失効するため、キャッシュ (端末に保存される) にはパスだけを持たせ、
 * URL は表示のたびにここで取り直す。パスが無くなったとき・取得に失敗したときは
 * 画像を空にする (パスが別のものに変わったときは、新しい URL が届いた時点で差し替える)。
 */
export function useGalleryImages(
  bucket: ImageBucket,
  paths: string[] | null | undefined,
): ResolvedGalleryImage[] {
  const { getAccessToken } = useAuth();
  const [images, setImages] = useState<ResolvedGalleryImage[]>(NO_IMAGES);
  // 配列の参照ではなく中身で比べる (キャッシュの取り直しで参照だけ変わっても取り直さない)
  const pathsKey = (paths ?? []).join("\n");

  useEffect(() => {
    const targetPaths = pathsKey ? pathsKey.split("\n") : [];
    if (targetPaths.length === 0) {
      setImages(NO_IMAGES);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (cancelled) return;
        if (!accessToken) {
          // トークンが取得できない場合、古い private 画像を表示し続けないよう空にする
          setImages(NO_IMAGES);
          return;
        }
        const resolved = await resolveGalleryImages(bucket, targetPaths, accessToken);
        if (!cancelled) setImages(resolved);
      } catch (err) {
        console.warn("画像の取得に失敗:", err);
        if (!cancelled) setImages(NO_IMAGES);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bucket, pathsKey, getAccessToken]);

  return images;
}
