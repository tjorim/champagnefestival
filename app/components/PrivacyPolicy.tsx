'use client';

import React from 'react';
import { Modal, Button } from "react-bootstrap";
import { Dictionary } from "@/lib/i18n";
import { FESTIVAL_CONFIG } from '@/app/config/dates';

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
  dictionary: Dictionary;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose, dictionary }) => {
  // Modal is only shown when isOpen is true
  // All dictionary data is pre-loaded via props

  return (
    <Modal show={isOpen} onHide={onClose} size="lg" centered contentClassName="bg-dark" aria-labelledby="privacy-policy-title" restoreFocus={true}>
      <Modal.Header closeButton className="border-secondary">
        <Modal.Title id="privacy-policy-title">
          {dictionary.privacy.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        <p className="text-light mb-3">
          {dictionary.privacy.lastUpdated}: {dictionary.privacy.lastUpdatedDate.replace('2025', FESTIVAL_CONFIG.year.toString())}
        </p>

        <div className="mt-4">
          <p>
            {dictionary.privacy.intro}
          </p>

          <hr className="my-4 border-secondary" />

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy.dataCollection.title}
            </h3>
            <p className="text-light">
              {dictionary.privacy.dataCollection.content}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy.dataUse.title}
            </h3>
            <p className="text-light">
              {dictionary.privacy.dataUse.content}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy.dataProtection.title}
            </h3>
            <p className="text-light">
              {dictionary.privacy.dataProtection.content}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy.cookies.title}
            </h3>
            <p className="text-light">
              {dictionary.privacy.cookies.content}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy.contactUs.title}
            </h3>
            <p className="text-light">
              {dictionary.privacy.contactUs.content}
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
          {dictionary.close}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;