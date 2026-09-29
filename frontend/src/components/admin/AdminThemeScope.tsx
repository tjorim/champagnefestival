import type { ReactNode } from "react";

/** Wrap Base UI Portal children (including backdrops, dialogs and popovers)
 * with this scope so fixed-dark tokens survive rendering outside #admin. */
export function AdminThemeScope({ children }: { children: ReactNode }) {
  return (
    <div data-theme-scope="admin" data-theme-mode="dark" data-bs-theme="dark">
      {children}
    </div>
  );
}
