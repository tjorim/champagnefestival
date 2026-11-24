import { useCallback, useState } from "react";
import { m } from "@/paraglide/messages";
import type { Registration } from "@/types/registration";

interface RegistrationRowActionsOptions {
  isOnline: boolean;
  onCheckIn: (registrationId: string, checkedIn?: boolean) => Promise<boolean | void>;
  onIssueStrap: (registrationId: string) => Promise<void>;
  onRecordPayment: (id: string) => Promise<void>;
  pageRegistrations: Registration[];
  setAttendanceFeedback: (feedback: string) => void;
}

/** The per-row check-in, strap and payment actions, with the ids currently being processed. */
export function useRegistrationRowActions({
  isOnline,
  onCheckIn,
  onIssueStrap,
  onRecordPayment,
  pageRegistrations,
  setAttendanceFeedback,
}: RegistrationRowActionsOptions) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleCheckIn = useCallback(
    async (id: string, checkedIn = true) => {
      if (!isOnline || processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      setAttendanceFeedback("");
      try {
        const succeeded = checkedIn ? await onCheckIn(id) : await onCheckIn(id, false);
        if (succeeded === true) {
          const guest = pageRegistrations.find((record) => record.id === id);
          setAttendanceFeedback(
            `${guest?.person.name ? `${guest.person.name}: ` : ""}${checkedIn ? m.admin_checked_in() : m.admin_not_checked_in()}`,
          );
        }
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isOnline, onCheckIn, pageRegistrations, processingIds, setAttendanceFeedback],
  );

  const handleIssueStrap = useCallback(
    async (id: string) => {
      if (!isOnline || processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      try {
        await onIssueStrap(id);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isOnline, onIssueStrap, processingIds],
  );

  const handleRecordPayment = useCallback(
    async (id: string) => {
      if (processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      try {
        await onRecordPayment(id);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onRecordPayment, processingIds],
  );

  return { processingIds, handleCheckIn, handleIssueStrap, handleRecordPayment };
}
