import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages";
import { contactConfig } from "@/config/contact";

/**
 * Path for the current edition's flyer/poster image. Not in the repo yet —
 * drop the real file in `frontend/public/images/flyer.jpg` (same name) and
 * it'll pick up automatically, no code change needed. Until then the <img
 * onError> below swaps in a placeholder instead of a broken-image icon.
 */
const FLYER_SRC = "/images/flyer.jpg";

/**
 * Shown instead of the full marketing site while the site is in maintenance
 * mode (toggled from the admin dashboard's Settings section, or automatically
 * when the backend can't be reached at all) — a picture with a link to the
 * festival's Facebook page, plus the current flyer, and nothing else.
 *
 * Styled fully inline rather than via the swappable theme stylesheets
 * (theme-*.css): those assume this page's usual header/nav chrome is
 * present (e.g. `body`'s reserved `padding-top` for the fixed nav, or
 * `.brand-title`'s color only being readable inside `.hero`), neither of
 * which holds here since there's no header at all on this page.
 */
export default function MaintenancePage() {
  const facebookUrl = `https://www.facebook.com/${contactConfig.social.facebook}`;
  const [flyerFailed, setFlyerFailed] = useState(false);

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

        <div
          style={{
            marginTop: "2rem",
            padding: "0.5rem",
            background: "#fff8ec",
            borderRadius: "0.5rem",
            boxShadow: "0 14px 38px rgb(0 0 0 / 0.35)",
            display: "inline-block",
          }}
        >
          {flyerFailed ? (
            <div
              style={{
                width: "220px",
                height: "310px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                border: "2px dashed #c9b48a",
                borderRadius: "0.25rem",
                color: "#8a7554",
              }}
            >
              <i className="bi bi-image" style={{ fontSize: "2rem" }} aria-hidden="true" />
              <span style={{ fontSize: "0.9rem", padding: "0 1rem", textAlign: "center" }}>
                {m.maintenance_flyer_placeholder()}
              </span>
            </div>
          ) : (
            <img
              src={FLYER_SRC}
              alt={m.maintenance_flyer_alt()}
              onError={() => setFlyerFailed(true)}
              style={{
                display: "block",
                maxWidth: "220px",
                maxHeight: "310px",
                width: "auto",
                height: "auto",
                borderRadius: "0.25rem",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
