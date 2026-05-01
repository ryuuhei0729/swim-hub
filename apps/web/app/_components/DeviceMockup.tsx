"use client";

import "react-device-frameset/styles/marvel-devices.min.css";
import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";

const DeviceFrameset = dynamic(
  () => import("react-device-frameset").then((m) => m.DeviceFrameset),
  { ssr: false },
);

const screenshotPaths = {
  mobile: "/screenshots/dashboard-mobile.png",
  desktop: "/screenshots/members-desktop.png",
};

// 固定キャンバス設定
// MacBook(960×600) を scale(0.6) → 576×360px @ bottom-left
// iPhone X(375×812) を scale(0.8) → 300×650px @ top-right
// 水平オーバーラップ: 576 - 400 = 176px
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 720;

export default function DeviceMockup() {
  const [imageErrors, setImageErrors] = useState<{ mobile: boolean; desktop: boolean }>({
    mobile: false,
    desktop: false,
  });
  const [windowWidth, setWindowWidth] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWindowWidth(window.innerWidth);
    }

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 両デバイスを同じ比率でスケール (1920px基準)
  // → 重なり具合・縦横比をすべての画面サイズでキープ
  const containerScale = (() => {
    if (windowWidth === 0) return 1.0;
    if (windowWidth >= 1920) return 1.0;
    if (windowWidth <= 768) return 0.45;
    const ratio = (windowWidth - 768) / (1920 - 768);
    return 0.45 + ratio * 0.55;
  })();

  return (
    <div
      className="animate-fade-in order-1 lg:order-2 hidden md:block"
      style={{
        width: CANVAS_WIDTH * containerScale,
        height: CANVAS_HEIGHT * containerScale,
        position: "relative",
      }}
    >
      {/* 固定キャンバス: このdivをscaleすることで両デバイスが比例縮小 */}
      <div
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${containerScale})`,
          transformOrigin: "top left",
        }}
      >
        {/* スマホモック（iPhone X）: キャンバス右上に固定 */}
        <div
          className="hidden md:block"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            transform: "scale(0.8)",
            transformOrigin: "top right",
            zIndex: 10,
          }}
        >
          <DeviceFrameset device="iPhone X" color="black">
            <div className="w-full h-full relative">
              {imageErrors.mobile ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-white/40 text-xs p-2 text-center">
                  ダッシュボード画面
                  <br />
                  （画像準備中）
                </div>
              ) : (
                <Image
                  src={screenshotPaths.mobile}
                  alt="SwimHub ダッシュボード画面（スマホ）"
                  fill
                  className="object-contain"
                  sizes="350px"
                  quality={100}
                  unoptimized
                  onError={() => {
                    setImageErrors((prev) => ({ ...prev, mobile: true }));
                  }}
                />
              )}
            </div>
          </DeviceFrameset>
        </div>

        {/* PCモック（MacBook Pro）: キャンバス左下に固定 */}
        <div
          className="hidden md:block"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            transform: "scale(0.6)",
            transformOrigin: "bottom left",
            zIndex: 20,
          }}
        >
          <DeviceFrameset device="MacBook Pro" color="black">
            <div className="w-full h-full relative">
              {imageErrors.desktop ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-white/40 text-xs p-2 text-center">
                  チームメンバー画面
                  <br />
                  （画像準備中）
                </div>
              ) : (
                <Image
                  src={screenshotPaths.desktop}
                  alt="SwimHub チームメンバー画面（PC）"
                  fill
                  className="object-contain"
                  sizes="500px"
                  quality={100}
                  unoptimized
                  onError={() => {
                    setImageErrors((prev) => ({ ...prev, desktop: true }));
                  }}
                />
              )}
            </div>
          </DeviceFrameset>
        </div>
      </div>
    </div>
  );
}
