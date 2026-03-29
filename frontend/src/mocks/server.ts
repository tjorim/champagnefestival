import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW Node.js server — reuses the same handlers and seed data as the browser
 * worker so that Vitest tests and the dev environment share a single source of
 * truth for mock responses.
 *
 * Usage in tests (via tests/setup.ts):
 *   beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
 *   afterEach(() => server.resetHandlers())
 *   afterAll(() => server.close())
 *
 * Use `server.use(...)` inside individual tests to override handlers for
 * specific scenarios (errors, edge cases, etc.).
 */
export const server = setupServer(...handlers);
