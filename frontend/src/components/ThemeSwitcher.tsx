import {
  VISUAL_THEMES,
  isVisualThemeVariant,
  type VisualThemeVariant,
} from "@/config/visualThemes";
import "./ThemeSwitcher.css";
import { m } from "@/paraglide/messages";

interface ThemeSwitcherProps {
  variant: VisualThemeVariant;
  onChange: (variant: VisualThemeVariant) => void;
}

/**
 * Preview-only toggle between the full visual designs. Styled by its own fixed-color
 * stylesheet (not the theme stylesheets) so it looks the same regardless of which design is active.
 */
const ThemeSwitcher = ({ variant, onChange }: ThemeSwitcherProps) => {
  return (
    <div className="theme-switcher" role="group" aria-label={m.theme_switcher_group_label()}>
      <select
        className="theme-switcher__select"
        aria-label={m.theme_switcher_select_label()}
        value={variant}
        onChange={(event) => {
          if (isVisualThemeVariant(event.target.value)) onChange(event.target.value);
        }}
      >
        {VISUAL_THEMES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {VISUAL_THEMES.map((option) => (
        <button
          key={option.value}
          className="theme-switcher__option"
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === variant}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default ThemeSwitcher;
