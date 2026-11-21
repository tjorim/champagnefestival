import { useState, type ComponentProps } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

/**
 * One queue row's own write: the button is disabled while it runs, so a repeated
 * click cannot submit twice, and a failure stays with the row, with the button
 * left to try again.
 */
export function QueueRowAction({
  label,
  failure,
  run,
  onDone,
  variant = "outline-success",
}: {
  label: string;
  /** Names the affected entry, so the message still makes sense away from its row. */
  failure: string;
  run: () => Promise<unknown>;
  onDone: () => void;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  // Query reports "pending" a tick late; this flag closes that gap, and stays set after success
  // until the refreshed queue drops or redraws the row, so a settled row cannot be submitted again.
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({
    mutationFn: run,
    onSuccess: onDone,
    onError: () => setSubmitted(false),
    retry: false,
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={variant}
        disabled={submitted}
        aria-busy={mutation.isPending}
        onClick={() => {
          if (submitted) return;
          setSubmitted(true);
          mutation.mutate();
        }}
      >
        {submitted ? m.admin_settings_saving() : label}
      </Button>
      {mutation.isError && (
        <p role="alert" className="mb-0 text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
