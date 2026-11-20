import { jsonResponse } from "../response";
import { http } from "msw/http";
import { signageHandlers } from "./signage";
import { adminHandlers } from "./admin";
import { liveHandlers } from "./live";
import { publicHandlers } from "./public";

export const handlers = [
  http.get("/api/me/membership", () =>
    jsonResponse<import("@/api-types").MembershipSummary>({ state: "inactive" }),
  ),
  ...signageHandlers,
  ...publicHandlers,
  ...adminHandlers,
  ...liveHandlers,
];
