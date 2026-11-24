import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { type PeopleManagementState } from "./usePeopleManagement";

interface DeletePersonDialogProps {
  state: PeopleManagementState;
}

/** Confirms deleting a person. */
export function DeletePersonDialog({ state }: DeletePersonDialogProps) {
  const { handleDeleteConfirm, setDeletingPerson, deleting, deleteError } = state;
  const deletingPerson = state.deletingPerson;
  if (!deletingPerson) return null;
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) setDeletingPerson(null);
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            <Icon icon={TrashIcon} className="me-2" />
            {m.admin_people_delete_title()}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {deleteError && (
            <Alert role="alert" aria-live="assertive" variant="danger">
              {deleteError}
            </Alert>
          )}
          <p>{m.admin_people_delete_confirm({ name: deletingPerson.name })}</p>
          {(deletingPerson.registration_count ?? 0) > 0 && (
            <p className="font-semibold">
              {deletingPerson.registration_count === 1
                ? m.admin_people_delete_registrations_one()
                : m.admin_people_delete_registrations_other({
                    count: deletingPerson.registration_count ?? 0,
                  })}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeletingPerson(null)}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="danger" size="sm" onClick={handleDeleteConfirm} disabled={deleting}>
            {deleting ? <Spinner size="sm" /> : <Icon icon={TrashIcon} />}
            {m.admin_delete()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
