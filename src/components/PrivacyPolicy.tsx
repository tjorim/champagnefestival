import React, { useEffect } from 'react';
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import { useTranslation } from 'react-i18next';
import { festivalYear } from '../config/dates';

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Privacy Policy modal component
 * 
 * Displays the festival's privacy policy in a modal dialog
 * Implements:
 * - Modal dialog with scrollable content
 * - Internationalized content
 * - Sections for different aspects of the privacy policy
 * - Responsive layout
 */
const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose }) => {
  // Use react-i18next for translations
  const { t } = useTranslation();
  
  // Handle URL hash updates, scroll position, and background scrolling
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.setAttribute('data-scroll-position', scrollY.toString());
      
      // Update URL hash
      window.history.replaceState(null, '', '#privacy-policy');
      
      // Disable background scrolling without affecting layout
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll'; // Keep scrollbar to prevent layout shift
    } else if (window.location.hash === '#privacy-policy') {
      // Remove hash when closing
      window.history.replaceState(null, '', window.location.pathname);
      
      // Re-enable scrolling and restore position
      const scrollY = parseInt(document.body.getAttribute('data-scroll-position') || '0');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      
      // Restore scroll position
      window.scrollTo(0, scrollY);
    }
  }, [isOpen]);

  return (
    <Modal 
      show={isOpen} 
      onHide={onClose} 
      size="lg" 
      centered={true}
      contentClassName="bg-dark" 
      aria-labelledby="privacy-policy-title" 
      restoreFocus={true}
      scrollable={true}
      enforceFocus={true}
      keyboard={true}
      backdrop={true}
    >
      <Modal.Header closeButton className="border-secondary">
        <Modal.Title id="privacy-policy-title">
          {t('privacy.title', 'Privacy Policy')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        <p className="text-light mb-3">
          {t('privacy.lastUpdated', 'Last Updated')}: {t('privacy.lastUpdatedDate', 'January 1, 2025').replace('2025', festivalYear.toString())}
        </p>

        <div className="mt-4">
          <p>
            {t('privacy.intro', 'Welcome to the Champagne Festival website. This Privacy Policy explains how we collect, use, and protect your personal information when you use our website and services.')}
          </p>

          <hr className="my-4 border-secondary" />

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {t('privacy.dataCollection.title', 'Information We Collect')}
            </h3>
            <p className="text-light">
              {t('privacy.dataCollection.content', 'We collect information that you provide directly to us, such as when you contact us through the form on our website, sign up for our newsletter, or register for our events.')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {t('privacy.dataUse.title', 'How We Use Your Information')}
            </h3>
            <p className="text-light">
              {t('privacy.dataUse.content', 'We use the information we collect to operate, maintain, and provide the features and functionality of our website, to process your requests, and to communicate with you about events and updates.')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {t('privacy.dataProtection.title', 'How We Protect Your Information')}
            </h3>
            <p className="text-light">
              {t('privacy.dataProtection.content', 'We implement appropriate security measures to protect against unauthorized access to or unauthorized alteration, disclosure, or destruction of data.')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {t('privacy.cookies.title', 'Cookies and Tracking Technologies')}
            </h3>
            <p className="text-light">
              {t('privacy.cookies.content', 'We use cookies and similar tracking technologies to track activity on our website and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.')}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="h5 fw-bold mb-2 text-brand">
              {t('privacy.contactUs.title', 'Contact Us')}
            </h3>
            <p className="text-light">
              {t('privacy.contactUs.content', 'If you have any questions about this Privacy Policy, please contact us using the contact form on our website.')}
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
          {t('close', 'Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;