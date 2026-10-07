import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import MyOrganizationsSection from "./MyOrganizationsSection";
import OrganizationChangeReview from "./admin/OrganizationChangeReview";

const texts = {
  website: "https://old.example",
  description_language: "nl",
  description_nl: "Live Dutch",
  description_fr: null,
  description_en: null,
};
const row = { id: 42, name: "House", type: "producer", active: true, ...texts };
const change = {
  id: "proposal",
  organization_id: 42,
  organization_name: "House",
  status: "pending",
  current: texts,
  proposed: {
    website: "https://new.example",
    description_language: "fr",
    description_fr: "Proposed French",
  },
  superseded_fields: [],
  reason: null,
};
function mount(child: React.ReactNode) {
  setLocale("en", { reload: false });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("organization proposals", () => {
  it.each([409, 500])("explains manager submission errors for HTTP %s", async (status) => {
    server.use(
      http.get("/api/me/organizations/42/changes", () => HttpResponse.json([])),
      http.post("/api/me/organizations/42/changes", () =>
        HttpResponse.json({ detail: "Submission failed" }, { status }),
      ),
    );
    mount(<MyOrganizationsSection organizations={[row]} headers={() => ({})} />);
    const edit = await screen.findByRole("button", { name: "Edit website and description" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Website URL"), {
      target: { value: "https://new.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    const alert = await screen.findByRole("alert");
    if (status === 409) expect(alert).toHaveTextContent("Refresh the list before deciding.");
    else
      expect(alert).toHaveTextContent(
        "Unable to complete this request. Please try again or request a new link.",
      );
  });

  it("sends a reason only for rejection even if text was entered before acceptance", async () => {
    server.use(http.get("/api/organizations/changes", () => HttpResponse.json([change])));
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/organizations/changes/proposal/decision", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...change, status: "accepted" });
      }),
    );
    mount(<OrganizationChangeReview authHeaders={() => ({})} onDecided={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Rejection reason (optional)"), {
      target: { value: "Rejection-only text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(bodies).toEqual([{ decision: "accepted", reason: null }]));
  });

  it("only submits changed allowed fields and reuses the ID after an ambiguous failure", async () => {
    server.use(http.get("/api/me/organizations/42/changes", () => HttpResponse.json([])));
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/me/organizations/42/changes", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.error();
      }),
    );
    mount(<MyOrganizationsSection organizations={[row]} headers={() => ({})} />);
    const edit = await screen.findByRole("button", { name: "Edit website and description" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Website URL"), {
      target: { value: "https://new.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toEqual({
      website: "https://new.example",
      submission_id: expect.any(String),
    });
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("shows rejected state and reason, and identifies superseded fields", async () => {
    server.use(
      http.get("/api/me/organizations/42/changes", () =>
        HttpResponse.json([
          {
            ...change,
            status: "rejected",
            reason: "Please correct this",
            superseded_fields: ["website"],
          },
        ]),
      ),
    );
    mount(<MyOrganizationsSection organizations={[row]} headers={() => ({})} />);
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Please correct this")).toBeInTheDocument();
    expect(screen.getByText("Superseded by an admin edit: Website URL")).toBeInTheDocument();
  });

  it("reviews current and proposed text in every language and sends rejection reason", async () => {
    server.use(http.get("/api/organizations/changes", () => HttpResponse.json([change])));
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/organizations/changes/proposal/decision", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...change, status: "rejected" });
      }),
    );
    const onDecided = vi.fn();
    mount(
      <OrganizationChangeReview
        authHeaders={() => ({ Authorization: "Bearer token" })}
        onDecided={onDecided}
      />,
    );
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Current")).toBeInTheDocument();
    expect(within(table).getByText("Proposed")).toBeInTheDocument();
    expect(within(table).getByText("Dutch")).toBeInTheDocument();
    expect(within(table).getByText("French")).toBeInTheDocument();
    expect(within(table).getByText("English")).toBeInTheDocument();
    expect(within(table).getByText("Proposed French")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rejection reason (optional)"), {
      target: { value: "Please correct this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(bodies).toEqual([{ decision: "rejected", reason: "Please correct this" }]),
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalledOnce());
  });
});

it("explains a stale review decision and requires refreshing instead of applying again", async () => {
  server.use(http.get("/api/organizations/changes", () => HttpResponse.json([change])));
  const decision = vi.fn();
  server.use(
    http.post("/api/organizations/changes/proposal/decision", () => {
      decision();
      return HttpResponse.json({ detail: "Already replaced" }, { status: 409 });
    }),
  );
  const onDecided = vi.fn();
  mount(
    <OrganizationChangeReview
      authHeaders={() => ({ Authorization: "Bearer token" })}
      onDecided={onDecided}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This proposal has changed or has already been reviewed. Refresh the list before deciding.",
  );
  expect(decision).toHaveBeenCalledOnce();
  expect(onDecided).not.toHaveBeenCalled();
});
