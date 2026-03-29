import { publicHandlers } from "./public";
import { adminHandlers } from "./admin";

export const handlers = [...publicHandlers, ...adminHandlers];
