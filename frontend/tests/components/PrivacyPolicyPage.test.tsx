import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPolicyPage from "@/components/PrivacyPolicyPage";

const publicSettings = {
  maintenance_mode: false,
  public_email: "privacy@example.com",
  public_phone: "",
  facebook_url: "",
};

vi.mock("@/paraglide/messages", () => ({
  m: {
    privacy_title: () => "Privacy Policy Title",
    privacy_last_updated: () => "Last updated",
  },
}));

vi.mock("@/hooks/useMaintenanceMode", () => ({
  usePublicSettings: () => publicSettings,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(policyResponse: object | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/policies/")) {
        if (!policyResponse) return new Response("not found", { status: 404 });
        return new Response(JSON.stringify(policyResponse));
      }
      return new Response(JSON.stringify({}));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PrivacyPolicyPage />
    </QueryClientProvider>,
  );
}

describe("PrivacyPolicyPage component", () => {
  it("renders the title and the fetched, sanitized policy content", async () => {
    renderPage({
      key: "privacy",
      title: "Privacy Policy",
      locale: "nl",
      html: "<h2>Data Collection</h2><p>We collect minimal data.</p>",
      version_number: 1,
      published_at: "2026-01-15T00:00:00Z",
    });
    expect(screen.getByText("Privacy Policy Title")).toBeInTheDocument();
    await screen.findByText("Data Collection");
    expect(screen.getByText("We collect minimal data.")).toBeInTheDocument();
  });

  it("shows the last updated date derived from published_at", async () => {
    renderPage({
      key: "privacy",
      title: "Privacy Policy",
      locale: "nl",
      html: "<p>Content.</p>",
      version_number: 1,
      published_at: "2026-01-15T00:00:00Z",
    });
    await waitFor(() => expect(screen.getByText(/Last updated/)).toBeInTheDocument());
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders a mailto contact link", async () => {
    renderPage({
      key: "privacy",
      title: "Privacy Policy",
      locale: "nl",
      html: "<p>Content.</p>",
      version_number: 1,
      published_at: "2026-01-15T00:00:00Z",
    });
    const link = await screen.findByRole("link", { name: "privacy@example.com" });
    expect(link).toHaveAttribute("href", "mailto:privacy@example.com");
  });

  it("hides the contact link when the public email is empty", async () => {
    publicSettings.public_email = "";
    renderPage({
      key: "privacy",
      title: "Privacy Policy",
      locale: "nl",
      html: "<p>Content.</p>",
      version_number: 1,
      published_at: "2026-01-15T00:00:00Z",
    });
    await screen.findByText("Content.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    publicSettings.public_email = "privacy@example.com";
  });

  it("shows an error rather than silently rendering nothing when no published version exists", async () => {
    renderPage(null);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
