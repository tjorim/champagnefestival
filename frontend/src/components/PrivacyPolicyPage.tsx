import { useQuery } from "@tanstack/react-query";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { usePublicSettings } from "@/hooks/useMaintenanceMode";
import { queryKeys } from "@/utils/queryKeys";

interface PublicPolicy {
  key: string;
  title: string;
  locale: string;
  html: string;
  version_number: number;
  published_at: string;
}

async function fetchCurrentPolicy(policyKey: string, locale: string): Promise<PublicPolicy> {
  const response = await fetch(
    `/api/policies/${policyKey}/current?locale=${encodeURIComponent(locale)}`,
  );
  if (!response.ok) throw new Error("Could not load the privacy policy.");
  return response.json() as Promise<PublicPolicy>;
}

export default function PrivacyPolicyPage() {
  const settings = usePublicSettings();
  const locale = getLocale();
  const query = useQuery({
    queryKey: queryKeys.policy("privacy", locale),
    queryFn: () => fetchCurrentPolicy("privacy", locale),
    staleTime: 60_000,
  });

  return (
    <section id="privacy-policy" className="tw:py-12">
      <div className="site-container tw:mx-auto tw:w-full">
        <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:justify-center">
          <div className="tw:w-full site-content-column tw:site-md:w-content-md tw:site-lg:w-content-lg">
            <h1 className="tw:mb-2 tw:text-highlight">{m.privacy_title()}</h1>
            {query.data && (
              <p className="tw:text-subtle tw:mb-6">
                {m.privacy_last_updated()}:{" "}
                {new Date(query.data.published_at).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                })}
              </p>
            )}

            {query.isLoading && (
              <div className="tw:text-center tw:py-12">
                <Spinner animation="border" role="status" aria-label="Loading" />
              </div>
            )}
            {query.isError && <Alert variant="danger">{String(query.error)}</Alert>}

            {query.data && (
              // Trusted: the backend renders and sanitizes this Markdown with
              // an explicit allowlist (app.services.policy_markdown) — the
              // exact same renderer used for the admin preview.
              <div dangerouslySetInnerHTML={{ __html: query.data.html }} />
            )}

            {settings.public_email && (
              <a href={`mailto:${settings.public_email}`} className="tw:no-underline">
                {settings.public_email}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
