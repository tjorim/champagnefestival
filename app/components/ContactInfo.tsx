'use client';

import React from 'react';
import { contactConfig } from '@/app/config/contact';
import { Dictionary } from '@/lib/i18n';

interface ContactInfoProps {
  dictionary: Dictionary;
}

/**
 * Component to display contact information from configuration
 */
const ContactInfo: React.FC<ContactInfoProps> = ({ dictionary }) => {
  return (
    <div className="contact-info">
      {dictionary.contact.alternativeContact && (
        <p className="mb-3">{dictionary.contact.alternativeContact}</p>
      )}
      
      <div className="mb-2">
        <strong>{dictionary.contact.emailLabel}: </strong>
        <a href={`mailto:${contactConfig.emails.info}`} className="text-decoration-none">
          {contactConfig.emails.info}
        </a>
      </div>
      
      <div className="mb-2">
        <strong>{dictionary.contact.phoneLabel}: </strong>
        <a href={`tel:${contactConfig.phones.main.replace(/\s/g, '')}`} className="text-decoration-none">
          {contactConfig.phones.main}
        </a>
      </div>
    </div>
  );
};

export default ContactInfo;