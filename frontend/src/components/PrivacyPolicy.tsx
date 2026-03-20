import { useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { m } from "@/paraglide/messages";
import { privacyPolicyConfig } from "@/config/privacyPolicy";

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
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button
        variant="link"
        onClick={handleShow}
        className="text-white p-0 text-decoration-none footer-link"
      >
        {m.footer_privacy()}
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
          <Modal.Title id="privacy-policy-title">{m.privacy_title()}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="modal-body">
          <p className="text-light mb-3">
            {privacyPolicyConfig.getLastUpdated()}: {privacyPolicyConfig.getLastUpdatedDate()}
          </p>

          <div className="mt-4">
            <p>{privacyPolicyConfig.getIntro()}</p>

            <hr className="my-4" />

            {privacyPolicyConfig.sections.map((section, index) => (
              <div key={index} className="mb-4">
                <h3 className="h5 fw-bold mb-2 text-brand">{section.getTitle()}</h3>
                <p className="text-light">{section.getContent()}</p>
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
            {m.close()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PrivacyPolicy;
