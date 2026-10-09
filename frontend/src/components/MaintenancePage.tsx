import { ExternalLinkIcon, ImageIcon, XIcon, ZoomInIcon } from "lucide-react";
import BrandWordmark from "./BrandWordmark";
import { Icon } from "@/components/Icon";
import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages";
import { usePublicSettings } from "@/hooks/useMaintenanceMode";
import "./maintenancePage.css";

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
 * Styled by its own stylesheet (maintenancePage.css) rather than by importing
 * anything from the swappable theme stylesheets (theme-*.css): those assume this page's
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
 * in that stylesheet, so switching themes while this page is showing is visible here
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
 * for. The 900px media query in maintenancePage.css left-aligns the content
 * into that dark half instead, rather than fighting the image's own
 * composition.
 */
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
      <div className="maintenance-page__scrim" aria-hidden="true" />
      <div className="maintenance-page__content">
        <span className="maintenance-page__wordmark">
          <BrandWordmark />
        </span>
        <h1 className="maintenance-page__title">{m.maintenance_title()}</h1>
        <p className="maintenance-page__message">{m.maintenance_message()}</p>
        {facebookUrl && (
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="maintenance-page__cta"
          >
            <Icon icon={ExternalLinkIcon} />
            {m.maintenance_facebook_cta()}
          </a>
        )}

        {flyerFailed ? (
          <div className="maintenance-page__flyer-card">
            <div className="maintenance-page__flyer-placeholder">
              <Icon icon={ImageIcon} className="text-3xl" />
              <span className="maintenance-page__flyer-placeholder-text">
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
              className="maintenance-page__flyer-image"
            />
            <span className="maintenance-page__flyer-overlay" aria-hidden="true">
              <Icon icon={ZoomInIcon} className="text-3xl text-primary-foreground" />
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
          className="maintenance-page__lightbox"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label={m.close()}
            className="maintenance-page__lightbox-close"
          >
            <Icon icon={XIcon} />
          </button>
          <img
            src={FLYER_SRC}
            alt={m.maintenance_flyer_alt()}
            onClick={(event) => event.stopPropagation()}
            className="maintenance-page__lightbox-image"
          />
        </div>
      )}
    </div>
  );
}
