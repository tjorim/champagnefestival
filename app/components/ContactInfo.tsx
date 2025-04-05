'use client';

import React from 'react';
import { contactConfig } from '@/app/config/contact';
import { useTranslations } from 'next-intl';

/**
 * Component to display contact information from configuration
 */
const ContactInfo: React.FC = () => {
  const t = useTranslations('contact');
  
  return (
    <div className="contact-info">
      <p className="mb-3">{t('alternativeContact')}</p>
      
      <div className="mb-2">
        <strong>{t('emailLabel')}: </strong>
        <a href={`mailto:${contactConfig.emails.info}`} className="text-decoration-none">
          {contactConfig.emails.info}
        </a>
      </div>
      
      <div className="mb-2">
        <strong>{t('phoneLabel')}: </strong>
        <a href={`tel:${contactConfig.phones.main.replace(/\s/g, '')}`} className="text-decoration-none">
          {contactConfig.phones.main}
        </a>
      </div>
    </div>
  );
};

export default ContactInfo;