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
 * which holds here since there's no header at all on this page. The one
 * exception is the `<style>` block below, scoped to this component's own
 * class names — it doesn't touch theme-*.css or assume any shared chrome,
 * it's just the only way to express a breakpoint from plain inline styles.
 *
 * `champagne-hero.png` is a wide (~1.87:1), deliberately asymmetric shot:
 * roughly its left half is a plain dark table with no subject, its right
 * half has the bottles/glasses/candles. A narrow (mobile) viewport crops
 * `background-size: cover` down to a tall sliver near the image's
 * horizontal center, which lands mostly within that dark half — the plain
 * background reads as intentional there. A wide (desktop) viewport is
 * closer to the image's own aspect ratio, so `cover` crops very little:
 * almost the entire photo is visible at once, dead space included, and
 * centering the text block in the middle of *that* leaves it floating in
 * empty space instead of sitting in the dark half the image was framed
 * for. The `WIDE_BREAKPOINT` media query below left-aligns the content
 * into that dark half instead, rather than fighting the image's own
 * composition.
 */
const WIDE_BREAKPOINT = "900px";

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
    <div className="maintenance-page">
      <style>{`
        .maintenance-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          background-image: url("/images/champagne-hero.png");
          background-size: cover;
          background-position: center;
        }
        .maintenance-page__content {
          position: relative;
          z-index: 1;
          padding: 2rem;
          max-width: 36rem;
        }
        @media (min-width: ${WIDE_BREAKPOINT}) {
          .maintenance-page {
            justify-content: flex-start;
          }
          .maintenance-page__content {
            text-align: left;
            margin-left: 6vw;
            /* Stays inside the image's dark half at any wide viewport,
               rather than a value tuned to one specific width. */
            max-width: min(36rem, 42vw);
          }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
        }}
        aria-hidden="true"
      />
      <div className="maintenance-page__content">
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
