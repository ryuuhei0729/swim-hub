"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function LpNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  function handleSmoothScroll(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    const target = document.querySelector<HTMLElement>(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
    setMenuOpen(false);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(251,250,246,0.85)",
        borderBottom: "1px solid rgba(10,26,54,0.12)",
        backdropFilter: "blur(10px)",
      }}
    >
      <nav
        style={{
          padding: "18px 64px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: 1280,
          margin: "0 auto",
        }}
        className="max-lp-md:px-5"
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: "#0a1a36",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(circle at 30% 30%, #86aaff, transparent 60%)",
              }}
            />
          </div>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: "-0.01em",
              color: "#0a1a36",
              textDecoration: "none",
            }}
          >
            SwimHub
          </Link>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(10,26,54,0.58)",
              marginLeft: 4,
            }}
          >
            v2.4
          </span>
        </div>

        {/* Desktop menu */}
        <div
          className="hidden lp-md:flex"
          style={{ gap: 26, alignItems: "center", fontSize: 13, color: "#0a1a36" }}
        >
          {[
            { label: "機能", href: "#lp-feature" },
            { label: "料金", href: "#lp-pricing" },
            { label: "ブログ", href: "/blog" },
          ].map(({ label, href }) =>
            href.startsWith("#") ? (
              <a
                key={label}
                href={href}
                onClick={(e) => handleSmoothScroll(e, href)}
                style={{ color: "#0a1a36", textDecoration: "none", cursor: "pointer" }}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                style={{ color: "#0a1a36", textDecoration: "none" }}
              >
                {label}
              </Link>
            )
          )}
          <Link
            href="/login"
            style={{ fontSize: 12, color: "#0a1a36", fontWeight: 600, textDecoration: "none" }}
          >
            ログイン
          </Link>
          <Link
            href="/signup"
            style={{
              padding: "9px 18px",
              background: "#0a1a36",
              color: "#fff",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            無料ではじめる
          </Link>
        </div>

        {/* Mobile: login + hamburger */}
        <div className="flex lp-md:hidden" style={{ alignItems: "center", gap: 16 }}>
          <Link
            href="/login"
            style={{ fontSize: 12, color: "#0a1a36", fontWeight: 600, textDecoration: "none" }}
          >
            ログイン
          </Link>
          <button
            aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <span
              style={{
                display: "block",
                width: 22,
                height: 2,
                background: "#0a1a36",
                borderRadius: 2,
                transition: "transform 0.2s",
                transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none",
              }}
            />
            <span
              style={{
                display: "block",
                width: 22,
                height: 2,
                background: "#0a1a36",
                borderRadius: 2,
                opacity: menuOpen ? 0 : 1,
                transition: "opacity 0.2s",
              }}
            />
            <span
              style={{
                display: "block",
                width: 22,
                height: 2,
                background: "#0a1a36",
                borderRadius: 2,
                transition: "transform 0.2s",
                transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none",
              }}
            />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="lp-md:hidden"
          style={{
            background: "rgba(251,250,246,0.97)",
            borderTop: "1px solid rgba(10,26,54,0.12)",
            padding: "16px 20px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {[
            { label: "機能", href: "#lp-feature" },
            { label: "料金", href: "#lp-pricing" },
            { label: "ブログ", href: "/blog" },
          ].map(({ label, href }) =>
            href.startsWith("#") ? (
              <a
                key={label}
                href={href}
                onClick={(e) => handleSmoothScroll(e, href)}
                style={{ fontSize: 15, color: "#0a1a36", textDecoration: "none" }}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                style={{ fontSize: 15, color: "#0a1a36", textDecoration: "none" }}
              >
                {label}
              </Link>
            )
          )}
          <Link
            href="/signup"
            onClick={() => setMenuOpen(false)}
            style={{
              marginTop: 8,
              padding: "12px 0",
              background: "#0a1a36",
              color: "#fff",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            無料ではじめる
          </Link>
        </div>
      )}
    </header>
  );
}
