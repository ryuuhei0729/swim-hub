import type { Metadata } from "next";
import React from "react";

import { SITE_URL } from "@/lib/constants";

import "./globals.css";

// next-intl + App Router の推奨パターン:
// root layout は children をそのまま返し、`<html>` `<body>` および Provider 群は
// app/[locale]/layout.tsx で出力する (動的な lang 属性切り替えのため)。
//
// `app/not-found.tsx` (グローバル 404) は root layout に依存できないため、
// 自前で `<html>` `<body>` を出力している点に注意。

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
