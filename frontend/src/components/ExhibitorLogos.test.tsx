import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import ExhibitorLogoUpload from "./ExhibitorLogoUpload";
import ExhibitorLogoPreview from "./ExhibitorLogoPreview";
import ExhibitorChangeReview from "./admin/ExhibitorChangeReview";

function mount(child: React.ReactNode) {
  setLocale("en", { reload: false });
  return render(<QueryClientProvider client={new QueryClient()}>{child}</QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("posts multipart bytes with authentication and reports a successful upload", async () => {
  let received = false;
  server.use(
    http.post("/api/me/exhibitors/42/logo", async ({ request }) => {
      const body = await request.formData();
      expect((body.get("file") as File).name).toBe("logo.png");
      expect(request.headers.get("authorization")).toBe("Bearer manager");
      expect(request.headers.get("content-type")).toContain("multipart/form-data");
      received = true;
      return HttpResponse.json({ id: "proposal" });
    }),
  );
  const saved = vi.fn();
  mount(
    <ExhibitorLogoUpload
      url="/api/me/exhibitors/42/logo"
      headers={() => ({ Authorization: "Bearer manager" })}
      onSaved={saved}
    />,
  );
  expect(screen.getByRole("button", { name: "Upload logo" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Upload logo"), {
    target: { files: [new File(["image"], "logo.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload logo" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Logo uploaded.");
  expect(received).toBe(true);
  expect(saved).toHaveBeenCalledWith({ id: "proposal" });
});

it("shows errors without retrying or claiming success", async () => {
  let count = 0;
  server.use(
    http.post("/api/exhibitors/42/logo", () => {
      count++;
      return HttpResponse.json({}, { status: 413 });
    }),
  );
  const saved = vi.fn();
  mount(
    <ExhibitorLogoUpload
      admin
      url="/api/exhibitors/42/logo"
      headers={() => ({})}
      onSaved={saved}
    />,
  );
  expect(screen.getByText(/Uploading publishes/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Upload logo"), {
    target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload logo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the format and size");
  expect(count).toBe(1);
  expect(saved).not.toHaveBeenCalled();
});

it("fetches private previews with bearer authentication and revokes the blob on unmount", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-logo");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  server.use(
    http.get("/api/exhibitors/changes/proposal/logo", ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer admin");
      return new HttpResponse("png", { headers: { "Content-Type": "image/png" } });
    }),
  );
  const view = mount(
    <ExhibitorLogoPreview
      url="/api/exhibitors/changes/proposal/logo"
      headers={() => ({ Authorization: "Bearer admin" })}
    />,
  );
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:private-logo");
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:private-logo");
});

it("renders current and proposed logos together in the review", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:proposed");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  server.use(
    http.get("/api/exhibitors/changes", () =>
      HttpResponse.json([
        {
          id: "proposal",
          exhibitor_id: 42,
          exhibitor_name: "House",
          proposed: { image: "private.png" },
          current: { image: "/images/old.svg" },
          status: "pending",
          superseded_fields: [],
          reason: null,
        },
      ]),
    ),
    http.get(
      "/api/exhibitors/changes/proposal/logo",
      () => new HttpResponse("png", { headers: { "Content-Type": "image/png" } }),
    ),
  );
  mount(<ExhibitorChangeReview authHeaders={() => ({})} onDecided={() => {}} />);
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(screen.getByAltText("Current")).toHaveAttribute("src", "/images/old.svg");
  expect(screen.getByAltText("Proposed")).toHaveAttribute("src", "blob:proposed");
});
