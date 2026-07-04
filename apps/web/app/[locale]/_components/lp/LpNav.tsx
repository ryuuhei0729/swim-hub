'use client';

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import LapProgressBar from "./LapProgressBar";

interface LpNavProps {
  t: {
    practice: string;
    competition: string;
    proxy: string;
    pricing: string;
    signup: string;
    login: string;
  };
}

/**
 * LP v4.2 ナビゲーション (sticky)
 *
 * デスクトップ(>960px): 3カラムグリッド — ロゴ / ナビリンク / 言語+ログイン+無料登録
 * モバイル(≤960px):  flex — ロゴ+タイトル / 言語切替 / ハンバーガー
 *                    ログイン/無料登録はドロップダウンメニュー内に配置。
 */
export default function LpNav({ t }: LpNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen((v) => !v);

  const navLinks = [
    { href: "#practice", label: t.practice },
    { href: "#competition", label: t.competition },
    { href: "#proxy", label: t.proxy },
    { href: "#pricing", label: t.pricing },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "16px var(--lp-pad-x)",
        background: "rgba(238,241,246,0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--lp-line)",
      }}
      className="lp-nav"
    >
      {/* ロゴ */}
      <a
        href="#top"
        style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}
      >
        <Image src="/favicon.png" alt="SwimHub" width={26} height={26} />
        <span
          style={{
            fontFamily: "var(--font-chakra-petch, sans-serif)",
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: "-0.035em",
            color: "var(--lp-ink)",
          }}
          className="lp-nav-brand-text"
        >
          SwimHub
        </span>
      </a>

      {/* センターナビ (960px超のみ表示) */}
      <nav aria-label="メインナビゲーション" className="lp-nav-links">
        <div style={{ display: "flex", gap: 36 }}>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.2em",
                color: "var(--lp-dim)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--lp-royal)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--lp-dim)"; }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      {/* 右側 CTA */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-end" }}
        className="lp-nav-cta"
      >
        {/* 言語切替: デスクトップ・モバイル両方で top bar に表示 */}
        <span className="lp-nav-lang">
          <LanguageSwitcher />
        </span>

        {/* ログインリンク: デスクトップ(>960px)のみ表示。
            ※ className="lp-nav-login" は E2E テストのセレクタとして使用中のため維持 */}
        <Link
          href="/login"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "var(--lp-ink)",
            textDecoration: "none",
            transition: "color 0.15s",
            whiteSpace: "nowrap",
          }}
          className="lp-nav-login"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--lp-royal)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--lp-ink)"; }}
        >
          {t.login}
        </Link>

        {/* 無料登録ボタン: デスクトップ(>960px)のみ表示。
            letterSpacing 0.14em: 参照HTML の 0.32em より狭い。
            de "KOSTENLOS REGISTRIEREN"(21字 uppercase) が nowrap で収まるよう意図的に抑えた値。 */}
        <Link
          href="/signup"
          className="lp-nav-signup"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 22px 11px",
            fontFamily: "var(--font-josefin-sans, sans-serif)",
            fontWeight: 700,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            lineHeight: 1,
            background: "var(--lp-navy)",
            color: "var(--lp-w-white)",
            border: "1px solid var(--lp-navy)",
            outline: "1px solid var(--lp-line)",
            outlineOffset: 3,
            textDecoration: "none",
            transition: "background 0.2s ease, border-color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "var(--lp-royal)";
            el.style.borderColor = "var(--lp-royal)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "var(--lp-navy)";
            el.style.borderColor = "var(--lp-navy)";
          }}
        >
          {t.signup}
        </Link>

        {/* ハンバーガー (960px以下で表示。inline style は display:none 初期値、CSS で flex に上書き) */}
        <button
          id="nav-burger"
          className="lp-nav-burger"
          aria-label="メニューを開く"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(); } }}
          style={{
            display: "none",
            width: 44,
            height: 44,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            background: "transparent",
            border: "1px solid var(--lp-line-strong)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <i
            style={{
              display: "block",
              width: 18,
              height: 2,
              background: "var(--lp-ink)",
              transition: "transform 0.2s ease, opacity 0.2s ease",
              transform: menuOpen ? "translateY(7px) rotate(45deg)" : "none",
            }}
          />
          <i
            style={{
              display: "block",
              width: 18,
              height: 2,
              background: "var(--lp-ink)",
              transition: "opacity 0.2s ease",
              opacity: menuOpen ? 0 : 1,
            }}
          />
          <i
            style={{
              display: "block",
              width: 18,
              height: 2,
              background: "var(--lp-ink)",
              transition: "transform 0.2s ease, opacity 0.2s ease",
              transform: menuOpen ? "translateY(-7px) rotate(-45deg)" : "none",
            }}
          />
        </button>
      </div>

      {/* モバイルドロップダウンメニュー
          全幅パネル(left:0 right:0)、alignItems:flex-end で子要素を右端に揃える。
          言語切替は top bar に移動したため、メニュー内はナビ+ログイン+無料登録のみ。 */}
      {menuOpen && (
        <nav
          id="nav-menu"
          className="lp-nav-menu"
          aria-label="モバイルナビゲーション"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            background: "rgba(238,241,246,0.97)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--lp-line)",
            padding: "6px var(--lp-pad-x) 16px",
            zIndex: 40,
          }}
        >
          {navLinks.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                padding: "14px 0",
                fontSize: 13,
                letterSpacing: "0.2em",
                fontWeight: 500,
                color: "var(--lp-ink)",
                textDecoration: "none",
                textAlign: "right",
                width: "100%",
                borderTop: i === 0 ? "none" : "1px solid var(--lp-line)",
              }}
            >
              {link.label}
            </a>
          ))}
          {/* ログイン / 無料登録 (モバイルメニュー内 CTA) */}
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            style={{
              padding: "14px 0",
              fontSize: 13,
              letterSpacing: "0.2em",
              fontWeight: 500,
              color: "var(--lp-ink)",
              textDecoration: "none",
              textAlign: "right",
              width: "100%",
              borderTop: "1px solid var(--lp-line)",
              whiteSpace: "nowrap",
            }}
          >
            {t.login}
          </Link>
          <Link
            href="/signup"
            onClick={() => setMenuOpen(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "flex-end",
              marginTop: 12,
              padding: "12px 24px 11px",
              fontFamily: "var(--font-josefin-sans, sans-serif)",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              lineHeight: 1,
              background: "var(--lp-navy)",
              color: "var(--lp-w-white)",
              border: "1px solid var(--lp-navy)",
              textDecoration: "none",
              transition: "background 0.2s ease",
            }}
          >
            {t.signup}
          </Link>
        </nav>
      )}

      {/* ラッププログレスバー (ナビ直下、装飾要素) */}
      <LapProgressBar />

      <style>{`
        @media (max-width: 960px) {
          /* flex レイアウトに切替: ロゴ+タイトルが左端、言語+ハンバーガーが右端 */
          .lp-nav { display: flex !important; justify-content: space-between; gap: 6px; padding: 12px var(--lp-pad-x) !important; }
          .lp-nav-links { display: none !important; }
          .lp-nav-burger { display: flex !important; }
          /* ≤960px では top bar の login/signup を非表示。導線はハンバーガーメニュー内で提供。
             .lp-nav-login の className は E2E テストのセレクタとして使用中のため削除不可 */
          .lp-nav-login { display: none !important; }
          .lp-nav-signup { display: none !important; }
          /* 言語切替: モバイルでも top bar に表示するため display:none を設定しない */
          /* ハンバーガーをスマホで小型化 */
          .lp-nav-burger { width: 36px !important; height: 36px !important; }
        }
        /* 375px以下: さらにコンパクト化してロゴ+タイトル+言語+バーガーを1行に収める */
        @media (max-width: 375px) {
          .lp-nav { gap: 4px !important; padding: 10px 12px !important; }
          .lp-nav-brand-text { font-size: 17px !important; }
          .lp-nav-burger { width: 32px !important; height: 32px !important; }
        }
      `}</style>
    </header>
  );
}
