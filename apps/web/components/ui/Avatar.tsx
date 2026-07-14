"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { getSignedImageUrl } from "@/lib/image-url";

interface AvatarProps {
  /** プロフィール画像のバケット内相対パス（"{userId}/{fileName}"）。旧データはフルURLの場合もある */
  avatarUrl?: string | null;
  userName: string;
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-24 w-24 text-3xl",
  xl: "h-32 w-32 text-4xl",
  xxl: "h-40 w-40 text-5xl",
};

export default function Avatar({ avatarUrl, userName, size = "md", className = "" }: AvatarProps) {
  const t = useTranslations("mypage.avatarUpload");
  const sizeClass = sizeClasses[size];
  const initials = userName.charAt(0) || "?";
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  // profile-images は private バケットのため、パスから署名付きURLを取得して表示する
  useEffect(() => {
    let cancelled = false;
    if (!avatarUrl) {
      setResolvedUrl(null);
      return;
    }
    getSignedImageUrl("profile-images", avatarUrl).then((url) => {
      if (!cancelled) setResolvedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  return (
    <div
      className={`${sizeClass} ${className} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
        resolvedUrl ? "bg-gray-100" : "bg-blue-500"
      }`}
    >
      {resolvedUrl ? (
        <Image
          src={resolvedUrl}
          alt={t("profileImageAlt")}
          width={
            size === "sm" ? 32 : size === "md" ? 40 : size === "lg" ? 96 : size === "xl" ? 128 : 160
          }
          height={
            size === "sm" ? 32 : size === "md" ? 40 : size === "lg" ? 96 : size === "xl" ? 128 : 160
          }
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          className={`font-bold text-white ${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : size === "lg" ? "text-3xl" : size === "xl" ? "text-4xl" : "text-5xl"}`}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
