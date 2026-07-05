interface LpPricingProps {
  t: {
    label: string;
    h2: string;
    lead: string;
    detailLink: string;
    free: {
      name: string;
      price: string;
      note: string;
      items: string[];
      cta: string;
    };
    premium: {
      name: string;
      price: string;
      badge: string;
      annualNote: string;
      items: string[];
      cta: string;
    };
  };
}

function CornerDiamonds({ color = "var(--lp-royal)" }: { color?: string }) {
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map((pos) => (
        <i
          key={pos}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            background: color,
            transform: "rotate(45deg)",
            ...(pos === "tl" ? { top: -4, left: -4 } :
              pos === "tr" ? { top: -4, right: -4 } :
              pos === "bl" ? { bottom: -4, left: -4 } :
              { bottom: -4, right: -4 }),
          }}
          className={`lp-cd ${pos}`}
        />
      ))}
    </>
  );
}

/**
 * LP v4.2 料金セクション (白band .k)
 *
 * Free / Premium の2カラムプランカード。
 * Premium は navy 反転。
 */
export default function LpPricing({ t }: LpPricingProps) {
  return (
    <section
      id="pricing"
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "clamp(72px, 10vh, 120px) var(--lp-pad-x) clamp(56px, 8vh, 88px)",
      }}
    >
      {/* ヘッド */}
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }} className="rv">
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
          style={{
            margin: "22px 0 0",
            fontWeight: 900,
            fontSize: "clamp(24px, 2.6vw, 38px)",
            letterSpacing: "0.24em",
            fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
          }}
        >
          {t.h2}
        </h2>
        <p style={{ margin: "12px 0 0", color: "var(--lp-dim)", fontSize: 13.5, letterSpacing: "0.06em" }}>
          {t.lead}
        </p>
      </div>

      {/* プランカード */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 26,
          marginTop: 56,
        }}
        className="rv lp-plans"
      >
        {/* Free プラン */}
        <article
          style={{
            position: "relative",
            background: "var(--lp-bg)",
            padding: "clamp(30px, 3.4vw, 46px)",
            border: "1px solid var(--lp-line-strong)",
            outline: "1px solid var(--lp-line)",
            outlineOffset: 5,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CornerDiamonds />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-josefin-sans, sans-serif)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.44em",
                textTransform: "uppercase",
                color: "var(--lp-dim)",
              }}
            >
              {t.free.name}
            </span>
          </div>
          <div style={{ marginTop: 26, display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-poiret-one, cursive)",
                fontSize: "clamp(48px, 4.4vw, 68px)",
                lineHeight: 1,
                letterSpacing: "0.04em",
              }}
            >
              {t.free.price}
            </span>
            <span style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--lp-dim2)" }}>/月</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, letterSpacing: "0.1em", color: "var(--lp-dim2)" }}>
            {t.free.note}
          </div>
          <ul style={{ listStyle: "none", margin: "28px 0 32px", padding: 0, flex: 1 }}>
            {t.free.items.map((item, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr",
                  alignItems: "baseline",
                  padding: "12px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  borderTop: i > 0 ? "1px solid var(--lp-line)" : "none",
                }}
              >
                <span style={{ color: "var(--lp-royal)", fontSize: 8 }}>◆</span>
                {item}
              </li>
            ))}
          </ul>
          {/* letterSpacing: 0.22em→0.12em に下げた理由:
              width:100% カード内で de "Kostenlose Testversion starten"(30ch) を
              whiteSpace:nowrap のまま overflow させずに収めるため。0.22em だと
              1カラム表示(~960px)で de テキストがカード幅を超えてしまう。 */}
          <a
            href="https://swim-hub.app/ja/signup"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 36px 16px",
              fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "0.12em",
              background: "transparent",
              color: "var(--lp-ink)",
              border: "1px solid var(--lp-line-strong)",
              outline: "1px solid var(--lp-line)",
              outlineOffset: 4,
              textDecoration: "none",
              transition: "border-color 0.2s ease, color 0.2s ease",
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {t.free.cta}
          </a>
        </article>

        {/* Premium プラン */}
        <article
          style={{
            position: "relative",
            background: "var(--lp-navy)",
            color: "var(--lp-w-white)",
            padding: "clamp(30px, 3.4vw, 46px)",
            border: "1px solid var(--lp-navy)",
            outline: "1px solid var(--lp-line)",
            outlineOffset: 5,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CornerDiamonds color="var(--lp-ice)" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-josefin-sans, sans-serif)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.44em",
                textTransform: "uppercase",
                color: "var(--lp-ice)",
              }}
            >
              {t.premium.name}
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.24em",
                color: "var(--lp-ice)",
                border: "1px solid var(--lp-ice)",
                padding: "5px 12px 4px",
                whiteSpace: "nowrap",
              }}
            >
              {t.premium.badge}
            </span>
          </div>
          <div style={{ marginTop: 26, display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-poiret-one, cursive)",
                fontSize: "clamp(48px, 4.4vw, 68px)",
                lineHeight: 1,
                letterSpacing: "0.04em",
              }}
            >
              {t.premium.price}
            </span>
            <span style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--lp-w-dim)" }}>/月</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, letterSpacing: "0.1em", color: "var(--lp-w-dim)" }}>
            {t.premium.annualNote}
          </div>
          <ul style={{ listStyle: "none", margin: "28px 0 32px", padding: 0, flex: 1 }}>
            {t.premium.items.map((item, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr",
                  alignItems: "baseline",
                  padding: "12px 0",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  borderTop: i > 0 ? "1px solid var(--lp-w-line)" : "none",
                }}
              >
                <span style={{ color: "var(--lp-ice)", fontSize: 8 }}>◆</span>
                {item}
              </li>
            ))}
          </ul>
          <a
            href="https://swim-hub.app/ja/signup"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 36px 16px",
              fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "0.12em",
              background: "var(--lp-silver)",
              color: "var(--lp-navy)",
              border: "1px solid var(--lp-silver)",
              outline: "1px solid var(--lp-w-line)",
              outlineOffset: 4,
              textDecoration: "none",
              transition: "background 0.2s ease, border-color 0.2s ease",
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {t.premium.cta}
          </a>
        </article>
      </div>

      {/* 詳細リンク */}
      <a
        href="https://swim-hub.app/ja/pricing"
        style={{
          display: "table",
          margin: "36px auto 0",
          fontFamily: "var(--font-josefin-sans, sans-serif)",
          fontSize: 11,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--lp-dim)",
          textDecoration: "none",
          borderBottom: "1px solid var(--lp-line-strong)",
          paddingBottom: 5,
          transition: "color 0.15s, border-color 0.15s",
        }}
      >
        {t.detailLink}
      </a>

      <style>{`
        @media (max-width: 960px) {
          .lp-plans { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
