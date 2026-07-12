import type { VisualThemeVariant } from "@/hooks/useVisualTheme";

interface ThemeSwitcherProps {
  variant: VisualThemeVariant;
  onChange: (variant: VisualThemeVariant) => void;
}

const OPTIONS: Array<{ value: VisualThemeVariant; label: string }> = [
  { value: "refresh", label: "New" },
  { value: "classic", label: "Classic" },
  { value: "riviera", label: "Riviera" },
];

/**
 * Preview-only toggle between the full visual designs. Styled with inline styles
 * (not the theme stylesheets) so it looks the same regardless of which design is active.
 */
const ThemeSwitcher = ({ variant, onChange }: ThemeSwitcherProps) => {
  return (
    <div
      role="group"
      aria-label="Visual design preview switcher"
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        zIndex: 2000,
        display: "flex",
        gap: "0.35rem",
        padding: "0.35rem",
        borderRadius: "999px",
        background: "rgba(20, 18, 15, 0.92)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {OPTIONS.map((option) => {
        const isActive = option.value === variant;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            style={{
              padding: "0.4rem 0.9rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: isActive ? "#18130c" : "#fbf6ec",
              background: isActive ? "#d8ad56" : "transparent",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              borderRadius: "999px",
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeSwitcher;
