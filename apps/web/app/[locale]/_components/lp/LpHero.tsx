import Image from "next/image";
import { Link } from "@/i18n/navigation";

interface LpHeroProps {
  t: {
    ghostText: string;
    h1Line1: string;
    h1Line2: string;
    h1Line3Blue: string;
    h1Line3Suffix: string;
    lead: string;
    ctaSignup: string;
    ctaLogin: string;
    appStoreLabel: string;
    googlePlayLabel: string;
    comingSoon: string;
    deviceCaption: string;
    downloadOn: string;
  };
}

/**
 * LP v4.2 ヒーローセクション (Server Component)
 *
 * 2カラム非対称レイアウト: コピー (1.08fr) / デバイスモック (0.92fr)
 * ゴーストタイポ「SWIMHUB」背面に配置。
 */
export default function LpHero({ t }: LpHeroProps) {
  return (
    <section
      id="top"
      style={{
        position: "relative",
        maxWidth: 1340,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.08fr) minmax(0, 0.92fr)",
        gap: "clamp(36px, 5vw, 76px)",
        alignItems: "center",
        padding: "clamp(48px, 7vh, 92px) var(--lp-pad-x) clamp(48px, 7vh, 84px)",
      }}
      className="lp-hero"
    >
      {/* 背面ゴーストタイポ */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "4%",
          left: "-1%",
          zIndex: 0,
          pointerEvents: "none",
          fontFamily: "var(--font-poiret-one, cursive)",
          fontSize: "clamp(110px, 16vw, 250px)",
          lineHeight: 1,
          color: "rgba(11,20,36,0.04)",
          whiteSpace: "nowrap",
          letterSpacing: "0.08em",
          userSelect: "none",
        }}
        data-plx-x="-0.06"
      >
        {t.ghostText}
      </span>

      {/* コピー側 */}
      <div style={{ position: "relative", zIndex: 1 }} className="lp-hero-copy rv">
        {/* deco-label + orn */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-start" }}>
          <span style={{ color: "var(--lp-royal)", fontSize: 10, lineHeight: 1 }}>◆</span>
          <span
            style={{
              fontFamily: "var(--font-josefin-sans, sans-serif)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.5em",
              textTransform: "uppercase",
              color: "var(--lp-royal)",
            }}
          >
            Records for Life
          </span>
        </div>

        {/* h1 */}
        <h1
          style={{
            margin: "30px 0 0",
            fontWeight: 900,
            fontSize: "clamp(34px, 3.9vw, 58px)",
            lineHeight: 1.38,
            letterSpacing: "0.1em",
            fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
          }}
        >
          <span style={{ display: "block", overflow: "hidden" }}>
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>{t.h1Line1}</span>
          </span>
          <span style={{ display: "block", overflow: "hidden" }}>
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>{t.h1Line2}</span>
          </span>
          <span style={{ display: "block", overflow: "hidden" }}>
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--lp-royal)" }}>{t.h1Line3Blue}</span>
              {t.h1Line3Suffix}
            </span>
          </span>
        </h1>

        {/* 段差罫線 */}
        <div
          aria-hidden="true"
          style={{
            width: 120,
            height: 1,
            background: "var(--lp-line-strong)",
            boxShadow: "0 4px 0 var(--lp-line)",
            marginTop: 28,
          }}
        />

        {/* リード文 */}
        <p
          style={{
            margin: "24px 0 0",
            maxWidth: 520,
            fontSize: "clamp(13.5px, 1.1vw, 15px)",
            color: "var(--lp-dim)",
            lineHeight: 2.1,
            letterSpacing: "0.06em",
          }}
        >
          {t.lead}
        </p>

        {/* CTA ボタン */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 36 }} className="lp-hero-ctas lp-hero-ctas-wrap">
          <Link
            href="/signup"
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 36px 16px",
              fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "0.22em",
              lineHeight: 1,
              background: "var(--lp-navy)",
              color: "var(--lp-w-white)",
              border: "1px solid var(--lp-navy)",
              outline: "1px solid var(--lp-line)",
              outlineOffset: 4,
              textDecoration: "none",
              transition: "background 0.2s ease, border-color 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            {t.ctaSignup}
          </Link>
          <Link
            href="/login"
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 36px 16px",
              fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "0.22em",
              lineHeight: 1,
              background: "var(--lp-panel)",
              color: "var(--lp-royal)",
              border: "1px solid var(--lp-royal)",
              outline: "1px solid var(--lp-ice)",
              outlineOffset: 4,
              textDecoration: "none",
              transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            {t.ctaLogin}
          </Link>
        </div>

        {/* ストアバッジ (Apple / Google 公式バッジ) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 24 }} className="lp-hero-badges">
          <a
            href="https://apps.apple.com/us/app/swimhub/id6756808731/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.appStoreLabel}
            style={{ display: "inline-flex", textDecoration: "none" }}
          >
            {/* Apple 公式バッジ (日本語版「App Storeからダウンロード」) */}
            <img
              src="/badges/app-store-ja.svg"
              alt={t.appStoreLabel}
              width={123}
              height={45}
              style={{ height: 48, width: "auto", display: "block" }}
            />
          </a>
          {/* Google Play は未リリースのため Coming soon (リンクなし・グレースケール) */}
          <span
            aria-label={`${t.googlePlayLabel} — ${t.comingSoon}`}
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              opacity: 0.5,
              cursor: "not-allowed",
            }}
          >
            {/* Google 公式バッジ (日本語版「Google Play で手に入れよう」)。未リリースのためグレースケール */}
            <img
              src="/badges/google-play-ja.png"
              alt={t.googlePlayLabel}
              width={166}
              height={64}
              style={{ height: 48, width: "auto", display: "block", filter: "grayscale(1)" }}
            />
            <span
              style={{
                fontFamily: "var(--font-josefin-sans, sans-serif)",
                fontSize: 8.5,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "var(--lp-dim2)",
              }}
            >
              {t.comingSoon}
            </span>
          </span>
        </div>
      </div>

      {/* デバイスモック側 */}
      <div style={{ position: "relative", zIndex: 1 }} className="lp-hero-visual rv">
        {/* デバイスモック */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1.04 / 1" }}>
          {/* ラップトップ */}
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: "88%",
              zIndex: 1,
              filter: "drop-shadow(0 36px 50px rgba(11,20,36,0.28))",
            }}
          >
            <div
              style={{
                background: "#0d1726",
                border: "1px solid var(--lp-line-strong)",
                borderRadius: "16px 16px 0 0",
                padding: "12px 12px 14px",
              }}
            >
              <i
                style={{
                  display: "block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#42536d",
                  margin: "0 auto 9px",
                }}
              />
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 10",
                  background: "#fff",
                  overflow: "hidden",
                  borderRadius: 4,
                }}
              >
                <Image
                  src="/screenshots/members-desktop.png"
                  alt="SwimHub ダッシュボード画面（PC）"
                  width={1472}
                  height={820}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left" }}
                  priority
                />
              </div>
            </div>
            <div
              style={{
                position: "relative",
                left: "-4%",
                width: "108%",
                height: 15,
                background: "#cfd7e2",
                border: "1px solid var(--lp-line-strong)",
                borderTop: "none",
                borderRadius: "2px 2px 14px 14px",
              }}
            />
          </div>

          {/* スマホ */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "35%",
              zIndex: 2,
              background: "#0d1726",
              border: "1px solid var(--lp-line-strong)",
              borderRadius: 30,
              padding: 9,
              boxShadow: "0 30px 60px -28px rgba(11,20,36,0.55)",
            }}
            className="lp-dev-phone"
          >
            <i
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                width: "34%",
                height: 14,
                background: "#0d1726",
                borderRadius: 9,
                zIndex: 3,
              }}
            />
            <div
              style={{
                width: "100%",
                aspectRatio: "9 / 19",
                background: "#fff",
                overflow: "hidden",
                borderRadius: 22,
              }}
            >
              <Image
                src="/screenshots/dashboard-mobile.png"
                alt="SwimHub ダッシュボード画面（スマホ）"
                width={300}
                height={568}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
              />
            </div>
          </div>
        </div>

        {/* キャプション */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 18,
            alignItems: "center",
            marginTop: 16,
            fontFamily: "var(--font-josefin-sans, sans-serif)",
            fontSize: 10,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: "var(--lp-dim2)",
          }}
        >
          <span>SwimHub App</span>
          <span style={{ color: "var(--lp-royal)", fontSize: 8 }}>◆</span>
          <span>PC &amp; Mobile</span>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .lp-hero {
            grid-template-columns: 1fr !important;
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .lp-dev-phone {
            animation: lpDecoFloat 7s ease-in-out infinite;
            animation-delay: -1.5s;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-dev-phone { animation: none !important; }
        }
        @media (max-width: 560px) {
          .lp-hero { padding-top: 36px !important; }

          /* デバイスモック非表示 */
          .lp-hero-visual { display: none !important; }

          /* 修正1: コンテナの幅制約 — flex 子が nowrap テキストで幅を膨らませないよう制限。
             min-width:0 は flex 子のサイズ圧縮に必須。 */
          .lp-hero-copy { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
          .lp-hero-badges, .lp-hero-ctas-wrap { width: 100%; min-width: 0; }

          /* 修正2: h1 を折り返し可能に。
             外側 span(reveal 用 overflow:hidden) を visible に戻し、
             内側 span の white-space:nowrap を normal に上書き。
             font-size/letter-spacing は既存値を継続。 */
          .lp-hero h1 { letter-spacing: 0.04em !important; font-size: clamp(24px, 6.6vw, 34px) !important; }
          .lp-hero h1 > span { overflow: visible !important; }
          .lp-hero h1 > span > span { white-space: normal !important; }

          /* 並び順: ストアバッジ(order:1) が上段、CTAボタン(order:2) が下段 */
          .lp-hero-badges { order: 1; margin-top: 20px !important; }
          .lp-hero-ctas-wrap { order: 2; margin-top: 12px !important; }

          /* ストアバッジを2列等幅グリッド */
          .lp-hero-badges {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: center;
          }
          /* バッジ画像をセル幅にフィット */
          .lp-hero-badges a,
          .lp-hero-badges > span { width: 100%; }
          .lp-hero-badges img { width: 100% !important; height: auto !important; }

          /* CTA ボタンを2列等幅グリッド */
          .lp-hero-ctas-wrap {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          /* 修正3: CTA ラベルを折り返し可能に。
             de "Kostenlos registrieren"(22字) は ≈160px セルに nowrap では収まらない。
             white-space:normal + text-align:center で2行折り返しを許可。
             grid の align-items:stretch(既定) により等高を維持。
             色・フォント・ボーダーは inline style 由来のため変更なし。 */
          .lp-hero-ctas-wrap a {
            display: flex !important;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 14px 8px !important;
            white-space: normal !important;
          }
        }
      `}</style>
    </section>
  );
}
