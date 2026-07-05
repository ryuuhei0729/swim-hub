import Image from "next/image";

interface LpScannerProps {
  t: {
    label: string;
    h2: string;
    desc1: string;
    desc2: string;
    cta: string;
  };
}

/**
 * LP v4.2 SwimHub Scanner セクション (反転ダークセクション)
 *
 * 背景 --lp-navy / アクセント --lp-ice
 * 2カラム: コピー (1.05fr) / 画像フレーム (1fr)
 * スキャンライン演出は CSS アニメーション (lpScanDeco)。
 */
export default function LpScanner({ t }: LpScannerProps) {
  return (
    <section
      style={{
        background: "var(--lp-navy)",
        color: "var(--lp-w-white)",
        borderTop: "1px solid var(--lp-line)",
        borderBottom: "1px solid var(--lp-line)",
        marginTop: "clamp(40px, 6vh, 64px)",
      }}
      className="lp-scanner dark"
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.05fr 1fr",
          gap: "clamp(40px, 6vw, 96px)",
          alignItems: "center",
          padding: "clamp(72px, 10vh, 120px) var(--lp-pad-x)",
        }}
        className="lp-scanner-in"
      >
        {/* コピー */}
        <div className="rv">
          {/* deco-label (左寄せ orn) */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-start" }}>
            <span
              style={{
                color: "var(--lp-ice)",
                fontSize: 10,
                lineHeight: 1,
              }}
            >
              ◆
            </span>
            <span
              style={{
                fontFamily: "var(--font-josefin-sans, sans-serif)",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.5em",
                textTransform: "uppercase",
                color: "var(--lp-ice)",
              }}
            >
              {t.label}
            </span>
          </div>

          <h2
            style={{
              margin: "20px 0 0",
              fontWeight: 900,
              fontSize: "clamp(24px, 2.6vw, 38px)",
              lineHeight: 1.65,
              letterSpacing: "0.14em",
              fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
              color: "var(--lp-w-white)",
            }}
          >
            {t.h2.split("\n").map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </span>
            ))}
          </h2>

          <p
            style={{
              margin: "18px 0 0",
              maxWidth: 500,
              fontSize: 13.5,
              color: "var(--lp-w-dim)",
              lineHeight: 2.05,
              letterSpacing: "0.04em",
            }}
          >
            {t.desc1}
          </p>
          <p
            style={{
              margin: "18px 0 0",
              maxWidth: 500,
              fontSize: 13.5,
              color: "var(--lp-w-dim)",
              lineHeight: 2.05,
              letterSpacing: "0.04em",
            }}
          >
            {t.desc2}
          </p>

          {/* CTA */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 38 }}>
            <a
              href="https://scanner.swim-hub.app"
              target="_blank"
              rel="noopener noreferrer"
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
                background: "var(--lp-royal)",
                color: "#fff",
                border: "1px solid var(--lp-royal)",
                outline: "1px solid var(--lp-w-line)",
                outlineOffset: 4,
                textDecoration: "none",
                transition: "background 0.2s ease, border-color 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              {t.cta}
            </a>
          </div>

          {/* deco-band */}
          <div
            aria-hidden="true"
            style={{
              height: 9,
              marginTop: 44,
              maxWidth: 380,
              background: "repeating-linear-gradient(135deg, var(--lp-w-line-strong) 0 1px, transparent 1px 9px)",
            }}
          />
        </div>

        {/* 画像フレーム */}
        <div className="rv">
          <div
            style={{
              position: "relative",
              background: "var(--lp-navy2)",
              border: "1px solid var(--lp-w-line-strong)",
              outline: "1px solid var(--lp-w-line)",
              outlineOffset: 6,
              padding: 14,
            }}
            className="lp-scanner-frame"
          >
            {/* 四隅ダイヤ (ice 色) */}
            {(["tl", "tr", "bl", "br"] as const).map((pos) => (
              <i
                key={pos}
                style={{
                  position: "absolute",
                  width: 8,
                  height: 8,
                  background: "var(--lp-ice)",
                  transform: "rotate(45deg)",
                  ...(pos === "tl" ? { top: -4, left: -4 } :
                    pos === "tr" ? { top: -4, right: -4 } :
                    pos === "bl" ? { bottom: -4, left: -4 } :
                    { bottom: -4, right: -4 }),
                }}
                className={`lp-cd ${pos}`}
              />
            ))}
            <Image
              src="/screenshots/lp-scanner.png"
              alt="SwimHub Scanner のスクリーンショット"
              width={600}
              height={450}
              style={{ width: "100%" }}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              textAlign: "center",
              fontFamily: "var(--font-josefin-sans, sans-serif)",
              fontSize: 9.5,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: "var(--lp-w-dim2)",
            }}
          >
            Scanner — 手書き解析
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .lp-scanner-in { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .lp-scanner-frame::after {
            content: "";
            position: absolute;
            left: 14px;
            right: 14px;
            top: 12%;
            height: 2px;
            background: var(--lp-ice);
            opacity: 0.85;
            animation: lpScanDeco 3.6s ease-in-out infinite;
          }
        }
      `}</style>
    </section>
  );
}
