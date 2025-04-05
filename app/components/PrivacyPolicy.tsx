'use client';

import React from 'react';
import { Modal, Button } from "react-bootstrap";
import { useTranslations } from 'next-intl';
import { festivalYear } from '@/app/config/dates';

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose }) => {
  // Use next-intl for translations
  const t = useTranslations();
  const tPrivacy = useTranslations('privacy');

  return (
    <Modal show={isOpen} onHide={onClose} size="lg" centered contentClassName="bg-dark" aria-labelledby="privacy-policy-title" restoreFocus={true}>
      <Modal.Header closeButton className="border-secondary">
        <Modal.Title id="privacy-policy-title">
          {tPrivacy('title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        <p className="text-light mb-3">
          {tPrivacy('lastUpdated')}: {tPrivacy('lastUpdatedDate').replace('2025', festivalYear.toString())}
        </p>

        <div className="mt-4">
          <p>
            {tPrivacy('intro')}
          </p>

          <hr className="my-4 border-secondary" />

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {tPrivacy('dataCollection.title')}
            </h3>
            <p className="text-light">
              {tPrivacy('dataCollection.content')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {tPrivacy('dataUse.title')}
            </h3>
            <p className="text-light">
              {tPrivacy('dataUse.content')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {tPrivacy('dataProtection.title')}
            </h3>
            <p className="text-light">
              {tPrivacy('dataProtection.content')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {tPrivacy('cookies.title')}
            </h3>
            <p className="text-light">
              {tPrivacy('cookies.content')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {tPrivacy('contactUs.title')}
            </h3>
            <p className="text-light">
              {tPrivacy('contactUs.content')}
            </p>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="border-secondary">
        <Button
          onClick={onClose}
          variant="dark"
          className="bg-brand-gradient border-0"
        >
          {t('close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;