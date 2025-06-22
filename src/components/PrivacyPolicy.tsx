import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { privacyPolicyConfig } from '../config/privacyPolicy';

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
          {t(privacyPolicyConfig.lastUpdatedKey, privacyPolicyConfig.fallbackLastUpdated)}: {t(privacyPolicyConfig.lastUpdatedDateKey, privacyPolicyConfig.fallbackLastUpdatedDate)}
        </p>

        <div className="mt-4">
          <p>
            {t(privacyPolicyConfig.introKey, privacyPolicyConfig.fallbackIntro)}
          </p>

          <hr className="my-4" />

          {privacyPolicyConfig.sections.map((section, index) => (
            <div key={index} className="mb-4">
              <h3 className="h5 fw-bold mb-2 text-brand">
                {t(section.titleKey, section.fallbackTitle)}
              </h3>
              <p className="text-light">
                {t(section.contentKey, section.fallbackContent)}
              </p>
            </div>
          ))}
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