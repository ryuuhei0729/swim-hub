'use client'

import 'react-device-frameset/styles/marvel-devices.min.css'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'

const DeviceFrameset = dynamic(
  () => import('react-device-frameset').then((m) => m.DeviceFrameset),
  { ssr: false }
)

const screenshotPaths = {
  mobile: '/screenshots/dashboard-mobile.png',
  desktop: '/screenshots/members-desktop.png',
}

export default function DeviceMockup() {
  const [imageErrors, setImageErrors] = useState<{ mobile: boolean; desktop: boolean }>({
    mobile: false,
    desktop: false,
  })
  const [windowWidth, setWindowWidth] = useState<number>(0)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth)
    }

    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize, { passive: true })
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // スマホ端末のスケールを計算
  const mobileScale = (() => {
    if (windowWidth === 0) return 0.80
    if (windowWidth >= 1920) return 0.80
    if (windowWidth <= 768) return 0.40
    const ratio = (windowWidth - 768) / (1920 - 768)
    return 0.40 + (ratio * 0.40)
  })()

  // PC端末のスケールを計算
  const desktopScale = (() => {
    if (windowWidth === 0) return 0.60
    if (windowWidth >= 1920) return 0.60
    if (windowWidth <= 1024) return 0.35
    const ratio = (windowWidth - 1024) / (1920 - 1024)
    return 0.35 + (ratio * 0.25)
  })()

  return (
    <div className="relative flex items-end justify-center animate-fade-in order-1 lg:order-2" style={{ animationDelay: '0.1s' }}>
      {/* スマホモック（iPhone）- スマホサイズでは非表示 */}
      <div
        className="hidden sm:block absolute z-10"
        style={{
          left: 'calc(50% - 10px)',
          transform: `translateX(50%) translateY(5%) scale(${mobileScale})`,
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
                sizes="(max-width: 640px) 200px, (max-width: 768px) 250px, (max-width: 1024px) 300px, 350px"
                quality={100}
                unoptimized
                onError={() => {
                  setImageErrors((prev) => ({ ...prev, mobile: true }))
                }}
              />
            )}
          </div>
        </DeviceFrameset>
      </div>

      {/* PCモック（MacBook Pro） */}
      <div
        className="hidden md:block relative z-20"
        style={{ transform: `scale(${desktopScale}) translateY(35%)` }}
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
                sizes="(max-width: 768px) 350px, (max-width: 1024px) 400px, 450px"
                quality={100}
                unoptimized
                onError={() => {
                  setImageErrors((prev) => ({ ...prev, desktop: true }))
                }}
              />
            )}
          </div>
        </DeviceFrameset>
      </div>
    </div>
  )
}
