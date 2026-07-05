import Image from "next/image";
import { Link } from "@/i18n/navigation";

interface LpFooterProps {
  t: {
    tagline: string;
    copyright: string;
    slogan: string;
    terms: string;
    privacy: string;
    about: string;
  };
}

/**
 * LP v4.2 フッター (ダーク --lp-navy)
 *
 * ブランド / リンク / ベース行
 */
export default function LpFooter({ t }: LpFooterProps) {
  const links = [
    { href: "/terms", label: t.terms },
    { href: "/privacy", label: t.privacy },
    { href: "/about", label: t.about },
  ];

  return (
    <footer
      style={{
        borderTop: "1px solid var(--lp-line)",
        background: "var(--lp-navy)",
        color: "var(--lp-w-white)",
      }}
      className="dark"
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          textAlign: "center",
          padding: "clamp(56px, 8vh, 80px) var(--lp-pad-x) 40px",
        }}
      >
        {/* ブランド */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Image src="/favicon.png" alt="SwimHub" width={60} height={60} />
          <span
            style={{
              fontFamily: "var(--font-chakra-petch, sans-serif)",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "-0.035em",
              color: "var(--lp-w-white)",
            }}
          >
            SwimHub
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.26em",
              color: "var(--lp-w-dim2)",
            }}
          >
            {t.tagline}
          </span>
        </div>

        {/* リンク */}
        <nav
          aria-label="フッターナビゲーション"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 32,
            justifyContent: "center",
            marginTop: 30,
          }}
          className="lp-footer-links"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="lp-footer-link"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.2em",
                color: "var(--lp-w-dim)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ベース行 */}
        <div
          style={{
            marginTop: 38,
            paddingTop: 22,
            borderTop: "1px solid var(--lp-w-line)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--font-josefin-sans, sans-serif)",
            fontSize: 9.5,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--lp-w-dim2)",
          }}
        >
          <span>{t.copyright}</span>
          <span>{t.slogan}</span>
        </div>
      </div>

      <style>{`
        @media (max-width: 560px) {
          .lp-footer-links { gap: 18px !important; }
        }
        .lp-footer-link:hover { color: var(--lp-ice) !important; }
      `}</style>
    </footer>
  );
}
