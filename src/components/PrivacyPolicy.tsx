import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';

/**
 * Privacy Policy modal component
 * 
 * A self-contained privacy policy modal component that renders a trigger button
 * and manages its own modal state internally.
 * 
 * Implements:
 * - Modal dialog with scrollable content
 * - Internationalized content
 * - Self-managed open/close state
 * - Accessible modal with proper ARIA attributes
 * - Sections for different aspects of the privacy policy
 * - Responsive layout
 * 
 * @returns {JSX.Element} Button trigger and modal dialog
 */
function PrivacyPolicy() {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button 
        variant="link" 
        onClick={handleShow}
        className="text-white p-0 text-decoration-none footer-link"
      >
        {t('footer.privacy', 'Privacy Policy')}
      </Button>

      <Modal
      show={show}
      onHide={handleClose}
      size="lg"
      aria-labelledby="privacy-policy-title"
      centered
      contentClassName="bg-dark"
      scrollable={true}
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
          onClick={handleClose}
          variant="dark"
          className="bg-brand-gradient modal-close-btn"
        >
          {t('close', 'Close')}
        </Button>
      </Modal.Footer>
    </Modal>
    </>
  );
}

export default PrivacyPolicy;