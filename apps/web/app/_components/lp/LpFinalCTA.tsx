import Link from "next/link";
import LpTickBar from "./LpTickBar";

export default function LpFinalCTA() {
  return (
    <section
      id="lp-final-cta"
      style={{
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "96px 64px 40px",
        textAlign: "center",
      }}
      className="max-lp-md:px-5! max-lp-md:pt-12! max-lp-md:pb-8!"
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#1f5aa8",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        READY?
      </p>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          lineHeight: 1.0,
          letterSpacing: "-0.035em",
          color: "#0a1a36",
          marginTop: 12,
        }}
        className="text-[38px] lp-md:text-[88px]"
      >
        次の0.01秒は、
        <br />
        残すから縮む。
      </h2>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          marginTop: 32,
          flexWrap: "wrap",
        }}
        className="max-lp-md:flex-col! max-lp-md:items-center!"
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
          無料ではじめる ↗
        </Link>
        <button
          disabled
          style={{
            padding: "14px 24px",
            background: "#fff",
            color: "#0a1a36",
            border: "1px solid rgba(10,26,54,0.12)",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            cursor: "not-allowed",
            opacity: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          App Store · 準備中
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: "56px auto 0" }}>
        <LpTickBar count={140} />
      </div>
    </section>
  );
}
