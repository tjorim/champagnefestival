import { resetEditionStore } from "../../data/editionStore";
import { resetSharedStore } from "../../data/registrations";
import { analyticsHandlers } from "./analytics";
import { resetAuthScenario } from "./auth";
import { contentHandlers } from "./content";
import { editionHandlers } from "./editions";
import { eventHandlers } from "./events";
import { layoutHandlers } from "./layouts";
import { memberHandlers } from "./members";
import { organizationHandlers } from "./organizations";
import { peopleHandlers } from "./people";
import { productHandlers } from "./products";
import { registrationHandlers } from "./registrations";
import { scenarioHandlers } from "./scenario";
import { resetStateStores } from "./state";
import { stampCardHandlers } from "./stampCards";
import { venueHandlers } from "./venues";
import { volunteerHandlers } from "./volunteers";

/**
 * The authenticated admin API. The groups are concatenated in a fixed order because MSW takes
 * the first match: for example `/api/editions/stats` (analytics) and `/api/events/checkin-stats`
 * must stay ahead of the `/:id` routes of editions and events.
 */
export const adminHandlers = [
  ...stampCardHandlers,
  ...scenarioHandlers,
  ...registrationHandlers,
  ...analyticsHandlers,
  ...peopleHandlers,
  ...memberHandlers,
  ...volunteerHandlers,
  ...organizationHandlers,
  ...editionHandlers,
  ...eventHandlers,
  ...productHandlers,
  ...venueHandlers,
  ...layoutHandlers,
  ...contentHandlers,
];

/** Reset all admin mutable state (useful for tests). */
export function resetAdminStore(): void {
  resetStateStores();
  resetSharedStore();
  resetEditionStore();
  resetAuthScenario();
}
