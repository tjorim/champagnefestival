import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { useHydrated } from "@/hooks/useHydrated";

function Probe() {
  return <span>{useHydrated() ? "client" : "server"}</span>;
}
it("keeps server markup empty of client-only content and enables it on the client", () => {
  expect(renderToString(<Probe />)).toBe("<span>server</span>");
  render(<Probe />);
  expect(screen.getByText("client")).toBeVisible();
});
