'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Spinner } from "react-bootstrap";
import { getDictionary, Dictionary } from "@/lib/i18n";

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose, lang }) => {
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  
  // Load dictionary on client side
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const dict = await getDictionary(lang);
        setDictionary(dict);
      } catch (error) {
        console.error("Failed to load dictionary:", error);
      }
    };
    
    if (isOpen) {
      loadDictionary();
    }
  }, [lang, isOpen]);

  // Loading state
  const renderLoading = () => (
    <div className="text-center py-5">
      <Spinner animation="border" role="status" variant="light">
        <span className="visually-hidden">Loading...</span>
      </Spinner>
      <p className="mt-3 text-light">Loading...</p>
    </div>
  );

  return (
    <Modal show={isOpen} onHide={onClose} size="lg" centered contentClassName="bg-dark">
      <Modal.Header closeButton className="border-secondary">
        <Modal.Title>
          {dictionary ? dictionary.privacy.title : 'Privacy Policy'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        {!dictionary ? renderLoading() : (
          <>
            <p className="text-light mb-3">
              {dictionary.privacy.lastUpdated}: {dictionary.privacy.lastUpdatedDate}
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
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="border-secondary">
        <Button
          onClick={onClose}
          variant="dark"
          className="bg-brand-gradient border-0"
        >
          {dictionary ? dictionary.close : 'Close'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;