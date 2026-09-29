import BootstrapModal from "react-bootstrap/Modal";
import type { ComponentProps } from "react";

/** Transitional Bootstrap adapter. Base UI portal content uses AdminThemeScope. */
function AdminModal(props: ComponentProps<typeof BootstrapModal>) {
  return (
    <BootstrapModal
      {...props}
      data-bs-theme="dark"
      data-theme-mode="dark"
      data-theme-scope="admin"
    />
  );
}

export default Object.assign(AdminModal, {
  Header: BootstrapModal.Header,
  Title: BootstrapModal.Title,
  Body: BootstrapModal.Body,
  Footer: BootstrapModal.Footer,
  Dialog: BootstrapModal.Dialog,
});
