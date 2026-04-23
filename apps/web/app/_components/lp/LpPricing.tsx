import Link from "next/link";

const FREE_FEATS = [
  "Split-time 最大3個/記録",
  "PracticeTime 最大18個/ログ",
  "基本機能は無期限で無料",
];

const PREMIUM_FEATS = [
  "全機能 無制限",
  "Split-time / PracticeTime 無制限",
  "画像・動画アップロード",
  "大会エントリー収集",
  "7日間の無料トライアル",
];

export default function LpPricing() {
  return (
    <section
      id="lp-pricing"
      style={{
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "96px 64px",
      }}
      className="max-lp-md:px-5! max-lp-md:py-11!"
    >
      {/* Heading */}
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#1f5aa8",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Pricing
        </p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#0a1a36",
            marginTop: 12,
          }}
          className="text-[32px] lp-md:text-[56px]"
        >
          1日 約16円で、
          <br />
          キャリアを残す。
        </h2>
        <p
          style={{
            fontSize: 16,
            color: "rgba(10,26,54,0.58)",
            marginTop: 16,
          }}
        >
          まずは Free で試せる。Premium は7日間無料・いつでも解約可能。
        </p>
      </div>

      {/* Cards */}
      <div
        style={{
          maxWidth: 900,
          margin: "56px auto 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
        className="max-lp-md:grid-cols-1!"
      >
        {/* Free card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: 32,
            border: "1px solid rgba(10,26,54,0.12)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#1f5aa8",
              letterSpacing: "0.14em",
              fontWeight: 600,
            }}
          >
            FREE
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 64,
                color: "#0a1a36",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              ¥0
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "rgba(10,26,54,0.58)",
              }}
            >
              /月
            </span>
          </div>
          <p style={{ fontSize: 14, color: "rgba(10,26,54,0.58)", marginTop: 4 }}>
            個人でまず始める。
          </p>

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column" }}>
            {FREE_FEATS.map((feat, idx) => (
              <div
                key={feat}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(10,26,54,0.08)",
                  borderTop: idx === 0 ? "1px solid rgba(10,26,54,0.08)" : "none",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#1f5aa8", fontSize: 14, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: "#0a1a36" }}>{feat}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: 24 }}>
            <Link
              href="/signup"
              style={{
                display: "block",
                background: "#0a1a36",
                color: "#fff",
                padding: "14px 24px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              無料ではじめる
            </Link>
          </div>
        </div>

        {/* Premium card */}
        <div
          style={{
            background: "#0a1a36",
            color: "#fff",
            borderRadius: 24,
            padding: 32,
            boxShadow: "0 30px 50px -24px rgba(10,26,54,0.40)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Decoration */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 80% 30%, #86aaff30, transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              position: "relative",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "#86aaff",
                letterSpacing: "0.14em",
                fontWeight: 600,
              }}
            >
              PREMIUM
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "#86aaff",
              }}
            >
              ◆ Recommended
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              marginTop: 12,
              position: "relative",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 64,
                color: "#fff",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              ¥500
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              /月 · 年¥5,000
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.78)",
              marginTop: 4,
              position: "relative",
            }}
          >
            すべての記録を無制限に。
          </p>

          <div
            style={{ marginTop: 24, display: "flex", flexDirection: "column", position: "relative" }}
          >
            {PREMIUM_FEATS.map((feat, idx) => (
              <div
                key={feat}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  borderTop: idx === 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#86aaff", fontSize: 14, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{feat}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: 24, position: "relative" }}>
            <Link
              href="/signup?plan=premium"
              style={{
                display: "block",
                background: "#fff",
                color: "#0a1a36",
                padding: "14px 24px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              7日間無料で試す
            </Link>
          </div>
        </div>
      </div>

      {/* Detail link */}
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link
          href="/pricing"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "rgba(10,26,54,0.58)",
            letterSpacing: "0.12em",
            textDecoration: "none",
          }}
        >
          詳細プランを見る →
        </Link>
      </div>
    </section>
  );
}
