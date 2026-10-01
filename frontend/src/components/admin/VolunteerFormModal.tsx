import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminTextarea,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { CirclePlusIcon, SaveIcon, ThumbsUpIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import Alert from "react-bootstrap/Alert";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type { Person, VolunteerHelpPeriod } from "@/types/person";

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
  active: boolean;
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
  const isEdit = volunteer != null;
  const [error, setError] = useState<string | null>(null);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    (): VolunteerFormData =>
      volunteer
        ? {
            name: volunteer.name,
            address: volunteer.address ?? "",
            nationalRegisterNumber: volunteer.nationalRegisterNumber ?? "",
            eidDocumentNumber: volunteer.eidDocumentNumber ?? "",
            active: volunteer.active,
            helpPeriods:
              volunteer.helpPeriods.length > 0
                ? volunteer.helpPeriods.map(mapPeriod)
                : [emptyPeriod()],
          }
        : {
            name: "",
            address: "",
            nationalRegisterNumber: "",
            eidDocumentNumber: "",
            active: true,
            helpPeriods: [emptyPeriod()],
          },
    [volunteer],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const normalized = value.helpPeriods.map((period) => ({
        firstHelpDay: period.firstHelpDay,
        lastHelpDay: period.lastHelpDay?.trim() ? period.lastHelpDay : null,
        notes: period.notes.trim(),
      }));

      if (normalized.length === 0 || normalized.some((period) => !period.firstHelpDay)) {
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
      try {
        await onSave({
          name: value.name.trim(),
          address: value.address.trim(),
          nationalRegisterNumber: value.nationalRegisterNumber.trim(),
          eidDocumentNumber: value.eidDocumentNumber.trim(),
          active: value.active,
          helpPeriods: normalized,
        });
        onHide();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isEdit
              ? m.admin_volunteers_error_update()
              : m.admin_volunteers_error_create(),
        );
      }
    },
  });

  // Re-open should always start from the record again, discarding edits that were
  // abandoned by closing the modal. Reset during render rather than in an effect
  // (the "adjusting state when a prop changes" pattern) since this only needs to
  // react to the show=false->true transition, not to every render.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      form.reset(defaultValues);
      setError(null);
    }
  }

  const nameValue = useSelector(form.atom, (s) => s.values.name);
  const nationalRegisterNumberValue = useSelector(
    form.atom,
    (s) => s.values.nationalRegisterNumber,
  );
  const eidDocumentNumberValue = useSelector(form.atom, (s) => s.values.eidDocumentNumber);
  const helpPeriods = useSelector(form.atom, (s) => s.values.helpPeriods);
  const isSubmitting = useSelector(form.atom, (s) => s.isSubmitting);

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
            <Icon icon={ThumbsUpIcon} className="tw:me-2" />
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
              <Alert
                variant="danger"
                className="tw:py-2 tw:text-sm"
                dismissible
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            )}

            <form.Field name="name">
              {(field) => (
                <AdminField className="tw:mb-4" controlId="volunteer-name">
                  <AdminLabel className="tw:text-subtle tw:text-sm">
                    {m.registration_name()} *
                  </AdminLabel>
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="tw:bg-muted tw:text-content tw:border-input"
                    required
                    maxLength={200}
                  />
                </AdminField>
              )}
            </form.Field>

            <form.Field name="address">
              {(field) => (
                <AdminField className="tw:mb-4" controlId="volunteer-address">
                  <AdminLabel className="tw:text-subtle tw:text-sm">
                    {m.admin_people_address_label()}
                  </AdminLabel>
                  <AdminInput
                    type="text"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="tw:bg-muted tw:text-content tw:border-input"
                    maxLength={300}
                  />
                </AdminField>
              )}
            </form.Field>

            <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:mb-4">
              <div className="tw:w-full tw:site-md:w-6/12">
                <form.Field name="nationalRegisterNumber">
                  {(field) => (
                    <AdminField controlId="volunteer-national-register-number">
                      <AdminLabel className="tw:text-subtle tw:text-sm">
                        {m.admin_people_national_register_number_label()} *
                      </AdminLabel>
                      <AdminInput
                        type="text"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value.slice(0, 20))}
                        onBlur={field.handleBlur}
                        className="tw:bg-muted tw:text-content tw:border-input"
                        required
                        maxLength={20}
                      />
                    </AdminField>
                  )}
                </form.Field>
              </div>
              <div className="tw:w-full tw:site-md:w-6/12">
                <form.Field name="eidDocumentNumber">
                  {(field) => (
                    <AdminField controlId="volunteer-eid-document-number">
                      <AdminLabel className="tw:text-subtle tw:text-sm">
                        {m.admin_people_eid_document_number_label()} *
                      </AdminLabel>
                      <AdminInput
                        type="text"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        className="tw:bg-muted tw:text-content tw:border-input"
                        required
                        maxLength={50}
                      />
                    </AdminField>
                  )}
                </form.Field>
              </div>
            </div>

            <div className="tw:mb-4">
              <div className="tw:flex tw:justify-between tw:items-center tw:mb-2">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-0">
                  {m.admin_volunteers_help_periods_label()} *
                </AdminLabel>
                <Button
                  type="button"
                  variant="outline-warning"
                  size="sm"
                  onClick={() => form.pushFieldValue("helpPeriods", emptyPeriod())}
                >
                  <Icon icon={CirclePlusIcon} />
                  {m.admin_volunteers_add_help_period()}
                </Button>
              </div>

              {helpPeriods.length === 0 ? (
                <div className="tw:text-subtle tw:text-sm">
                  {m.admin_volunteers_no_help_periods()}
                </div>
              ) : (
                <div className="tw:flex tw:flex-col tw:gap-2">
                  {helpPeriods.map((period, index) => (
                    <div key={index} className="border border-secondary rounded tw:p-4">
                      <div className="tw:flex tw:justify-between tw:items-center tw:mb-2">
                        <span className="tw:text-subtle tw:text-sm">#{index + 1}</span>
                        <Button
                          type="button"
                          variant="outline-danger"
                          size="sm"
                          onClick={() => void form.removeFieldValue("helpPeriods", index)}
                          disabled={helpPeriods.length === 1}
                        >
                          <Icon icon={TrashIcon} />
                          {m.admin_volunteers_remove_help_period()}
                        </Button>
                      </div>
                      <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter">
                        <div className="tw:w-full tw:site-md:w-6/12">
                          <AdminField controlId={`volunteer-period-start-${index}`}>
                            <AdminLabel className="tw:text-subtle tw:text-sm">
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
                              className="tw:bg-muted tw:text-content tw:border-input"
                              required
                            />
                          </AdminField>
                        </div>
                        <div className="tw:w-full tw:site-md:w-6/12">
                          <AdminField controlId={`volunteer-period-end-${index}`}>
                            <AdminLabel className="tw:text-subtle tw:text-sm">
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
                              className="tw:bg-muted tw:text-content tw:border-input"
                            />
                          </AdminField>
                        </div>
                      </div>
                      <AdminField className="tw:mt-2" controlId={`volunteer-period-notes-${index}`}>
                        <AdminLabel className="tw:text-subtle tw:text-sm">
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
                          className="tw:bg-muted tw:text-content tw:border-input"
                          maxLength={2000}
                        />
                      </AdminField>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form.Field name="active">
              {(field) => (
                <AdminCheck
                  id="volunteer-active"
                  type="switch"
                  label={m.admin_people_active_label()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                  className="tw:text-subtle tw:text-sm"
                />
              )}
            </form.Field>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onHide}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={
                isSubmitting ||
                !nameValue.trim() ||
                !nationalRegisterNumberValue.trim() ||
                !eidDocumentNumberValue.trim()
              }
            >
              {isSubmitting ? (
                <Spinner as="span" animation="border" size="sm" />
              ) : (
                <Icon icon={SaveIcon} />
              )}
              {m.admin_people_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
