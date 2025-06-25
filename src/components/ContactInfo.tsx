import React from 'react';
import { useTranslation } from 'react-i18next';
import { contactConfig } from '../config/contact';

/**
 * Component to display contact information from configuration
 * Uses react-i18next for translations and contactConfig for data
 */
const ContactInfo: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="contact-info">
      <p className="mb-3">{t('contact.alternativeContact')}</p>

      <div className="mb-2">
        <strong>{t('contact.emailLabel')}: </strong>
        <a
          href={`mailto:${contactConfig.emails.info}`}
          className="text-decoration-none"
          aria-label={t('contact.emailLabel')}
        >
          {contactConfig.emails.info}
        </a>
      </div>

      <div className="mb-2">
        <strong>{t('contact.phoneLabel')}: </strong>
        <a
          href={`tel:${contactConfig.phones.main.replace(/\s/g, '')}`}
          className="text-decoration-none"
          aria-label={t('contact.phoneLabel')}
        >
          {contactConfig.phones.main}
        </a>
      </div>
    </div>
  );
};

export default ContactInfo;