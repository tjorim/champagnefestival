import { useQuery } from "@tanstack/react-query";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
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
    <section id="privacy-policy" className="py-5">
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8}>
            <h1 className="mb-2 text-warning">{m.privacy_title()}</h1>
            {query.data && (
              <p className="text-secondary mb-4">
                {m.privacy_last_updated()}:{" "}
                {new Date(query.data.published_at).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                })}
              </p>
            )}

            {query.isLoading && (
              <div className="text-center py-5">
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
              <a href={`mailto:${settings.public_email}`} className="text-decoration-none">
                {settings.public_email}
              </a>
            )}
          </Col>
        </Row>
      </Container>
    </section>
  );
}
