import { m } from "@/paraglide/messages";

// Preset icons available for floor areas — labels resolved at render time for i18n
export function getAreaIcons(): { value: string; label: string }[] {
  return [
    { value: "bi-shop", label: m.admin_layout_area_icon_stand() },
    { value: "bi-glass-champagne", label: m.admin_layout_area_icon_champagne() },
    { value: "bi-music-note-beamed", label: m.admin_layout_area_icon_music() },
    { value: "bi-cup-hot", label: m.admin_layout_area_icon_catering() },
    { value: "bi-egg-fried", label: m.admin_layout_area_icon_food() },
    { value: "bi-gift", label: m.admin_layout_area_icon_gift() },
    { value: "bi-door-open", label: m.admin_layout_area_icon_entrance() },
    { value: "bi-info-circle", label: m.admin_layout_area_icon_info() },
    { value: "bi-camera", label: m.admin_layout_area_icon_photo() },
    { value: "bi-award", label: m.admin_layout_area_icon_award() },
    { value: "bi-people-fill", label: m.admin_layout_area_icon_meeting() },
    { value: "bi-tools", label: m.admin_layout_area_icon_technical() },
    { value: "bi-star", label: m.admin_layout_area_icon_feature() },
    { value: "bi-bar-chart-line", label: m.admin_layout_area_icon_exhibition() },
  ];
}
