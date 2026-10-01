import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminTextarea,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import type { Event, EventFormData } from "@/types/event";
import type { Edition } from "./editionTypes";

interface EventModalProps {
  show: boolean;
  edition: Edition;
  initial: Event | null;
  onSave: (formData: EventFormData) => void;
  onHide: () => void;
}

const EMPTY_FORM: EventFormData = {
  editionId: "",
  title: "",
  description: "",
  date: "",
  startTime: "",
  endTime: "",
  category: "other",
  registrationRequired: false,
  registrationsOpenFrom: "",
  registrationsCloseAt: "",
  sortOrder: "",
  active: true,
};

export default function EventModal({ show, edition, initial, onSave, onHide }: EventModalProps) {
  const isFestival = edition.editionType === "festival";
  const derivedStandaloneDate = useMemo(
    () => edition.dates[0] ?? initial?.date ?? "",
    [edition.dates, initial?.date],
  );

  // `useForm` re-applies its `defaultValues` on every render (a layout effect in
  // @tanstack/react-form with no dependency array). Feeding it a static template
  // while hydrating through `form.reset(record)` makes the two fight: the reset
  // rewrites the stored defaults, the next render sees them differ from the
  // template and wipes the record back out. Deriving the defaults from `initial`
  // keeps both sides in agreement, so the record survives.
  const defaultValues = useMemo(
    (): EventFormData =>
      initial
        ? {
            editionId: initial.editionId,
            title: initial.title,
            description: initial.description,
            date: initial.date,
            startTime: initial.startTime,
            endTime: initial.endTime ?? "",
            category: initial.category,
            registrationRequired: initial.registrationRequired,
            registrationsOpenFrom: initial.registrationsOpenFrom ?? "",
            registrationsCloseAt: initial.registrationsCloseAt ?? "",
            sortOrder: initial.sortOrder != null ? String(initial.sortOrder) : "",
            active: initial.active,
          }
        : {
            ...EMPTY_FORM,
            editionId: edition.id,
            date: isFestival ? (edition.dates[0] ?? "") : derivedStandaloneDate,
          },
    [derivedStandaloneDate, edition.id, edition.dates, initial, isFestival],
  );

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const submitDate = isFestival ? value.date : value.date || derivedStandaloneDate;
      onSave({ ...value, date: submitDate });
    },
  });

  // Seed a new editing session, not a refreshed object for the same record.
  // Explicit reset is needed on reopen because touched forms retain their draft.
  const target = { show, editionId: edition.id, eventId: initial?.id ?? null };
  const [previousTarget, setPreviousTarget] = useState(target);
  if (
    show !== previousTarget.show ||
    target.editionId !== previousTarget.editionId ||
    target.eventId !== previousTarget.eventId
  ) {
    setPreviousTarget(target);
    if (show) form.reset(defaultValues);
  }

  // Keep standalone date field in sync with derived date
  useEffect(() => {
    if (!isFestival && derivedStandaloneDate) {
      form.setFieldValue("date", derivedStandaloneDate);
    }
  }, [derivedStandaloneDate, isFestival, form]);

  const dateValue = useSelector(form.atom, (s) => s.values.date);
  const registrationRequired = useSelector(form.atom, (s) => s.values.registrationRequired);

  const effectiveDate = isFestival ? dateValue : dateValue || derivedStandaloneDate;

  const isEdit = !!initial;

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? m.admin_content_edition_edit_event() : m.admin_content_edition_add_event()}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          noValidate
        >
          <DialogBody>
            <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-4">
              <AdminField
                controlId="event-title"
                className="tw:min-w-60 tw:grow-2 tw:shrink-1 tw:basis-60"
              >
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_content_event_title()}
                </AdminLabel>
                <form.Field
                  name="title"
                  validators={[
                    {
                      run: ({ value }) =>
                        !value?.trim() ? m.admin_event_title_required() : undefined,
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminInput
                          size="sm"
                          className="tw:bg-muted tw:text-content tw:border-input"
                          autoFocus
                          value={field.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={showErr}
                        />
                        {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                      </>
                    );
                  }}
                </form.Field>
              </AdminField>
              <AdminField
                controlId="event-category"
                className="tw:min-w-40 tw:grow-1 tw:shrink-1 tw:basis-40"
              >
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_content_event_category()}
                </AdminLabel>
                <form.Field name="category">
                  {(field) => (
                    <AdminInput
                      size="sm"
                      className="tw:bg-muted tw:text-content tw:border-input"
                      placeholder={m.admin_event_category_placeholder()}
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
            </div>

            <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-4">
              <AdminField controlId="event-date" className="tw:max-w-45">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_event_date()}
                </AdminLabel>
                <form.Field
                  name="date"
                  validators={[
                    {
                      run: ({ value }) => (!value ? m.admin_event_date_required() : undefined),
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminInput
                          type="date"
                          size="sm"
                          className="tw:bg-muted tw:text-content tw:border-input"
                          readOnly={!isFestival && Boolean(derivedStandaloneDate)}
                          aria-invalid={showErr}
                          value={effectiveDate}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                        {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                      </>
                    );
                  }}
                </form.Field>
              </AdminField>
              <AdminField controlId="event-start-time" className="tw:max-w-35">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_content_event_start_time()}
                </AdminLabel>
                <form.Field
                  name="startTime"
                  validators={[
                    {
                      run: ({ value }) =>
                        !value ? m.admin_event_start_time_required() : undefined,
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminInput
                          type="time"
                          size="sm"
                          className="tw:bg-muted tw:text-content tw:border-input"
                          value={field.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={showErr}
                        />
                        {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                      </>
                    );
                  }}
                </form.Field>
              </AdminField>
              <AdminField controlId="event-end-time" className="tw:max-w-35">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_content_event_end_time()}
                </AdminLabel>
                <form.Field name="endTime">
                  {(field) => (
                    <AdminInput
                      type="time"
                      size="sm"
                      className="tw:bg-muted tw:text-content tw:border-input"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
            </div>

            <AdminField controlId="event-description" className="tw:mb-4">
              <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                {m.admin_content_event_description()}
              </AdminLabel>
              <form.Field name="description">
                {(field) => (
                  <AdminTextarea
                    size="sm"
                    rows={2}
                    className="tw:bg-muted tw:text-content tw:border-input"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </AdminField>

            <form.Field name="registrationRequired">
              {(field) => (
                <AdminCheck
                  type="checkbox"
                  id="modal-event-registration"
                  label={m.admin_content_event_requires_registration()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                  className="tw:text-content tw:mb-2"
                />
              )}
            </form.Field>
            {registrationRequired && (
              <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-2">
                <AdminField className="tw:max-w-70" controlId="event-registrations-open-from">
                  <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                    {m.admin_content_edition_registration_opens()}
                  </AdminLabel>
                  <form.Field name="registrationsOpenFrom">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className="tw:bg-muted tw:text-content tw:border-input"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </AdminField>
                <AdminField className="tw:max-w-70" controlId="event-registrations-close-at">
                  <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                    {m.admin_content_edition_registration_closes()}
                  </AdminLabel>
                  <form.Field name="registrationsCloseAt">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className="tw:bg-muted tw:text-content tw:border-input"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </AdminField>
              </div>
            )}

            {!isFestival && (
              <div className="tw:text-subtle tw:text-sm tw:mt-2">
                {m.admin_event_standalone_help()}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onHide}>
              {m.close()}
            </Button>
            <Button type="submit" variant="warning" size="sm">
              <Icon icon={SaveIcon} />
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
