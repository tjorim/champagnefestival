import { useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDirtyDismiss } from "@/hooks/useDirtyDismiss";
import { m } from "@/paraglide/messages";

export default function AdminEditorDialog({
  title,
  busy,
  dirty,
  onClose,
  children,
  footer,
  size = "lg",
}: {
  title: string;
  busy: boolean;
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  size?: "lg" | "xl";
}) {
  const [open, setOpen] = useState(true);
  const opener = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty,
    busy,
    onDismiss: () => setOpen(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent admin size={size} aria-busy={busy} finalFocus={() => opener.current}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void requestClose()}>
            {m.admin_action_cancel()}
          </Button>
          {footer}
        </DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
