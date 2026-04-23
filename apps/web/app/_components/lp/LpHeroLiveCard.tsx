"use client";

import Image from "next/image";
import AnimatedCounter from "./AnimatedCounter";
import LpTickBar from "./LpTickBar";

const SPLITS = [
  { label: "25m", value: "12.84", hot: false },
  { label: "50m", value: "26.52", hot: false },
  { label: "75m", value: "39.91", hot: false },
  { label: "100m", value: "52.86", hot: true },
];

export default function LpHeroLiveCard() {
  return (
    <section style={{ padding: "56px 64px 96px" }} className="max-lp-md:px-5! max-lp-md:pt-1! max-lp-md:pb-8!">
      {/* Live card */}
      <div
        id="hero-card"
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 28,
          border: "1px solid rgba(10,26,54,0.12)",
          boxShadow: "0 24px 60px -30px rgba(10,26,54,0.25)",
          overflow: "hidden",
        }}
        className="max-lp-md:rounded-[20px]!"
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr" }}
          className="max-lp-md:grid-cols-1!"
        >
          {/* Left — live stopwatch */}
          <div
            style={{
              padding: 36,
              borderRight: "1px solid rgba(10,26,54,0.12)",
              position: "relative",
            }}
            className="max-lp-md:border-r-0! max-lp-md:border-b! max-lp-md:border-[rgba(10,26,54,0.12)]! max-lp-md:p-[18px]!"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#1f5aa8",
                }}
              >
                ● LIVE · 100m Fr
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "rgba(10,26,54,0.58)",
                }}
              >
                SPLIT 4/4
              </span>
            </div>

            {/* Big counter */}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                marginTop: 22,
                color: "#0a1a36",
              }}
              className="text-[52px] lp-md:text-[96px]"
            >
              <AnimatedCounter target={52.86} duration={2200} decimals={2} />
            </div>

            {/* Delta */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "#0a7a4a",
                  fontWeight: 600,
                }}
              >
                −0.41s
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  color: "rgba(10,26,54,0.58)",
                }}
              >
                vs PB · 先週
              </span>
            </div>

            {/* Tick bar + scale */}
            <div style={{ marginTop: 28 }}>
              <LpTickBar count={80} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "rgba(10,26,54,0.35)",
                  letterSpacing: "0.1em",
                }}
              >
                <span>00:00.00</span>
                <span>01:00.00</span>
                <span>02:00.00</span>
              </div>
            </div>

            {/* Split grid */}
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 22 }}
            >
              {SPLITS.map(({ label, value, hot }) => (
                <div
                  key={label}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: hot ? "#f5f2ea" : "#fbfaf6",
                    border: "1px solid rgba(10,26,54,0.12)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "rgba(10,26,54,0.35)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 17,
                      color: hot ? "#1f5aa8" : "#0a1a36",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — practice snapshot */}
          <div
            style={{ background: "#fbfaf6", position: "relative", minHeight: 320 }}
            className="max-lp-md:hidden!"
          >
            <Image
              src="/screenshots/lp-practice.png"
              alt="SwimHub 練習記録 - サークル・本数・タイム管理画面"
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width: 960px) 0px, 50vw"
            />
          </div>
        </div>
      </div>

      {/* Stat band */}
      <LpStatBandInline />
    </section>
  );
}

function LpStatBandInline() {
  const stats = [
    { key: "PRECISION", value: "0.01s", desc: "ラップ粒度" },
    { key: "EVENTS", value: "62", desc: "種目対応" },
    { key: "POOL", value: "LC / SC", desc: "両対応・自動換算" },
    { key: "LIFETIME", value: "∞", desc: "引退後も蓄積" },
  ];

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "32px auto 0",
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 1,
        background: "rgba(10,26,54,0.12)",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(10,26,54,0.12)",
      }}
      className="max-lp-md:grid-cols-2!"
    >
      {stats.map(({ key, value, desc }) => (
        <div key={key} style={{ background: "#ffffff", padding: "20px 22px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(10,26,54,0.35)",
            }}
          >
            {key}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 30,
              fontWeight: 700,
              color: "#0a1a36",
              marginTop: 4,
              letterSpacing: "-0.02em",
            }}
            className="max-lp-md:text-[22px]!"
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              color: "rgba(10,26,54,0.58)",
              marginTop: 2,
            }}
          >
            {desc}
          </div>
        </div>
      ))}
    </div>
  );
}
