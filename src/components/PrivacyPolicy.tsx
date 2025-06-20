import React, { useEffect } from 'react';
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import { useTranslation } from 'react-i18next';

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

      // Update URL hash to indicate the modal is open
      const originalHash = window.location.hash;
      window.history.replaceState(null, '', '#privacy-policy');
      // Store original hash for restoration later
      document.body.setAttribute('data-original-hash', originalHash);

      // Disable background scrolling without affecting layout
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll'; // Keep scrollbar to prevent layout shift
    } else if (window.location.hash === '#privacy-policy') {
      // Remove hash when closing the modal
      const originalHash = document.body.getAttribute('data-original-hash') || '';
      // Restore original hash if it exists
      if (originalHash) {
        window.history.replaceState(null, '', originalHash);
      }
      // Remove the hash from the URL
      document.body.removeAttribute('data-original-hash');

      // Re-enable scrolling and restore position
      const scrollY = parseInt(document.body.getAttribute('data-scroll-position') || '0');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';

      // Restore scroll position
      window.scrollTo(0, scrollY);
    }
    // Cleanup to always revert global side-effects
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      document.body.removeAttribute('data-scroll-position');
      document.body.removeAttribute('data-original-hash');
      // Also clear the hash if this component is unmounted while the hash is still set
      if (window.location.hash === '#privacy-policy') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
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
      <Modal.Header closeButton>
        <Modal.Title id="privacy-policy-title">
          {t('privacy.title', 'Privacy Policy')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="modal-body">
        <p className="text-light mb-3">
          {t('privacy.lastUpdated', 'Last Updated')}: {t('privacy.lastUpdatedDate', 'January 1, 2025')}
        </p>

        <div className="mt-4">
          <p>
            {t('privacy.intro', 'Welcome to the Champagne Festival website. This Privacy Policy explains how we collect, use, and protect your personal information when you use our website and services.')}
          </p>

          <hr className="my-4" />

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
      <Modal.Footer>
        <Button
          onClick={onClose}
          variant="dark"
          className="bg-brand-gradient"
          style={{ transition: 'opacity 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
        >
          {t('close', 'Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PrivacyPolicy;