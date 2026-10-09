import { useMemo } from "react";
import { navigationItems, type NavigationItem } from "@/config/navigation";
import { useOtherEventItems } from "@/hooks/useOtherEvents";

/**
 * Site navigation without links to sections that are hidden: "Other events"
 * only appears once there is an upcoming bourse or capsule exchange to show.
 */
export function useNavigationItems(): NavigationItem[] {
  const { items } = useOtherEventItems();
  const hasOtherEvents = items.length > 0;

  return useMemo(
    () => navigationItems.filter((item) => item.href !== "#other-events" || hasOtherEvents),
    [hasOtherEvents],
  );
}
