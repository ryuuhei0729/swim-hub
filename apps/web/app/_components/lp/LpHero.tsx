import Link from "next/link";

export default function LpHero() {
  return (
    <section
      style={{
        padding: "88px 64px 0",
        textAlign: "center",
        maxWidth: 960,
        margin: "0 auto",
      }}
      className="max-lp-md:px-5! max-lp-md:pt-10! max-lp-md:pb-5!"
    >
      {/* Pill badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 999,
          background: "#ffffff",
          border: "1px solid rgba(10,26,54,0.12)",
          fontSize: 12,
          color: "rgba(10,26,54,0.58)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#1f5aa8",
            boxShadow: "0 0 0 3px #86aaff55",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.12em",
          }}
        >
          LIVE
        </span>
        水泳選手のための記録プラットフォーム
      </div>

      {/* H1 */}
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: "-0.035em",
          margin: "22px 0 0",
          color: "#0a1a36",
        }}
        className="text-[46px] lp-md:text-[96px] leading-[1.02] lp-md:leading-[1.0]"
      >
        泳いだ分、
        <br />
        0.01秒まで残る。
      </h1>

      {/* Subcopy */}
      <p
        style={{
          fontFamily: "var(--font-sans)",
          lineHeight: 1.8,
          color: "rgba(10,26,54,0.58)",
          marginTop: 20,
          maxWidth: 620,
          margin: "20px auto 0",
        }}
        className="text-[13.5px] lp-md:text-[17px]"
      >
        練習も、大会も、コーチからの代理入力も。中学から大学まで、選手ひとりに紐づくタイムを、一生分のログブックとして積み上げる。
      </p>

      {/* CTAs */}
      <div
        style={{
          marginTop: 30,
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/signup"
          style={{
            padding: "14px 24px",
            background: "#0a1a36",
            color: "#fff",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          無料ではじめる
        </Link>
        <a
          href="#hero-card"
          style={{
            padding: "14px 24px",
            background: "#ffffff",
            color: "#0a1a36",
            border: "1px solid rgba(10,26,54,0.12)",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          デモを見る
        </a>
      </div>
    </section>
  );
}
