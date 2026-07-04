import Image from "next/image";

interface FeatureData {
  id: string;
  anchor: string;
  number: string;
  label: string;
  title: string;
  desc: string;
  items: string[];
  imgSrc: string;
  imgAlt: string;
  imgCaption: string;
  ghostWord: string;
  flip?: boolean;
  activeIndicator: number; // 0-indexed
}

interface LpFeaturesProps {
  t: {
    introLabel: string;
    introH2: string;
    f1: { label: string; title: string; desc: string; items: string[] };
    f2: { label: string; title: string; desc: string; items: string[] };
    f3: { label: string; title: string; desc: string; items: string[] };
  };
}

function FeatureBlock({ feature }: { feature: FeatureData }) {
  const FrameContent = (
    <div
      style={{
        position: "relative",
        background: "var(--lp-panel)",
        border: "1px solid var(--lp-line-strong)",
        outline: "1px solid var(--lp-line)",
        outlineOffset: 6,
        padding: 14,
        boxShadow: "0 30px 60px -44px rgba(11,20,36,0.38)",
        clipPath: "var(--lp-photo-clip)",
      }}
      className={`lp-f-frame lp-f-frame-${feature.id}`}
    >
      {/* 四隅ダイヤ */}
      {(["tl", "tr", "bl", "br"] as const).map((pos) => (
        <i
          key={pos}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            background: "var(--lp-royal)",
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
        src={feature.imgSrc}
        alt={feature.imgAlt}
        width={640}
        height={480}
        style={{ width: "100%" }}
      />
    </div>
  );

  const CopyContent = (
    <div style={{ position: "relative", zIndex: 1 }} className="rv">
      {/* 番号 + インジケータ */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span
          style={{
            fontFamily: "var(--font-poiret-one, cursive)",
            fontSize: "clamp(52px, 4.6vw, 76px)",
            lineHeight: 1,
            color: "var(--lp-royal)",
            letterSpacing: "0.06em",
          }}
        >
          {feature.number}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <i
              key={i}
              style={{
                display: "block",
                width: 8,
                height: 8,
                background: i === feature.activeIndicator ? "var(--lp-royal)" : "var(--lp-line-strong)",
                transform: "rotate(45deg)",
              }}
            />
          ))}
        </span>
      </div>

      {/* deco-label */}
      <div
        style={{
          marginTop: 16,
          fontFamily: "var(--font-josefin-sans, sans-serif)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.5em",
          textTransform: "uppercase",
          color: "var(--lp-royal)",
        }}
      >
        {feature.label}
      </div>

      {/* h2 */}
      <h2
        style={{
          margin: "18px 0 0",
          fontWeight: 900,
          fontSize: "clamp(22px, 2.2vw, 32px)",
          lineHeight: 1.7,
          letterSpacing: "0.14em",
          fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
        }}
      >
        {feature.title.split("\n").map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
      </h2>

      {/* 説明文 */}
      <p
        style={{
          margin: "18px 0 0",
          maxWidth: 480,
          fontSize: 13.5,
          color: "var(--lp-dim)",
          lineHeight: 2.05,
          letterSpacing: "0.04em",
        }}
      >
        {feature.desc}
      </p>

      {/* リスト */}
      <ul
        style={{
          listStyle: "none",
          margin: "28px 0 0",
          padding: 0,
          maxWidth: 480,
        }}
      >
        {feature.items.map((item, i) => (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr",
              alignItems: "baseline",
              padding: "13px 0",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.08em",
              borderTop: i > 0 ? "1px solid var(--lp-line)" : "none",
            }}
          >
            <span style={{ color: "var(--lp-royal)", fontSize: 9 }}>◆</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section
      id={feature.anchor}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "clamp(40px, 6vw, 96px)",
        alignItems: "center",
        padding: "clamp(56px, 8vh, 92px) 0",
        borderTop: "1px solid var(--lp-line)",
      }}
      className={`lp-feature${feature.flip ? " lp-feature-flip" : ""}`}
    >
      {/* 背面ゴーストタイポ */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          ...(feature.flip ? { right: 0, left: "auto" } : { left: 0 }),
          zIndex: 0,
          pointerEvents: "none",
          fontFamily: "var(--font-poiret-one, cursive)",
          fontSize: "clamp(110px, 14vw, 230px)",
          lineHeight: 1,
          color: "rgba(11,20,36,0.05)",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          transform: "translateY(-50%)",
          userSelect: "none",
        }}
        data-plx-x={feature.flip ? "0.12" : "-0.12"}
        data-plx-base="translateY(-50%)"
      >
        {feature.ghostWord}
      </span>

      {/* コピー: flip のときは order:2 */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          order: feature.flip ? 2 : 1,
        }}
      >
        {CopyContent}
      </div>

      {/* 画像: flip のときは order:1 */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          order: feature.flip ? 1 : 2,
        }}
        className="rv lp-f-shot"
      >
        {FrameContent}
        <div
          style={{
            marginTop: 14,
            textAlign: "center",
            fontFamily: "var(--font-josefin-sans, sans-serif)",
            fontSize: 9.5,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: "var(--lp-dim2)",
          }}
        >
          {feature.imgCaption}
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .lp-feature { grid-template-columns: 1fr !important; }
          .lp-feature-flip .lp-f-shot { order: 2 !important; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .lp-f-shot { animation: lpDecoFloat 7s ease-in-out infinite; }
          .lp-feature:nth-of-type(2) .lp-f-shot { animation-delay: -2.3s; }
          .lp-feature:nth-of-type(3) .lp-f-shot { animation-delay: -4.6s; }
          .lp-cd { animation: lpDiaPulse 2.6s ease-in-out infinite; }
          .lp-cd.tr { animation-delay: 0.3s; }
          .lp-cd.bl { animation-delay: 0.6s; }
          .lp-cd.br { animation-delay: 0.9s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-f-shot { animation: none !important; }
          .lp-cd { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

export default function LpFeatures({ t }: LpFeaturesProps) {
  const features: FeatureData[] = [
    {
      id: "f1",
      anchor: "practice",
      number: "0.01",
      label: t.f1.label,
      title: t.f1.title,
      desc: t.f1.desc,
      items: t.f1.items,
      imgSrc: "/screenshots/lp-practice.png",
      imgAlt: "練習記録画面のスクリーンショット",
      imgCaption: "Practice — 練習記録",
      ghostWord: "Practice",
      flip: false,
      activeIndicator: 0,
    },
    {
      id: "f2",
      anchor: "competition",
      number: "0.02",
      label: t.f2.label,
      title: t.f2.title,
      desc: t.f2.desc,
      items: t.f2.items,
      imgSrc: "/screenshots/lp-competition.png",
      imgAlt: "大会記録画面のスクリーンショット",
      imgCaption: "Competition — 大会記録",
      ghostWord: "Race",
      flip: true,
      activeIndicator: 1,
    },
    {
      id: "f3",
      anchor: "proxy",
      number: "0.03",
      label: t.f3.label,
      title: t.f3.title,
      desc: t.f3.desc,
      items: t.f3.items,
      imgSrc: "/screenshots/lp-proxy.png",
      imgAlt: "チーム管理・代理入力画面のスクリーンショット",
      imgCaption: "Team — 代理入力",
      ghostWord: "Team",
      flip: false,
      activeIndicator: 2,
    },
  ];

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 var(--lp-pad-x)",
      }}
    >
      {/* 機能セクション導入 */}
      <div
        style={{ textAlign: "center", padding: "clamp(40px, 6vh, 64px) 0 0" }}
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
            Features
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
            margin: "22px 0 6px",
            fontWeight: 900,
            fontSize: "clamp(22px, 2.4vw, 34px)",
            letterSpacing: "0.22em",
            fontFamily: "var(--font-zen-kaku-gothic-new, sans-serif)",
          }}
        >
          {t.introH2}
        </h2>
      </div>

      {features.map((f) => (
        <FeatureBlock key={f.id} feature={f} />
      ))}
    </div>
  );
}
