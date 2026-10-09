import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminOption,
  AdminSelect,
  AdminTextarea,
  AdminCheck,
} from "@/components/admin/AdminFields";
import OrganizationTranslationSuggestion from "@/components/OrganizationTranslationSuggestion";
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
import {
  EVENT_CATEGORIES,
  type Event,
  type EventFormData,
  type EventLanguage,
} from "@/types/event";
import { eventCategoryLabel } from "@/utils/eventText";
import type { Edition } from "./editionTypes";

/** Longest event text the draft endpoint translates; mirrors `EVENT_TEXT_LIMIT` in the backend. */
const EVENT_TRANSLATION_LIMIT = 2000;

const TEXT_LANGUAGES = [
  {
    language: "nl",
    title: "titleNl",
    description: "descriptionNl",
    label: m.admin_event_language_nl,
  },
  {
    language: "fr",
    title: "titleFr",
    description: "descriptionFr",
    label: m.admin_event_language_fr,
  },
  {
    language: "en",
    title: "titleEn",
    description: "descriptionEn",
    label: m.admin_event_language_en,
  },
] as const;

interface EventModalProps {
  show: boolean;
  edition: Edition;
  initial: Event | null;
  authHeaders: () => Record<string, string>;
  onSave: (formData: EventFormData) => void;
  onHide: () => void;
}

const EMPTY_FORM: EventFormData = {
  editionId: "",
  titleLanguage: "nl",
  titleNl: "",
  titleFr: "",
  titleEn: "",
  descriptionLanguage: "nl",
  descriptionNl: "",
  descriptionFr: "",
  descriptionEn: "",
  date: "",
  startTime: "",
  endTime: "",
  category: "tasting",
  registrationRequired: false,
  registrationsOpenFrom: "",
  registrationsCloseAt: "",
  sortOrder: "",
  active: true,
};

export default function EventModal({
  show,
  edition,
  initial,
  authHeaders,
  onSave,
  onHide,
}: EventModalProps) {
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
            titleLanguage: initial.titleLanguage,
            titleNl: initial.titleNl ?? "",
            titleFr: initial.titleFr ?? "",
            titleEn: initial.titleEn ?? "",
            descriptionLanguage: initial.descriptionLanguage ?? initial.titleLanguage,
            descriptionNl: initial.descriptionNl ?? "",
            descriptionFr: initial.descriptionFr ?? "",
            descriptionEn: initial.descriptionEn ?? "",
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

  const [textError, setTextError] = useState<"title" | "description" | null>(null);

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const titleOriginal = TEXT_LANGUAGES.find(({ language }) => language === value.titleLanguage);
      if (!titleOriginal || !value[titleOriginal.title].trim()) {
        setTextError("title");
        return;
      }
      const descriptionOriginal = TEXT_LANGUAGES.find(
        ({ language }) => language === value.descriptionLanguage,
      );
      const hasDescription = TEXT_LANGUAGES.some(({ description }) => value[description].trim());
      if (
        hasDescription &&
        (!descriptionOriginal || !value[descriptionOriginal.description].trim())
      ) {
        setTextError("description");
        return;
      }
      setTextError(null);
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
    setTextError(null);
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
            <p className="text-sm text-subtle mb-4">{m.admin_event_text_help()}</p>
            <div className="flex gap-2 flex-wrap mb-4">
              <AdminField controlId="event-title-language" className="min-w-40 grow-1 basis-40">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_event_title_language()}
                </AdminLabel>
                <form.Field name="titleLanguage">
                  {(field) => (
                    <AdminSelect
                      size="sm"
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onValueChange={(value) => field.handleChange(value as EventLanguage)}
                    >
                      {TEXT_LANGUAGES.map(({ language, label }) => (
                        <AdminOption key={language} value={language}>
                          {label()}
                        </AdminOption>
                      ))}
                    </AdminSelect>
                  )}
                </form.Field>
              </AdminField>
              <AdminField controlId="event-category" className="min-w-40 grow-1 basis-40">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_content_event_category()}
                </AdminLabel>
                <form.Field name="category">
                  {(field) => (
                    <AdminSelect
                      size="sm"
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onValueChange={(value) => field.handleChange(value)}
                    >
                      {EVENT_CATEGORIES.map((category) => (
                        <AdminOption key={category} value={category}>
                          {eventCategoryLabel(category)}
                        </AdminOption>
                      ))}
                    </AdminSelect>
                  )}
                </form.Field>
              </AdminField>
            </div>
            {textError === "title" && (
              <AdminError>{m.admin_event_title_original_required()}</AdminError>
            )}
            {TEXT_LANGUAGES.map(({ language, title, label }) => (
              <AdminField key={language} controlId={`event-title-${language}`} className="mb-4">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_event_title_label({ language: label() })}
                </AdminLabel>
                <form.Field name={title}>
                  {(field) => (
                    <AdminInput
                      size="sm"
                      className="bg-muted text-content border-input"
                      maxLength={200}
                      autoFocus={language === "nl"}
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => state.values}>
                  {(values) => {
                    const original = TEXT_LANGUAGES.find(
                      (entry) => entry.language === values.titleLanguage,
                    );
                    return (
                      <OrganizationTranslationSuggestion
                        key={`${show}-${initial?.id ?? "new"}-title-${language}`}
                        url="/api/events/translation"
                        headers={authHeaders}
                        maxLength={EVENT_TRANSLATION_LIMIT}
                        source={values.titleLanguage}
                        target={language}
                        text={original ? values[original.title] : ""}
                        targetText={values[title]}
                        onDraft={(text) => form.setFieldValue(title, text.slice(0, 200))}
                      />
                    );
                  }}
                </form.Subscribe>
              </AdminField>
            ))}

            <div className="flex gap-2 flex-wrap mb-4">
              <AdminField controlId="event-date" className="max-w-45">
                <AdminLabel className="text-subtle text-sm mb-1">{m.admin_event_date()}</AdminLabel>
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
                          className="bg-muted text-content border-input"
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
              <AdminField controlId="event-start-time" className="max-w-35">
                <AdminLabel className="text-subtle text-sm mb-1">
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
                          className="bg-muted text-content border-input"
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
              <AdminField controlId="event-end-time" className="max-w-35">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_content_event_end_time()}
                </AdminLabel>
                <form.Field name="endTime">
                  {(field) => (
                    <AdminInput
                      type="time"
                      size="sm"
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
            </div>

            <AdminField controlId="event-description-language" className="mb-4 max-w-60">
              <AdminLabel className="text-subtle text-sm mb-1">
                {m.admin_event_description_language()}
              </AdminLabel>
              <form.Field name="descriptionLanguage">
                {(field) => (
                  <AdminSelect
                    size="sm"
                    className="bg-muted text-content border-input"
                    value={field.value}
                    onValueChange={(value) => field.handleChange(value as EventLanguage)}
                  >
                    {TEXT_LANGUAGES.map(({ language, label }) => (
                      <AdminOption key={language} value={language}>
                        {label()}
                      </AdminOption>
                    ))}
                  </AdminSelect>
                )}
              </form.Field>
            </AdminField>
            {textError === "description" && (
              <AdminError>{m.admin_event_description_original_required()}</AdminError>
            )}
            {TEXT_LANGUAGES.map(({ language, description, label }) => (
              <AdminField
                key={language}
                controlId={`event-description-${language}`}
                className="mb-4"
              >
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_event_description_label({ language: label() })}
                </AdminLabel>
                <form.Field name={description}>
                  {(field) => (
                    <AdminTextarea
                      size="sm"
                      rows={2}
                      className="bg-muted text-content border-input"
                      maxLength={10000}
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => state.values}>
                  {(values) => {
                    const original = TEXT_LANGUAGES.find(
                      (entry) => entry.language === values.descriptionLanguage,
                    );
                    return (
                      <OrganizationTranslationSuggestion
                        key={`${show}-${initial?.id ?? "new"}-description-${language}`}
                        url="/api/events/translation"
                        headers={authHeaders}
                        maxLength={EVENT_TRANSLATION_LIMIT}
                        source={values.descriptionLanguage}
                        target={language}
                        text={original ? values[original.description] : ""}
                        targetText={values[description]}
                        onDraft={(text) => form.setFieldValue(description, text)}
                      />
                    );
                  }}
                </form.Subscribe>
              </AdminField>
            ))}
            <p className="text-sm text-subtle mb-4">{m.admin_event_translation_limit()}</p>

            <form.Field name="registrationRequired">
              {(field) => (
                <AdminCheck
                  type="checkbox"
                  id="modal-event-registration"
                  label={m.admin_content_event_requires_registration()}
                  checked={field.value}
                  onCheckedChange={(e) => field.handleChange(e)}
                  className="text-content mb-2"
                />
              )}
            </form.Field>
            {registrationRequired && (
              <div className="flex gap-2 flex-wrap mb-2">
                <AdminField className="max-w-70" controlId="event-registrations-open-from">
                  <AdminLabel className="text-subtle text-sm mb-1">
                    {m.admin_content_edition_registration_opens()}
                  </AdminLabel>
                  <form.Field name="registrationsOpenFrom">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className="bg-muted text-content border-input"
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </AdminField>
                <AdminField className="max-w-70" controlId="event-registrations-close-at">
                  <AdminLabel className="text-subtle text-sm mb-1">
                    {m.admin_content_edition_registration_closes()}
                  </AdminLabel>
                  <form.Field name="registrationsCloseAt">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className="bg-muted text-content border-input"
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
              <div className="text-subtle text-sm mt-2">{m.admin_event_standalone_help()}</div>
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
