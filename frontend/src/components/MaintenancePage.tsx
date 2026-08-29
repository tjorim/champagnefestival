import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages";
import { usePublicSettings } from "@/hooks/useMaintenanceMode";

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
 * Styled fully inline/self-contained rather than by importing anything from
 * the swappable theme stylesheets (theme-*.css): those assume this page's
 * usual header/nav chrome is present (e.g. body's reserved padding-top for
 * a fixed nav, or riviera's padding-left for a fixed sidebar), neither of
 * which holds here since there's no header at all on this page — the
 * useEffect below resets both rather than assuming either theme's layout.
 * A CTA button that used a theme class (.btn-champagne) directly used to
 * render invisible under themes that never defined it (classic, cuvée);
 * the accent colors below are this page's own copies of each theme's real
 * button treatment, not a dependency on the theme stylesheet actually
 * defining that class.
 *
 * The one intentional coupling to the theme system is reading the same
 * `data-visual-theme` attribute the ThemeSwitcher sets on <html> (see
 * useVisualTheme.ts) via the `html[data-visual-theme="..."]` selectors
 * below, so switching themes while this page is showing is visible here
 * too — while we're still evaluating which one to keep, this page
 * shouldn't look like it was only ever tested against one of them.
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
  const { facebook_url: facebookUrl } = usePublicSettings();
  const [flyerFailed, setFlyerFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    // Several visual themes reserve body padding for their own header/nav
    // chrome (e.g. riviera's fixed sidebar reserves padding-left: 18rem at
    // desktop widths) — chrome this page never renders. Left in place, the
    // reserved gap exposes that theme's own body background/pattern down one
    // edge instead of this page's full-bleed hero.
    const previousPaddingTop = document.body.style.paddingTop;
    const previousPaddingLeft = document.body.style.paddingLeft;
    document.body.style.paddingTop = "0";
    document.body.style.paddingLeft = "0";
    return () => {
      document.body.style.paddingTop = previousPaddingTop;
      document.body.style.paddingLeft = previousPaddingLeft;
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

        .maintenance-page__scrim {
          position: absolute;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.55);
        }

        .maintenance-page__flyer-card {
          margin-top: 2rem;
          padding: 0.5rem;
          background: #fff8ec;
          border-radius: 0.5rem;
          border: 0;
          box-shadow: 0 14px 38px rgb(0 0 0 / 0.35);
          display: inline-block;
        }
        .maintenance-page__flyer-trigger {
          position: relative;
          overflow: hidden;
          cursor: pointer;
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

        /* Deliberately not .btn-champagne: see the file docstring above —
           the colors below are this page's own copy of each theme's real
           button treatment, not a dependency on that class being defined. */
        .maintenance-page__cta {
          border-radius: 9999px;
          background: linear-gradient(135deg, #f2d894, #b78938);
          color: #18130c;
          border: 0;
          box-shadow: 0 14px 32px rgba(216, 173, 86, 0.35);
          transition: box-shadow 0.15s ease, transform 0.15s ease, background 0.15s ease;
        }
        .maintenance-page__cta:hover,
        .maintenance-page__cta:focus-visible {
          color: #18130c;
          background: linear-gradient(135deg, #ffe5a5, #c99a43);
          transform: translateY(-1px);
        }

        /* classic: flat, high-contrast, no gradients or soft shadows */
        html[data-visual-theme="classic"] .maintenance-page__scrim {
          background-color: rgba(10, 10, 12, 0.6);
        }
        html[data-visual-theme="classic"] .maintenance-page__cta {
          border-radius: 0.25rem;
          background: #5a7ff0;
          color: #fff;
          box-shadow: 0 14px 32px rgba(90, 127, 240, 0.35);
        }
        html[data-visual-theme="classic"] .maintenance-page__cta:hover,
        html[data-visual-theme="classic"] .maintenance-page__cta:focus-visible {
          background: #4666d9;
          color: #fff;
        }
        html[data-visual-theme="classic"] .maintenance-page__flyer-card {
          border-radius: 0.25rem;
        }

        /* riviera: rounded "sticker" look, thick ink border, hard offset shadow */
        html[data-visual-theme="riviera"] .maintenance-page__scrim {
          background-color: rgba(10, 22, 22, 0.55);
        }
        html[data-visual-theme="riviera"] .maintenance-page__cta {
          border-radius: 0.9rem;
          background: linear-gradient(135deg, #ffd166, #ffb703);
          color: #12323b;
          border: 2px solid rgba(18, 50, 59, 0.72);
          box-shadow: 5px 5px 0 rgba(18, 50, 59, 0.22);
        }
        html[data-visual-theme="riviera"] .maintenance-page__cta:hover,
        html[data-visual-theme="riviera"] .maintenance-page__cta:focus-visible {
          color: #fffaf0;
          background: linear-gradient(135deg, #007f83, #2c9f7a);
          transform: translate(-1px, -1px);
        }
        html[data-visual-theme="riviera"] .maintenance-page__flyer-card {
          border-radius: 0.9rem;
          border: 2px solid rgba(18, 50, 59, 0.72);
          box-shadow: 5px 5px 0 rgba(18, 50, 59, 0.22);
        }

        /* cuvée: sharp corners, uppercase small caps, thin gilt border */
        html[data-visual-theme="cuvee"] .maintenance-page__scrim {
          background-color: rgba(6, 18, 14, 0.6);
        }
        html[data-visual-theme="cuvee"] .maintenance-page__cta {
          border-radius: 2px;
          background: linear-gradient(180deg, #ecd28d, #cfa74d);
          color: #2a2107;
          border: 1px solid rgba(138, 100, 20, 0.8);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 0.85rem;
        }
        html[data-visual-theme="cuvee"] .maintenance-page__cta:hover,
        html[data-visual-theme="cuvee"] .maintenance-page__cta:focus-visible {
          background: linear-gradient(180deg, #f5e0a8, #dcb968);
          color: #2a2107;
        }
        html[data-visual-theme="cuvee"] .maintenance-page__flyer-card {
          border-radius: 2px;
          border: 1px solid rgba(138, 100, 20, 0.8);
        }

        /* remuage: clean corporate blue, modest rounding */
        html[data-visual-theme="remuage"] .maintenance-page__scrim {
          background-color: rgba(8, 14, 28, 0.55);
        }
        html[data-visual-theme="remuage"] .maintenance-page__cta {
          border-radius: 9px;
          background: #2144b2;
          color: #fff;
          border: 2px solid #2144b2;
          box-shadow: 0 14px 32px rgba(33, 68, 178, 0.35);
        }
        html[data-visual-theme="remuage"] .maintenance-page__cta:hover,
        html[data-visual-theme="remuage"] .maintenance-page__cta:focus-visible {
          background: #18348d;
          border-color: #fbfcfe;
          color: #fff;
        }
        html[data-visual-theme="remuage"] .maintenance-page__flyer-card {
          border-radius: 9px;
        }
      `}</style>
      <div className="maintenance-page__scrim" aria-hidden="true" />
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
        {facebookUrl && (
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg maintenance-page__cta"
          >
            <i className="bi bi-facebook me-2" aria-hidden="true" />
            {m.maintenance_facebook_cta()}
          </a>
        )}

        {flyerFailed ? (
          <div className="maintenance-page__flyer-card">
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
            className="maintenance-page__flyer-card maintenance-page__flyer-trigger"
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
                // screens once it's free to grow with maxWidth above.
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
