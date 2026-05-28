import { adminHandlers } from "./admin";
import { liveHandlers } from "./live";
import { publicHandlers } from "./public";

export const handlers = [...publicHandlers, ...adminHandlers, ...liveHandlers];
