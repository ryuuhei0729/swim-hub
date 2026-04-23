import Image from "next/image";

export default function LpScannerBlock() {
  return (
    <section
      id="lp-scanner"
      style={{
        background: "#fbfaf6",
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "88px 64px",
      }}
      className="max-lp-md:px-5! max-lp-md:py-9!"
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          background: "#0a1a36",
          color: "#fff",
          borderRadius: 32,
          padding: 56,
          boxShadow: "0 30px 60px -30px rgba(10,26,54,0.45)",
          position: "relative",
          overflow: "hidden",
        }}
        className="max-lp-md:rounded-[20px]! max-lp-md:p-6!"
      >
        {/* Decoration */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 70% 40%, #86aaff35, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "center",
            position: "relative",
          }}
          className="max-lp-md:grid-cols-1! max-lp-md:gap-8!"
        >
          {/* Left */}
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "rgba(245,242,234,0.6)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              ◆ Exclusive · AI OCR
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                lineHeight: 1.03,
                letterSpacing: "-0.035em",
                marginTop: 16,
                color: "#fff",
              }}
              className="text-[30px] lp-md:text-[56px]"
            >
              紙のノート、
              <br />
              3秒でデータに。
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.8,
                color: "rgba(245,242,234,0.78)",
                maxWidth: 440,
                marginTop: 20,
              }}
              dangerouslySetInnerHTML={{
                __html:
                  "プールサイドの手書きメニューを撮るだけ。AIが即座に構造化して SwimHub へ取り込む。<strong>入力の手間がゼロ</strong>になるから、記録は続く。続くから、縮む。",
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 32, flexWrap: "wrap" }}>
              <a
                href="https://scanner.swim-hub.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#ffffff",
                  color: "#0a1a36",
                  padding: "14px 24px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                SCANNER を試す
              </a>
              {/* TODO: YouTube デモ動画 URL 決定後に href を設定 */}
              <button
                disabled
                style={{
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.4)",
                  padding: "14px 24px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "not-allowed",
                  opacity: 0.5,
                  whiteSpace: "nowrap",
                }}
              >
                デモ動画
              </button>
            </div>
          </div>

          {/* Right */}
          <div
            style={{
              position: "relative",
              aspectRatio: "16/11",
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <Image
              src="/screenshots/lp-scanner.png"
              alt="SwimHub Scanner - 手書き練習記録のAI読み取り画面"
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
