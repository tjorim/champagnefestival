import React from "react";
import { m } from "@/paraglide/messages";
import { usePublicSettings } from "@/hooks/useMaintenanceMode";

/**
 * Component to display contact information from configuration
 */
const ContactInfo: React.FC = () => {
  const settings = usePublicSettings();
  return (
    <div className="contact-info">
      <p className="mb-3">{m.contact_alternative_contact()}</p>

      {settings.public_email && <div className="mb-2">
        <strong>{m.contact_email_label()}</strong>{" "}
        <a
          href={`mailto:${settings.public_email}`}
          className="text-decoration-none"
          aria-label={m.contact_email_label()}
        >
          {settings.public_email}
        </a>
      </div>}

      {settings.public_phone && <div className="mb-2">
        <strong>{m.contact_phone_label()}</strong>{" "}
        <a
          href={`tel:${settings.public_phone.replace(/\s/g, "")}`}
          className="text-decoration-none"
          aria-label={m.contact_phone_label()}
        >
          {settings.public_phone}
        </a>
      </div>}
    </div>
  );
};

export default ContactInfo;
