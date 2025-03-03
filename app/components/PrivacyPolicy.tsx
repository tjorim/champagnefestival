'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button } from "react-bootstrap";
import { getDictionary } from "@/lib/i18n";

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose, lang }) => {
  const [dictionary, setDictionary] = useState<any>({});
  
  // Load dictionary on client side
  useEffect(() => {
    const loadDictionary = async () => {
      const dict = await getDictionary(lang);
      setDictionary(dict);
    };
    
    loadDictionary();
  }, [lang]);

  return (
    <Modal show={isOpen} onHide={onClose} size="lg" centered contentClassName="bg-dark">
      <Modal.Header closeButton className="border-secondary">
        <Modal.Title>{dictionary.privacy?.title || 'Privacy Policy'}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        <p className="text-light mb-3">
          {dictionary.privacy?.lastUpdated || 'Last Updated'}: {dictionary.privacy?.lastUpdatedDate || 'March 2025'}
        </p>

        <div className="mt-4">
          <p>
            {dictionary.privacy?.intro || 'This Privacy Policy explains how we collect, use, and protect your personal information when you use our website or services.'}
          </p>

          <hr className="my-4 border-secondary" />

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy?.dataCollection?.title || 'Information We Collect'}
            </h3>
            <p className="text-light">
              {dictionary.privacy?.dataCollection?.content || 'When you use our contact form, we may collect your name, email address, and any message content you provide. This information is only used to respond to your inquiries.'}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy?.dataUse?.title || 'How We Use Your Information'}
            </h3>
            <p className="text-light">
              {dictionary.privacy?.dataUse?.content || 'We use the information you provide through our contact form solely to respond to your inquiries and communicate with you about the Champagne Festival.'}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy?.dataProtection?.title || 'How We Protect Your Information'}
            </h3>
            <p className="text-light">
              {dictionary.privacy?.dataProtection?.content || 'We implement appropriate security measures to protect your personal information from unauthorized access, alteration, or disclosure.'}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy?.cookies?.title || 'Cookies and Similar Technologies'}
            </h3>
            <p className="text-light">
              {dictionary.privacy?.cookies?.content || 'Our website may use cookies to enhance your browsing experience. You can set your browser to refuse cookies, but this may limit some functionality.'}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {dictionary.privacy?.contactUs?.title || 'Contact Us'}
            </h3>
            <p className="text-light">
              {dictionary.privacy?.contactUs?.content || 'If you have any questions about our privacy policy, please contact us using the contact form on our website.'}
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
          {dictionary.close || 'Close'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;