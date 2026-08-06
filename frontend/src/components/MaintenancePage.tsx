import { useEffect } from "react";
import { m } from "@/paraglide/messages";
import { contactConfig } from "@/config/contact";

/**
 * Shown instead of the full marketing site while the site is in maintenance
 * mode (toggled from the admin dashboard's Settings section) — a single
 * picture with a link to the festival's Facebook page, nothing else.
 *
 * Styled fully inline rather than via the swappable theme stylesheets
 * (theme-*.css): those assume this page's usual header/nav chrome is
 * present (e.g. `body`'s reserved `padding-top` for the fixed nav, or
 * `.brand-title`'s color only being readable inside `.hero`), neither of
 * which holds here since there's no header at all on this page.
 */
export default function MaintenancePage() {
  const facebookUrl = `https://www.facebook.com/${contactConfig.social.facebook}`;

  useEffect(() => {
    const previousPaddingTop = document.body.style.paddingTop;
    document.body.style.paddingTop = "0";
    return () => {
      document.body.style.paddingTop = previousPaddingTop;
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        backgroundImage: 'url("/images/champagne-hero.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        }}
        aria-hidden="true"
      />
      <div style={{ position: "relative", zIndex: 1, padding: "2rem", maxWidth: "36rem" }}>
        <img
          src="/images/logo.svg"
          alt={m.festival_name()}
          style={{ width: "6rem", height: "6rem", marginBottom: "1.5rem" }}
        />
        <h1
          style={{
            fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
            fontWeight: 900,
            marginBottom: "1rem",
            color: "#fff8ec",
            textShadow: "0 14px 38px rgb(0 0 0 / 0.48)",
          }}
        >
          {m.maintenance_title()}
        </h1>
        <p style={{ fontSize: "1.1rem", marginBottom: "1.5rem", color: "#fff8ec" }}>
          {m.maintenance_message()}
        </p>
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-champagne btn-lg"
        >
          <i className="bi bi-facebook me-2" aria-hidden="true" />
          {m.maintenance_facebook_cta()}
        </a>
      </div>
    </div>
  );
}
