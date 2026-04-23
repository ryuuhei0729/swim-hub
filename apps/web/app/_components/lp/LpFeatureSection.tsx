import { Fragment } from "react";
import Image from "next/image";

interface LpFeatureSectionProps {
  n: string;
  kicker: string;
  headingLine1: string;
  headingLine2: string;
  body: string;
  bullets: [string, string, string];
  imageSrc: string;
  imageAlt: string;
  flip?: boolean;
  bgColor: "paper" | "paper2";
  id?: string;
}

export default function LpFeatureSection({
  n,
  kicker,
  headingLine1,
  headingLine2,
  body,
  bullets,
  imageSrc,
  imageAlt,
  flip = false,
  bgColor,
  id,
}: LpFeatureSectionProps) {
  const bg = bgColor === "paper" ? "#fbfaf6" : "#f5f2ea";

  return (
    <section
      id={id}
      style={{
        background: bg,
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "88px 64px",
      }}
      className="max-lp-md:px-5! max-lp-md:py-9!"
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 72,
          alignItems: "center",
        }}
        className="max-lp-md:grid-cols-1! max-lp-md:gap-8!"
      >
        {/* Copy column */}
        <div style={{ order: flip ? 2 : 1 }} className="max-lp-md:order-1!">
          {/* Kicker row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 40,
                fontWeight: 700,
                color: "#1f5aa8",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {n}
            </span>
            <div
              style={{
                width: 36,
                height: 1,
                background: "rgba(10,26,54,0.35)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(10,26,54,0.58)",
              }}
            >
              {n} · {kicker}
            </span>
          </div>

          {/* H2 */}
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: "#0a1a36",
              marginTop: 20,
            }}
            className="text-[30px] lp-md:text-[60px]"
          >
            {headingLine1}
            <br />
            {headingLine2}
          </h2>

          {/* Body */}
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.8,
              color: "rgba(10,26,54,0.58)",
              maxWidth: 460,
              marginTop: 20,
            }}
          >
            {body}
          </p>

          {/* Bullet list */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              marginTop: 28,
            }}
          >
            {bullets.map((text, idx) => (
              <Fragment key={text}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "#1f5aa8",
                    padding: "12px 0",
                    borderTop: idx > 0 ? "1px solid rgba(10,26,54,0.12)" : "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: "#0a1a36",
                    padding: "12px 0",
                    borderTop: idx > 0 ? "1px solid rgba(10,26,54,0.12)" : "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {text}
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        {/* Image column */}
        <div
          style={{ order: flip ? 1 : 2 }}
          className="max-lp-md:order-2!"
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "1px solid rgba(10,26,54,0.12)",
              boxShadow: "0 16px 40px -24px rgba(10,26,54,0.22)",
              aspectRatio: "4/3",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width:960px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
