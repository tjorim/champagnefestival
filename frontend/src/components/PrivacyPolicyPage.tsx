import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
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
    <section id="privacy-policy" className="py-12">
      <div className="site-container mx-auto w-full">
        <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center">
          <div className="w-full site-content-column site-md:w-content-md site-lg:w-content-lg">
            <h1 className="mb-2 text-highlight">{m.privacy_title()}</h1>
            {query.data && (
              <p className="text-subtle mb-6">
                {m.privacy_last_updated()}:{" "}
                {new Date(query.data.published_at).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                })}
              </p>
            )}

            {query.isLoading && (
              <div className="text-center py-12">
                <Spinner role="status" aria-label={m.ui_loading()} />
              </div>
            )}
            {query.isError && <Alert variant="danger">{String(query.error)}</Alert>}

            {query.data && (
              // Trusted: the backend renders and sanitizes this Markdown with
              // an explicit allowlist (app.services.policy_markdown) — the
              // exact same renderer used for the admin preview.
              // A language without content gets the original language; `lang` marks that.
              <div lang={query.data.locale} dangerouslySetInnerHTML={{ __html: query.data.html }} />
            )}

            {settings.public_email && (
              <a href={`mailto:${settings.public_email}`} className="no-underline">
                {settings.public_email}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
