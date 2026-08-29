import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import { m } from "@/paraglide/messages";
import { privacyPolicyConfig } from "@/config/privacyPolicy";
import { usePublicSettings } from "@/hooks/useMaintenanceMode";

export default function PrivacyPolicyPage() {
  const settings = usePublicSettings();
  return (
    <section id="privacy-policy" className="py-5">
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8}>
            <h1 className="mb-2 text-warning">{m.privacy_title()}</h1>
            <p className="text-secondary mb-4">
              {privacyPolicyConfig.getLastUpdated()}: {privacyPolicyConfig.getLastUpdatedDate()}
            </p>

            <p>{privacyPolicyConfig.getIntro()}</p>

            <hr className="my-4" />

            {privacyPolicyConfig.sections.map((section, index) => (
              <div key={index} className="mb-4">
                <h2 className="h5 fw-bold mb-2 text-brand">{section.getTitle()}</h2>
                <p className="text-light">{section.getContent()}</p>
              </div>
            ))}

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
