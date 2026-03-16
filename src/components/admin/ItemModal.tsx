import React, { useEffect, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { m } from "../../paraglide/messages";

export interface ItemDraft {
  id: number;
  name: string;
  image: string;
}

interface ItemModalProps {
  show: boolean;
  initial: ItemDraft | null; // null = new item
  onSave: (item: ItemDraft) => void;
  onHide: () => void;
}

export default function ItemModal({ show, initial, onSave, onHide }: ItemModalProps) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");

  useEffect(() => {
    if (show) {
      setName(initial?.name ?? "");
      setImage(initial?.image ?? "");
    }
  }, [show, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !image.trim()) return;
    onSave({ id: initial?.id ?? Date.now(), name: name.trim(), image: image.trim() });
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {initial ? m.admin_content_edit_item() : m.admin_content_add_item()}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_content_name_placeholder()}</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
              autoFocus
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="text-secondary small">{m.admin_content_image_url_placeholder()}</Form.Label>
            <Form.Control
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>{m.close()}</Button>
          <Button type="submit" variant="warning" size="sm">
            <i className="bi bi-floppy me-1" aria-hidden="true" />
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
