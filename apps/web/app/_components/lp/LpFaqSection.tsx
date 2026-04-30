import { safeJsonLd } from "@/lib/seo";

type FaqItem = {
  question: string;
  answer: string;
};

// === 静的データ (ロジック層) ===
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "無料プランでもクレジットカードは必要ですか？",
    answer:
      "不要です。Free プランはクレジットカード登録なしで全機能をお試しいただけます。",
  },
  {
    question: "いつでも解約できますか？",
    answer:
      "はい。Premium プランはマイページからいつでもキャンセルでき、契約期間終了まではご利用いただけます。",
  },
  {
    question: "チームを移籍したら過去の記録は消えますか？",
    answer:
      "消えません。SwimHub の記録は選手個人に紐付くため、所属チームを移っても、引退後も、一生分のログとして残り続けます。",
  },
  {
    question: "マスターズ選手や一般スイマーでも使えますか？",
    answer:
      "はい。中高大の競泳選手はもちろん、マスターズ・一般スイマーの方の記録管理にもご利用いただけます。",
  },
];

const FAQ_JSON_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function LpFaqSection() {
  return (
    <section
      id="lp-faq"
      data-testid="lp-faq-section"
      style={{
        borderTop: "1px solid rgba(10,26,54,0.12)",
        padding: "88px 64px",
        background: "#f5f2ea",
      }}
      className="max-lp-md:px-5! max-lp-md:py-9!"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(FAQ_JSON_LD) }}
      />

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Kicker */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#1f5aa8",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          FAQ
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
          }}
          className="text-[28px] lp-md:text-[48px]"
        >
          よくある質問
        </h2>

        {/* FAQ list — SSR で質問・回答が両方 DOM に存在する */}
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column" }}>
          {FAQ_ITEMS.map((item, idx) => (
            <div
              key={item.question}
              data-testid="lp-faq-item"
              style={{
                padding: "24px 0",
                borderTop: idx === 0 ? "1px solid rgba(10,26,54,0.12)" : "none",
                borderBottom: "1px solid rgba(10,26,54,0.12)",
              }}
            >
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0a1a36",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {item.question}
              </h3>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: "rgba(10,26,54,0.78)",
                  marginTop: 10,
                  margin: "10px 0 0",
                }}
              >
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
