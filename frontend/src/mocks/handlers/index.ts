import { signageHandlers } from "./signage";
import { adminHandlers } from "./admin";
import { liveHandlers } from "./live";
import { publicHandlers } from "./public";

export const handlers = [...signageHandlers, ...publicHandlers, ...adminHandlers, ...liveHandlers];
