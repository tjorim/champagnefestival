import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages";
import { contactConfig } from "@/config/contact";

/**
 * Path for the current edition's flyer/poster image. Replace
 * `frontend/public/images/flyer.jpg` with next edition's flyer (same name)
 * and it picks up automatically, no code change needed. If it's ever missing,
 * the <img onError> below swaps in a placeholder instead of a broken-image icon.
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
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const previousPaddingTop = document.body.style.paddingTop;
    document.body.style.paddingTop = "0";
    return () => {
      document.body.style.paddingTop = previousPaddingTop;
    };
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

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
          /* The CTA button and flyer card below are both inline-block —
             without an explicit column, they stack only by accident,
             whenever the container happens to be too narrow to fit them
             side by side. A flex column guarantees each child gets its own
             row at every width instead of leaving that to chance. */
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        @media (min-width: ${WIDE_BREAKPOINT}) {
          .maintenance-page {
            justify-content: flex-start;
          }
          .maintenance-page__content {
            text-align: left;
            align-items: flex-start;
            margin-left: 6vw;
            /* Stays inside the image's dark half at any wide viewport,
               rather than a value tuned to one specific width. */
            max-width: min(36rem, 42vw);
          }
        }
        .maintenance-page__flyer-trigger {
          position: relative;
          overflow: hidden;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .maintenance-page__flyer-trigger:hover,
        .maintenance-page__flyer-trigger:focus-visible {
          transform: translateY(-2px);
          box-shadow: 0 20px 44px rgb(0 0 0 / 0.45);
        }
        .maintenance-page__flyer-overlay {
          position: absolute;
          inset: 0.5rem;
          border-radius: 0.25rem;
          background: rgba(20, 14, 6, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.15s ease;
          pointer-events: none;
        }
        .maintenance-page__flyer-trigger:hover .maintenance-page__flyer-overlay,
        .maintenance-page__flyer-trigger:focus-visible .maintenance-page__flyer-overlay {
          opacity: 1;
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

        {flyerFailed ? (
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
            <div
              style={{
                width: "clamp(220px, 19vw, 380px)",
                aspectRatio: "884 / 1536",
                maxHeight: "clamp(200px, 30vh, 460px)",
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
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={m.maintenance_flyer_alt()}
            className="maintenance-page__flyer-trigger"
            style={{
              marginTop: "2rem",
              padding: "0.5rem",
              background: "#fff8ec",
              borderRadius: "0.5rem",
              boxShadow: "0 14px 38px rgb(0 0 0 / 0.35)",
              display: "inline-block",
              border: "none",
              cursor: "pointer",
            }}
          >
            <img
              src={FLYER_SRC}
              alt=""
              onError={() => setFlyerFailed(true)}
              style={{
                display: "block",
                maxWidth: "clamp(220px, 19vw, 380px)",
                // The rest of the column (logo, heading, message, button) already
                // spends a good chunk of a typical laptop's viewport height, so
                // this needs its own budget tied to vh, not just a generous cap —
                // otherwise the real flyer's tall aspect ratio (portrait poster,
                // ~0.58) pushes the page past the fold on ordinary 900px/768px-tall
                // screens once it's free to grow with `maxWidth` above.
                maxHeight: "clamp(200px, 30vh, 460px)",
                width: "auto",
                height: "auto",
                borderRadius: "0.25rem",
              }}
            />
            <span className="maintenance-page__flyer-overlay" aria-hidden="true">
              <i className="bi bi-zoom-in" style={{ fontSize: "1.75rem", color: "#fff8ec" }} />
            </span>
          </button>
        )}
      </div>

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={m.maintenance_flyer_alt()}
          onClick={() => setLightboxOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label={m.close()}
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "50%",
              border: "none",
              background: "rgba(255, 255, 255, 0.15)",
              color: "#fff8ec",
              fontSize: "1.25rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
          <img
            src={FLYER_SRC}
            alt={m.maintenance_flyer_alt()}
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              width: "auto",
              height: "auto",
              borderRadius: "0.5rem",
              boxShadow: "0 20px 60px rgb(0 0 0 / 0.6)",
            }}
          />
        </div>
      )}
    </div>
  );
}
