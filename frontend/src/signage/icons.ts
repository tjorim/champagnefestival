import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  Ban,
  CigaretteOff,
  CircleAlert,
  Dog,
  DoorOpen,
  GlassWater,
  Info,
  MapPin,
  SquareParking,
  TriangleAlert,
  Utensils,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Shared with the editor's icon picker. Named imports keep unused Lucide icons
// out of the production bundle; uploaded stickers cover other artwork.
export const signageIcons: Readonly<Record<string, LucideIcon | undefined>> = {
  accessibility: Accessibility,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  ban: Ban,
  "cigarette-off": CigaretteOff,
  "circle-alert": CircleAlert,
  dog: Dog,
  "door-open": DoorOpen,
  "glass-water": GlassWater,
  info: Info,
  "map-pin": MapPin,
  "square-parking": SquareParking,
  "triangle-alert": TriangleAlert,
  utensils: Utensils,
  wine: Wine,
};
