import {
  VISUAL_THEMES,
  isVisualThemeVariant,
  type VisualThemeVariant,
} from "@/config/visualThemes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import "./ThemeSwitcher.css";
import { m } from "@/paraglide/messages";

interface ThemeSwitcherProps {
  variant: VisualThemeVariant;
  onChange: (variant: VisualThemeVariant) => void;
}

/**
 * Preview-only selector between the visual designs. Shared toggles use the active
 * theme; the compact mobile select keeps its existing fixed preview styling.
 */
const ThemeSwitcher = ({ variant, onChange }: ThemeSwitcherProps) => {
  return (
    <div className="theme-switcher">
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
      <ToggleGroup
        variant="outline"
        size="sm"
        className="hidden site-sm:flex"
        aria-label={m.theme_switcher_group_label()}
        value={[variant]}
        onValueChange={(values) => {
          if (isVisualThemeVariant(values[0])) onChange(values[0]);
        }}
      >
        {VISUAL_THEMES.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
};

export default ThemeSwitcher;
