import Image from "next/image";

interface LpServicesProps {
  t: {
    label: string;
    h2: string;
    lead: string;
    timer: {
      name: string;
      tagline: string;
      desc: string;
      cta: string;
    };
    scanner: {
      name: string;
      tagline: string;
      desc: string;
      cta: string;
    };
  };
}

/**
 * LP v4.2 サービス一覧セクション (白band)
 *
 * SWIMHUB TIMER / SWIMHUB SCANNER の2カラムカード。
 * 各カード: アイコン左上 + 右にアプリ名(Chakra Petch) + タグライン → 説明 → CTA
 * Timer = 青 (--lp-royal)、Scanner = 緑 (#1FA463)
 * hover で枠が royal 色に変化。
 */

// サービスごとのアクセント色
const ACCENT_TIMER = "var(--lp-royal)";
const ACCENT_SCANNER = "#1FA463";

export default function LpServices({ t }: LpServicesProps) {
  const services = [
    {
      href: "https://timer.swim-hub.app",
      icon: "/timer-icon.png",
      name: t.timer.name,
      tagline: t.timer.tagline,
      desc: t.timer.desc,
      cta: t.timer.cta,
      accent: ACCENT_TIMER,
    },
    {
      href: "https://scanner.swim-hub.app",
      icon: "/scanner-icon.png",
      name: t.scanner.name,
      tagline: t.scanner.tagline,
      desc: t.scanner.desc,
      cta: t.scanner.cta,
      accent: ACCENT_SCANNER,
    },
  ];

  return (
    <section
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "clamp(40px, 6vh, 64px) var(--lp-pad-x) clamp(72px, 10vh, 112px)",
      }}
    >
      {/* ヘッド */}
      <div style={{ textAlign: "center" }} className="rv">
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
          style={{
            margin: "20px 0 0",
            fontWeight: 900,
            fontSize: "clamp(20px, 2.2vw, 30px)",
            letterSpacing: "0.24em",
            fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
          }}
        >
          {t.h2}
        </h2>
        <p style={{ margin: "10px 0 0", color: "var(--lp-dim)", fontSize: 13, letterSpacing: "0.06em" }}>
          {t.lead}
        </p>
      </div>

      {/* サービスカード */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 26,
          marginTop: 44,
        }}
        className="rv lp-svc-grid"
      >
        {services.map((svc) => (
          <a
            key={svc.href}
            href={svc.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              background: "var(--lp-bg)",
              border: "1px solid var(--lp-line-strong)",
              outline: "1px solid var(--lp-line)",
              outlineOffset: 5,
              padding: "clamp(28px, 3vw, 38px)",
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.2s ease",
            }}
            className="lp-svc"
          >
            {/* カードヘッダー: アイコン左 + アプリ名・タグライン右 */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <Image
                src={svc.icon}
                alt={svc.name}
                width={48}
                height={48}
                style={{ borderRadius: 10, flexShrink: 0 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                {/* アプリ名: Chakra Petch (nav/footer の SwimHub ブランドと同フォント) */}
                <span
                  style={{
                    fontFamily: "var(--font-chakra-petch, sans-serif)",
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: "0.02em",
                    color: "var(--lp-ink)",
                    wordBreak: "break-word",
                  }}
                >
                  {svc.name}
                </span>
                {/* タグライン: アクセント色 */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: svc.accent,
                    lineHeight: 1.4,
                  }}
                >
                  {svc.tagline}
                </span>
              </div>
            </div>

            {/* 説明文 */}
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--lp-dim)",
                flex: 1,
                lineHeight: 1.95,
                letterSpacing: "0.04em",
              }}
            >
              {svc.desc}
            </p>

            {/* CTA (cta 文字列に「→」が含まれる: "試してみる →") */}
            <span
              style={{
                fontFamily: "var(--font-josefin-sans, sans-serif)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                color: svc.accent,
              }}
            >
              {svc.cta}
            </span>
          </a>
        ))}
      </div>

      <style>{`
        .lp-svc:hover { border-color: var(--lp-royal) !important; }
        @media (max-width: 960px) {
          .lp-svc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
