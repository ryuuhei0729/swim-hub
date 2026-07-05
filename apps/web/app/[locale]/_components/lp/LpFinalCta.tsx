import { Link } from "@/i18n/navigation";

interface LpFinalCtaProps {
  t: {
    label: string;
    h2: string;
    desc: string;
    signup: string;
    login: string;
    appStoreLabel: string;
    googlePlayLabel: string;
    downloadOn: string;
    comingSoon: string;
  };
}

/**
 * LP v4.2 最終 CTA セクション
 *
 * 中央寄せ / max-width 920px
 */
export default function LpFinalCta({ t }: LpFinalCtaProps) {
  return (
    <section style={{ borderTop: "1px solid var(--lp-line)" }}>
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          textAlign: "center",
          padding: "clamp(80px, 12vh, 140px) var(--lp-pad-x)",
        }}
        className="rv"
      >
        {/* .orn */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <span
            style={{
              height: 1,
              width: 64,
              background: "var(--lp-line-strong)",
              boxShadow: "0 4px 0 var(--lp-line)",
              display: "block",
            }}
          />
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
            {t.label}
          </span>
          <span style={{ color: "var(--lp-royal)", fontSize: 10, lineHeight: 1 }}>◆</span>
          <span
            style={{
              height: 1,
              width: 64,
              background: "var(--lp-line-strong)",
              boxShadow: "0 4px 0 var(--lp-line)",
              display: "block",
            }}
          />
        </div>

        <h2
          className="lp-final-h2"
          style={{
            margin: "26px 0 0",
            fontWeight: 900,
            fontSize: "clamp(28px, 3.6vw, 52px)",
            lineHeight: 1.5,
            letterSpacing: "0.2em",
            fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
          }}
        >
          {t.h2}
        </h2>

        <p
          style={{
            margin: "24px auto 0",
            maxWidth: 580,
            fontSize: 13.5,
            color: "var(--lp-dim)",
            lineHeight: 2.05,
            letterSpacing: "0.05em",
          }}
        >
          {t.desc}
        </p>

        {/* CTA ボタン */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 18,
            marginTop: 44,
          }}
          className="lp-final-ctas"
        >
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
            {t.signup}
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
              background: "transparent",
              color: "var(--lp-ink)",
              border: "1px solid var(--lp-line-strong)",
              outline: "1px solid var(--lp-line)",
              outlineOffset: 4,
              textDecoration: "none",
              transition: "border-color 0.2s ease, color 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            {t.login}
          </Link>
        </div>

        {/* ストアチップ */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "stretch",
            justifyContent: "center",
            marginTop: 32,
          }}
          className="lp-final-badges"
        >
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
              style={{ height: 45, width: "auto", display: "block" }}
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
              style={{ height: 64, width: "auto", display: "block", filter: "grayscale(1)" }}
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

        {/* ≤560px: CTA + バッジを2×2グリッドに (ヒーローと同様の手法) */}
        <style>{`
          @media (max-width: 560px) {
            /* h2 フォントサイズをモバイル用に縮小 */
            .lp-final-h2 {
              font-size: clamp(22px, 5.6vw, 28px) !important;
              letter-spacing: 0.12em !important;
            }
            /* CTA ボタン2列等幅グリッド */
            .lp-final-ctas {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 12px !important;
              margin-top: 32px !important;
              min-width: 0;
            }
            /* de/en 長ラベル (例: "Kostenlos registrieren") を2行折り返し可能にする */
            .lp-final-ctas a {
              white-space: normal !important;
              text-align: center;
              padding: 14px 8px !important;
              word-break: break-word;
            }
            /* バッジ2列等幅グリッド */
            .lp-final-badges {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 12px !important;
              align-items: center;
              margin-top: 24px !important;
              min-width: 0;
            }
            .lp-final-badges a,
            .lp-final-badges > span {
              width: 100%;
              min-width: 0;
              justify-content: center;
            }
            .lp-final-badges img {
              width: 100% !important;
              height: auto !important;
            }
          }
        `}</style>

        {/* deco-band */}
        <div
          aria-hidden="true"
          style={{
            height: 9,
            maxWidth: 460,
            margin: "56px auto 0",
            background: "repeating-linear-gradient(135deg, var(--lp-line-strong) 0 1px, transparent 1px 9px)",
          }}
        />
      </div>
    </section>
  );
}
