import {
  AccessibilityIcon,
  AwardIcon,
  CameraIcon,
  ChartColumnIcon,
  CoffeeIcon,
  DoorOpenIcon,
  EggFriedIcon,
  GiftIcon,
  InfoIcon,
  MusicIcon,
  StarIcon,
  StoreIcon,
  UsersIcon,
  WineIcon,
  WrenchIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import type { ComponentProps } from "react";

const AREA_ICONS = {
  "bi-shop": StoreIcon,
  "bi-glass-champagne": WineIcon,
  "bi-music-note-beamed": MusicIcon,
  "bi-cup-hot": CoffeeIcon,
  "bi-egg-fried": EggFriedIcon,
  "bi-gift": GiftIcon,
  "bi-door-open": DoorOpenIcon,
  "bi-info-circle": InfoIcon,
  "bi-camera": CameraIcon,
  "bi-award": AwardIcon,
  "bi-people-fill": UsersIcon,
  "bi-tools": WrenchIcon,
  "bi-star": StarIcon,
  "bi-bar-chart-line": ChartColumnIcon,
  "bi-person-standing": AccessibilityIcon,
  "bi-cup": CoffeeIcon,
};

/** Existing API identifiers are data, never CSS classes. Unknown names use a stand. */
export function AreaIcon({
  name,
  ...props
}: Omit<ComponentProps<typeof Icon>, "icon" | "name"> & { name?: string | null }) {
  const icon = Object.hasOwn(AREA_ICONS, name ?? "")
    ? AREA_ICONS[name as keyof typeof AREA_ICONS]
    : StoreIcon;
  return <Icon {...props} icon={icon} />;
}
