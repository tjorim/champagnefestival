import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import CommunityEvents from "@/components/CommunityEvents";
import { server } from "@/mocks/server";

const BASE_EVENT = {
  edition_id: "edition-bourse",
  description: "Meet collectors from across Belgium.",
  date: "2027-11-21",
  start_time: "10:00",
  end_time: "16:00",
  category: "community",
  registration_required: false,
  registrations_open_from: null,
  max_capacity: null,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderCommunityEvents(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CommunityEvents />
    </QueryClientProvider>,
  );
}

describe("CommunityEvents", () => {
  it("renders validated community editions and ignores unexpected festival results", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-festival",
            edition_type: "festival",
            venue: { name: "Festival Hall" },
            events: [
              {
                ...BASE_EVENT,
                id: "event-festival",
                edition_id: "edition-festival",
                title: "Festival should be ignored",
              },
            ],
          },
          {
            id: "edition-bourse",
            edition_type: "bourse",
            external_partner: "Collector Club",
            venue: { name: "Staf Versluys" },
            events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("heading", { name: "Community Bourse" })).toBeInTheDocument();
    expect(screen.getByText("Meet collectors from across Belgium.")).toBeInTheDocument();
    expect(screen.queryByText("Festival should be ignored")).not.toBeInTheDocument();
  });

  it("orders merged edition types chronologically", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        const isBourse = editionType === "bourse";
        return HttpResponse.json([
          {
            id: isBourse ? "edition-bourse" : "edition-capsule",
            edition_type: isBourse ? "bourse" : "capsule_exchange",
            venue: { name: "Staf Versluys" },
            events: [
              {
                ...BASE_EVENT,
                id: isBourse ? "event-bourse" : "event-capsule",
                edition_id: isBourse ? "edition-bourse" : "edition-capsule",
                title: isBourse ? "Later bourse" : "Earlier capsule exchange",
                date: isBourse ? "2027-11-21" : "2027-10-01",
              },
            ],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    const headings = await screen.findAllByRole("heading", { level: 5 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Capsule Exchange",
      "Community Bourse",
    ]);
  });

  it("renders every active event for an edition, ordered by date and start time", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: { name: "Staf Versluys" },
            events: [
              { ...BASE_EVENT, id: "event-auction", title: "Bourse Auction", start_time: "15:00" },
              { ...BASE_EVENT, id: "event-opening", title: "Bourse Opening", start_time: "10:00" },
            ],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    const titles = await screen.findAllByText(/^Bourse (Opening|Auction)$/);
    expect(titles.map((title) => title.textContent)).toEqual(["Bourse Opening", "Bourse Auction"]);
  });

  it("omits inactive events from the public list", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: { name: "Staf Versluys" },
            events: [
              { ...BASE_EVENT, id: "event-opening", title: "Bourse Opening", active: true },
              { ...BASE_EVENT, id: "event-draft", title: "Draft Tasting", active: false },
            ],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByText("Bourse Opening")).toBeInTheDocument();
    expect(screen.queryByText("Draft Tasting")).not.toBeInTheDocument();
  });

  it("shows an error for malformed successful API responses", async () => {
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json({ edition_type: "bourse", events: "not-an-array" }),
      ),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("rejects events that do not belong to their containing edition", async () => {
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: { name: "Staf Versluys" },
            events: [
              {
                ...BASE_EVENT,
                id: "event-other-edition",
                edition_id: "edition-other",
                title: "Mismatched event",
              },
            ],
          },
        ]),
      ),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("drops an unsafe external contact email without hiding the edition or other events", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            external_contact_name: "Organizer",
            external_contact_email: "organizer@example.com?bcc=other@example.com",
            venue: { name: "Staf Versluys" },
            events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByText("Bourse tasting")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/organizer@example\.com/)).not.toBeInTheDocument();
  });

  it("drops a control-character contact email (header injection) without hiding the edition", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            external_contact_name: "Organizer",
            external_contact_email: "organizer@example.com\r\nBcc:other@example.com",
            venue: { name: "Staf Versluys" },
            events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByText("Bourse tasting")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts legitimate edge-case addresses the backend can return", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType !== "bourse") return HttpResponse.json([]);

        return HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            external_contact_name: "Organizer",
            // Tag addressing (RFC 5321 atext) and an IDNA/punycode-encoded
            // internationalized domain — both valid, ASCII-safe addresses.
            external_contact_email: "bourse+events@xn--nxasmq6b.example",
            venue: { name: "Staf Versluys" },
            events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByText("Bourse tasting")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "bourse+events@xn--nxasmq6b.example" }),
    ).toHaveAttribute("href", "mailto:bourse+events@xn--nxasmq6b.example");
  });

  it("does not hide unrelated community editions when a sibling edition has a malformed contact email", async () => {
    server.use(
      http.get("/api/editions/upcoming", ({ request }) => {
        const editionType = new URL(request.url).searchParams.get("edition_type");
        if (editionType === "bourse") {
          return HttpResponse.json([
            {
              id: "edition-bourse",
              edition_type: "bourse",
              external_contact_name: "Organizer",
              external_contact_email: "organizer@example.com?bcc=other@example.com",
              venue: { name: "Staf Versluys" },
              events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
            },
          ]);
        }
        return HttpResponse.json([
          {
            id: "edition-capsule",
            edition_type: "capsule_exchange",
            venue: { name: "Staf Versluys" },
            events: [
              {
                ...BASE_EVENT,
                id: "event-capsule",
                edition_id: "edition-capsule",
                title: "Capsule swap",
              },
            ],
          },
        ]);
      }),
    );

    renderCommunityEvents();

    expect(await screen.findByText("Bourse tasting")).toBeInTheDocument();
    expect(screen.getByText("Capsule swap")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects editions without an events array", async () => {
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: { name: "Staf Versluys" },
          },
        ]),
      ),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("rejects editions without a valid venue", async () => {
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: null,
            events: [{ ...BASE_EVENT, id: "event-bourse", title: "Bourse tasting" }],
          },
        ]),
      ),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("rejects malformed optional event fields", async () => {
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json([
          {
            id: "edition-bourse",
            edition_type: "bourse",
            venue: { name: "Staf Versluys" },
            events: [
              {
                ...BASE_EVENT,
                id: "event-bourse",
                title: "Bourse tasting",
                max_capacity: "many",
              },
            ],
          },
        ]),
      ),
    );

    renderCommunityEvents();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
