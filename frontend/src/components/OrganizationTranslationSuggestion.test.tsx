import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { setLocale } from "@/paraglide/runtime";
import OrganizationTranslationSuggestion from "./OrganizationTranslationSuggestion";
import MyOrganizationsSection from "./MyOrganizationsSection";
import ItemModal from "./admin/ItemModal";

const url = "/api/organizations/translation";
const props = {
  url,
  headers: () => ({}),
  source: "nl",
  target: "en",
  text: "Hallo",
  targetText: "",
  onDraft: vi.fn(),
};
function mount(child: React.ReactNode) {
  setLocale("en", { reload: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}
function capabilities(languages = ["nl", "en"]) {
  server.use(http.get(url, () => HttpResponse.json({ languages })));
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([{ languages: [] }, { languages: ["nl", "fr"] }])(
  "hides unavailable language pairs: %j",
  async ({ languages }) => {
    let called = false;
    server.use(
      http.get(url, () => {
        called = true;
        return HttpResponse.json({ languages });
      }),
    );
    mount(<OrganizationTranslationSuggestion {...props} />);
    await waitFor(() => expect(called).toBe(true));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);

it("preserves an existing translation", async () => {
  capabilities();
  mount(<OrganizationTranslationSuggestion {...props} targetText="Manually written" />);
  expect(await screen.findByRole("button", { name: "Suggest translation" })).toBeDisabled();
});

it("shows a cold-start pending state and sends only a stateless draft request", async () => {
  capabilities();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const requests: unknown[] = [];
  server.use(
    http.post(url, async ({ request }) => {
      requests.push(await request.json());
      await waiting;
      return HttpResponse.json({ text: "Hello" });
    }),
  );
  mount(<OrganizationTranslationSuggestion {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Suggest translation" }));
  expect(await screen.findByRole("button", { name: "Translating…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("90 seconds");
  finish();
  await waitFor(() => expect(props.onDraft).toHaveBeenCalledWith("Hello"));
  expect(requests).toEqual([{ text: "Hallo", source: "nl", target: "en" }]);
});

it.each([503, 504, 429])(
  "explains HTTP %s without applying a draft or retrying",
  async (status) => {
    capabilities();
    const requests = vi.fn(() => HttpResponse.json({}, { status }));
    server.use(http.post(url, requests));
    mount(<OrganizationTranslationSuggestion {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Suggest translation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 429 ? "ten minutes" : "write the translation yourself",
    );
    expect(props.onDraft).not.toHaveBeenCalled();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Suggest translation" })).toBeEnabled();
  },
);

it("discards a result when the user edits during translation", async () => {
  capabilities();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  server.use(
    http.post(url, async () => {
      await waiting;
      return HttpResponse.json({ text: "Hello" });
    }),
  );
  const client = new QueryClient();
  const tree = (text: string) => (
    <QueryClientProvider client={client}>
      <OrganizationTranslationSuggestion {...props} targetText={text} />
    </QueryClientProvider>
  );
  setLocale("en", { reload: false });
  const view = render(tree(""));
  fireEvent.click(await screen.findByRole("button", { name: "Suggest translation" }));
  view.rerender(tree("My own translation"));
  finish();
  expect(await screen.findByRole("alert")).toHaveTextContent("preserve your edits");
  expect(props.onDraft).not.toHaveBeenCalled();
});

it("fills the manager form but submits only after review and editing", async () => {
  const submissions: Record<string, unknown>[] = [];
  server.use(
    http.get("/api/me/organizations/42/changes", () => HttpResponse.json([])),
    http.get("/api/me/organizations/42/translation", () =>
      HttpResponse.json({ languages: ["nl", "en"] }),
    ),
    http.post("/api/me/organizations/42/translation", () => HttpResponse.json({ text: "Hello" })),
    http.post("/api/me/organizations/42/changes", async ({ request }) => {
      submissions.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({});
    }),
  );
  mount(
    <MyOrganizationsSection
      organizations={[
        {
          id: 42,
          name: "House",
          type: "producer",
          active: true,
          website: "",
          description_language: "nl",
          description_nl: "Hallo",
        },
      ]}
      headers={() => ({})}
    />,
  );
  const edit = await screen.findByRole("button", { name: "Edit website and description" });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  fireEvent.click(await screen.findByRole("button", { name: "Suggest translation" }));
  await waitFor(() => expect(screen.getByLabelText("English")).toHaveValue("Hello"));
  expect(submissions).toEqual([]);
  fireEvent.change(screen.getByLabelText("English"), {
    target: { value: "Reviewed Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0]?.description_en).toBe("Reviewed Hello");
});

it("fills the admin form and saves only after manual review", async () => {
  capabilities();
  server.use(http.post(url, () => HttpResponse.json({ text: "Hello" })));
  const save = vi.fn();
  mount(
    <ItemModal
      show
      initial={{
        id: 42,
        name: "House",
        image: "/logos/house.png",
        description_language: "nl",
        description_nl: "Hallo",
      }}
      authHeaders={() => ({})}
      onSave={save}
      onHide={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Suggest translation" }));
  await waitFor(() => expect(screen.getByLabelText("English")).toHaveValue("Hello"));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("English"), { target: { value: "Reviewed draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ description_en: "Reviewed draft" }),
    ),
  );
});
