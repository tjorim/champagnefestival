import { useEffect } from "react";

/**
 * Marks the current page as noindex while mounted, restoring the previous
 * `<meta name="robots">` state on unmount. The static index.html shell already
 * ships `content="index, follow"` for the public site; staff-only routes
 * (admin, check-in, etc.) override it here since they're just client-side
 * routes within the same SPA shell, not separate documents a crawler could
 * otherwise be told not to fetch via a per-route HTTP header.
 */
export function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const existed = meta !== null;
    const previousContent = meta?.getAttribute("content") ?? null;

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    return () => {
      if (!meta) return;
      if (!existed) {
        meta.remove();
      } else if (previousContent !== null) {
        meta.setAttribute("content", previousContent);
      }
    };
  }, []);
}
