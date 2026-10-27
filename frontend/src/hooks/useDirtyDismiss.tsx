import { useCallback, useState } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { m } from "@/paraglide/messages";

/**
 * The one dismissal policy for admin create/edit editors.
 *
 * Every way of leaving an editor (Escape, the backdrop, a close button, an
 * explicit Cancel) goes through `requestClose`. A pristine draft closes at
 * once; a dirty one asks "Discard changes?" first, and "Keep editing" leaves
 * the editor and every field exactly as it was. While a save is running
 * (`busy`) the editor cannot be dismissed. Successful saves call the editor's
 * own close handler directly, so they never prompt.
 *
 * The caller renders `confirmDialog` inside its dialog so focus returns to the
 * field that had it when the prompt opened.
 */
export function useDirtyDismiss({
  dirty,
  busy = false,
  onDismiss,
}: {
  dirty: boolean;
  busy?: boolean;
  onDismiss: () => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
  const requestClose = useCallback(async () => {
    if (busy) return;
    if (
      dirty &&
      !(await confirm({
        title: m.admin_editor_discard_title(),
        body: m.admin_editor_discard_body(),
        confirmLabel: m.admin_editor_discard_changes(),
        cancelLabel: m.admin_editor_keep_editing(),
        errorFallback: m.admin_editor_discard_error(),
        variant: "warning",
        icon: "exclamation-triangle",
      }))
    )
      return;
    onDismiss();
  }, [busy, confirm, dirty, onDismiss]);
  return { requestClose, confirmDialog };
}

/**
 * The record an editor was opened on, frozen for the editing session.
 *
 * Editors seed their form from a record that the parent keeps fresh from
 * server queries. Following those refreshes would overwrite fields the user
 * has not touched and quietly move the "clean" baseline under a draft, so the
 * record is captured when a session starts (`show` turning on, or `sessionKey`
 * changing while shown). `sessionId` changes on every start, including a reopen
 * of the same record, so the editor can reseed its form from the capture. The
 * last record stays available while the dialog animates closed.
 */
export function useEditorSession<T>(show: boolean, sessionKey: string, live: T) {
  const [session, setSession] = useState({ show, sessionKey, record: live, sessionId: 0 });
  if (show !== session.show || sessionKey !== session.sessionKey) {
    setSession({
      show,
      sessionKey,
      record: show ? live : session.record,
      sessionId: show ? session.sessionId + 1 : session.sessionId,
    });
  }
  return { record: session.record, sessionId: session.sessionId };
}

/** Whether a draft differs from its baseline; both are plain serialisable form values. */
export function isDraftDirty(values: unknown, baseline: unknown): boolean {
  return JSON.stringify(values) !== JSON.stringify(baseline);
}
