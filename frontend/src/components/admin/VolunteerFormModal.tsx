import { AdminEmptyState } from "./AdminEmptyState";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_LABEL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { SaveIcon, ThumbsUpIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useLayoutEffect, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
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
import { isDraftDirty, useDirtyDismiss, useEditorSession } from "@/hooks/useDirtyDismiss";
import { m } from "@/paraglide/messages";
import { usePersonFieldErrors } from "@/hooks/usePersonFieldErrors";
import { apiErrorMessage } from "@/utils/apiErrors";
import type { Person, VolunteerHelpPeriod } from "@/types/person";
import { AdminAddButton } from "./RowActions";

interface VolunteerFormModalProps {
  show: boolean;
  volunteer: Person | null;
  onSave: (data: VolunteerFormData) => Promise<void>;
  onHide: () => void;
}

export interface VolunteerHelpPeriodFormData {
  firstHelpDay: string;
  lastHelpDay: string | null;
  notes: string;
}

export interface VolunteerFormData {
  name: string;
  address: string;
  nationalRegisterNumber: string;
  eidDocumentNumber: string;
  helpPeriods: VolunteerHelpPeriodFormData[];
}

function emptyPeriod(): VolunteerHelpPeriodFormData {
  return { firstHelpDay: "", lastHelpDay: null, notes: "" };
}

function mapPeriod(period: VolunteerHelpPeriod): VolunteerHelpPeriodFormData {
  return {
    firstHelpDay: period.firstHelpDay,
    lastHelpDay: period.lastHelpDay,
    notes: period.notes,
  };
}

export default function VolunteerFormModal({
  show,
  volunteer,
  onSave,
  onHide,
}: VolunteerFormModalProps) {
  const fieldErrors = usePersonFieldErrors("volunteer");
  const [error, setError] = useState<string | null>(null);
  // The record as it was when the editor opened, so a background refresh neither
  // rewrites untouched fields nor moves the baseline for the discard prompt.
  const { record, sessionId } = useEditorSession(show, volunteer?.id ?? "", volunteer);
  const isEdit = record != null;

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    (): VolunteerFormData =>
      record
        ? {
            name: record.name,
            address: record.address ?? "",
            nationalRegisterNumber: record.nationalRegisterNumber ?? "",
            eidDocumentNumber: record.eidDocumentNumber ?? "",
            helpPeriods: record.helpPeriods.map(mapPeriod),
          }
        : {
            name: "",
            address: "",
            nationalRegisterNumber: "",
            eidDocumentNumber: "",
            helpPeriods: [],
          },
    [record],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const normalized = value.helpPeriods.map((period) => ({
        firstHelpDay: period.firstHelpDay,
        lastHelpDay: period.lastHelpDay?.trim() ? period.lastHelpDay : null,
        notes: period.notes.trim(),
      }));

      if (normalized.some((period) => !period.firstHelpDay)) {
        setError(m.admin_volunteers_validation_help_period_required());
        return;
      }

      if (
        normalized.some(
          (period) => period.lastHelpDay != null && period.firstHelpDay > period.lastHelpDay,
        )
      ) {
        setError(m.admin_volunteers_validation_help_period_range());
        return;
      }

      setError(null);
      fieldErrors.clear();
      try {
        await onSave({
          name: value.name.trim(),
          address: value.address.trim(),
          nationalRegisterNumber: value.nationalRegisterNumber.trim(),
          eidDocumentNumber: value.eidDocumentNumber.trim(),
          helpPeriods: normalized,
        });
        onHide();
      } catch (err) {
        fieldErrors.capture(err);
        setError(
          apiErrorMessage(
            err,
            isEdit ? m.admin_volunteers_error_update() : m.admin_volunteers_error_create(),
          ),
        );
      }
    },
  });

  // Every editing session starts from the record again, discarding edits that were
  // abandoned by closing the modal: `defaultValues` alone cannot do that because the
  // library keeps the fields a user has touched.
  useLayoutEffect(() => {
    if (show) form.reset(defaultValues);
    // `sessionId` covers reopening the same record, which leaves `defaultValues` unchanged.
  }, [show, sessionId, form, defaultValues]);
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setError(null);
      fieldErrors.clear();
    }
  }

  const nameValue = useSelector(form.atom, (s) => s.values.name);
  const helpPeriods = useSelector(form.atom, (s) => s.values.helpPeriods);
  const isSubmitting = useSelector(form.atom, (s) => s.isSubmitting);
  const values = useSelector(form.atom, (s) => s.values);
  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty: isDraftDirty(values, defaultValues),
    busy: isSubmitting,
    onDismiss: onHide,
  });

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={ThumbsUpIcon} className="me-2" />
            {isEdit ? m.admin_volunteers_edit_title() : m.admin_volunteers_create_title()}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogBody>
            {error && (
              <Alert variant="danger" className="py-2 text-sm" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <p className="mb-4 text-sm text-subtle">{m.admin_volunteers_optional_details()}</p>
            <form.Field name="name">
              {(field) => (
                <AdminField
                  className="mb-4"
                  controlId="volunteer-name"
                  serverError={fieldErrors.field("name")}
                >
                  <AdminLabel className={ADMIN_LABEL_CLASS}>{m.registration_name()} *</AdminLabel>
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => {
                      fieldErrors.clearField("name");
                      field.handleChange(e.target.value);
                    }}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                    required
                    maxLength={200}
                  />
                </AdminField>
              )}
            </form.Field>

            <form.Field name="address">
              {(field) => (
                <AdminField
                  className="mb-4"
                  controlId="volunteer-address"
                  serverError={fieldErrors.field("address")}
                >
                  <AdminLabel className={ADMIN_LABEL_CLASS}>
                    {m.admin_people_address_label()}
                  </AdminLabel>
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => {
                      fieldErrors.clearField("address");
                      field.handleChange(e.target.value);
                    }}
                    onBlur={field.handleBlur}
                    className={ADMIN_CONTROL_CLASS}
                    maxLength={300}
                  />
                </AdminField>
              )}
            </form.Field>

            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter mb-4">
              <div className="w-full site-md:w-6/12">
                <form.Field name="nationalRegisterNumber">
                  {(field) => (
                    <AdminField
                      controlId="volunteer-national-register-number"
                      serverError={fieldErrors.field("national_register_number")}
                    >
                      <AdminLabel className={ADMIN_LABEL_CLASS}>
                        {m.admin_people_national_register_number_label()}
                      </AdminLabel>
                      <AdminInput
                        type="text"
                        value={field.value}
                        onChange={(e) => {
                          fieldErrors.clearField("national_register_number");
                          field.handleChange(e.target.value.slice(0, 20));
                        }}
                        onBlur={field.handleBlur}
                        className={ADMIN_CONTROL_CLASS}
                        maxLength={20}
                      />
                    </AdminField>
                  )}
                </form.Field>
              </div>
              <div className="w-full site-md:w-6/12">
                <form.Field name="eidDocumentNumber">
                  {(field) => (
                    <AdminField
                      controlId="volunteer-eid-document-number"
                      serverError={fieldErrors.field("eid_document_number")}
                    >
                      <AdminLabel className={ADMIN_LABEL_CLASS}>
                        {m.admin_people_eid_document_number_label()}
                      </AdminLabel>
                      <AdminInput
                        type="text"
                        value={field.value}
                        onChange={(e) => {
                          fieldErrors.clearField("eid_document_number");
                          field.handleChange(e.target.value);
                        }}
                        onBlur={field.handleBlur}
                        className={ADMIN_CONTROL_CLASS}
                        maxLength={50}
                      />
                    </AdminField>
                  )}
                </form.Field>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <AdminLabel className="text-subtle text-sm mb-0">
                  {m.admin_volunteers_help_periods_label()}
                </AdminLabel>
                <AdminAddButton onClick={() => form.pushFieldValue("helpPeriods", emptyPeriod())}>
                  {m.admin_volunteers_add_help_period()}
                </AdminAddButton>
              </div>

              {helpPeriods.length === 0 ? (
                <AdminEmptyState>{m.admin_volunteers_no_help_periods()}</AdminEmptyState>
              ) : (
                <div className="flex flex-col gap-2">
                  {helpPeriods.map((period, index) => (
                    <div key={index} className="rounded-md border border-subtle p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-subtle text-sm">#{index + 1}</span>
                        <Button
                          type="button"
                          variant="outline-danger"
                          size="sm"
                          onClick={() => void form.removeFieldValue("helpPeriods", index)}
                        >
                          <Icon icon={TrashIcon} />
                          {m.admin_volunteers_remove_help_period()}
                        </Button>
                      </div>
                      <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter">
                        <div className="w-full site-md:w-6/12">
                          <AdminField controlId={`volunteer-period-start-${index}`}>
                            <AdminLabel className={ADMIN_LABEL_CLASS}>
                              {m.admin_volunteers_period_start_label()} *
                            </AdminLabel>
                            <AdminInput
                              type="date"
                              value={period.firstHelpDay}
                              onChange={(e) =>
                                form.setFieldValue(`helpPeriods[${index}]`, {
                                  ...period,
                                  firstHelpDay: e.target.value,
                                })
                              }
                              className={ADMIN_CONTROL_CLASS}
                              required
                            />
                          </AdminField>
                        </div>
                        <div className="w-full site-md:w-6/12">
                          <AdminField controlId={`volunteer-period-end-${index}`}>
                            <AdminLabel className={ADMIN_LABEL_CLASS}>
                              {m.admin_volunteers_period_end_label()}
                            </AdminLabel>
                            <AdminInput
                              type="date"
                              value={period.lastHelpDay ?? ""}
                              onChange={(e) =>
                                form.setFieldValue(`helpPeriods[${index}]`, {
                                  ...period,
                                  lastHelpDay: e.target.value || null,
                                })
                              }
                              min={period.firstHelpDay || undefined}
                              className={ADMIN_CONTROL_CLASS}
                            />
                          </AdminField>
                        </div>
                      </div>
                      <AdminField className="mt-2" controlId={`volunteer-period-notes-${index}`}>
                        <AdminLabel className={ADMIN_LABEL_CLASS}>
                          {m.admin_volunteers_period_notes_label()}
                        </AdminLabel>
                        <AdminTextarea
                          rows={2}
                          value={period.notes}
                          onChange={(e) =>
                            form.setFieldValue(`helpPeriods[${index}]`, {
                              ...period,
                              notes: e.target.value,
                            })
                          }
                          placeholder={m.admin_volunteers_period_notes_placeholder()}
                          className={ADMIN_CONTROL_CLASS}
                          maxLength={2000}
                        />
                      </AdminField>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => void requestClose()}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={isSubmitting || !nameValue.trim()}
            >
              {isSubmitting ? <Spinner size="sm" /> : <Icon icon={SaveIcon} />}
              {m.admin_people_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
