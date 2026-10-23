import {
  AccessibilityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BanIcon,
  CigaretteOffIcon,
  CircleAlertIcon,
  DogIcon,
  DoorOpenIcon,
  GlassWaterIcon,
  InfoIcon,
  MapPinIcon,
  SquareParkingIcon,
  TriangleAlertIcon,
  UtensilsIcon,
  WineIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Shared with the editor's icon picker. Named imports keep unused Lucide icons
// out of the production bundle; uploaded stickers cover other artwork.
export const signageIcons: Readonly<Record<string, LucideIcon | undefined>> = {
  accessibility: AccessibilityIcon,
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  ban: BanIcon,
  "cigarette-off": CigaretteOffIcon,
  "circle-alert": CircleAlertIcon,
  dog: DogIcon,
  "door-open": DoorOpenIcon,
  "glass-water": GlassWaterIcon,
  info: InfoIcon,
  "map-pin": MapPinIcon,
  "square-parking": SquareParkingIcon,
  "triangle-alert": TriangleAlertIcon,
  utensils: UtensilsIcon,
  wine: WineIcon,
};
