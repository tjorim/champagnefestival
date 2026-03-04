import React from 'react';
import { m } from '../paraglide/messages';
import { contactConfig } from '../config/contact';

/**
 * Component to display contact information from configuration
 */
const ContactInfo: React.FC = () => {
  return (
    <div className="contact-info">
      <p className="mb-3">{m.contact_alternative_contact()}</p>

      <div className="mb-2">
        <strong>{m.contact_email_label()}</strong>{" "}
        <a
          href={`mailto:${contactConfig.emails.info}`}
          className="text-decoration-none"
          aria-label={m.contact_email_label()}
        >
          {contactConfig.emails.info}
        </a>
      </div>

      <div className="mb-2">
        <strong>{m.contact_phone_label()}</strong>{" "}
        <a
          href={`tel:${contactConfig.phones.main.replace(/\s/g, '')}`}
          className="text-decoration-none"
          aria-label={m.contact_phone_label()}
        >
          {contactConfig.phones.main}
        </a>
      </div>
    </div>
  );
};

export default ContactInfo;