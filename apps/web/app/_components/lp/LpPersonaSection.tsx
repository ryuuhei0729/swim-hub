import Link from "next/link";

// === 型定義 (制約ハーネス: 型が先) ===
type PersonaItem = {
  label: string;
  headline: string;
  body: string;
  ctaText: string;
  ctaHref: string;
};

// === 静的データ (ロジック層) ===
const PERSONA_ITEMS: PersonaItem[] = [
  {
    label: "選手",
    headline: "自分のベストは、自分のもの。",
    body: "中高大からマスターズまで、引退しても記録は資産として残る。",
    ctaText: "無料ではじめる →",
    ctaHref: "/signup",
  },
  {
    label: "コーチ",
    headline: "チームの全員のタイムを、一画面で。",
    body: "代理入力も大会後の振り返りも、紙のタイムシートはもう不要。",
    ctaText: "無料ではじめる →",
    ctaHref: "/signup",
  },
  {
    label: "保護者",
    headline: "子どもの成長を、数字でそっと見守る。",
    body: "記録の積み重ねが、次の目標を見つけるヒントになる。",
    ctaText: "無料ではじめる →",
    ctaHref: "/signup",
  },
];

// === UI (プレゼンテーション層) ===
export default function LpPersonaSection() {
  return (
    <section
      style={{
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "88px 64px",
        background: "#fbfaf6",
      }}
      className="max-lp-md:px-5! max-lp-md:py-9!"
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Kicker */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#1f5aa8",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          For everyone
        </p>

        {/* Heading */}
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#0a1a36",
            marginTop: 12,
            textAlign: "center",
          }}
          className="text-[28px] lp-md:text-[48px]"
        >
          誰でも使える。一生使える。
        </h2>

        {/* 3-column grid */}
        <div
          style={{
            marginTop: 56,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 24,
          }}
          className="max-lp-md:grid-cols-1!"
        >
          {PERSONA_ITEMS.map((persona) => (
            <div
              key={persona.label}
              style={{
                background: "#fff",
                borderRadius: 24,
                padding: 32,
                border: "1px solid rgba(10,26,54,0.12)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Label */}
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "#1f5aa8",
                  letterSpacing: "0.14em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {persona.label}
              </p>

              {/* Headline */}
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 22,
                  lineHeight: 1.25,
                  letterSpacing: "-0.02em",
                  color: "#0a1a36",
                  marginTop: 16,
                }}
              >
                {persona.headline}
              </h3>

              {/* Body */}
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: "rgba(10,26,54,0.72)",
                  marginTop: 12,
                  flexGrow: 1,
                }}
              >
                {persona.body}
              </p>

              {/* CTA link */}
              <div style={{ marginTop: 24 }}>
                <Link
                  href={persona.ctaHref}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "#1f5aa8",
                    letterSpacing: "0.06em",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  {persona.ctaText}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
