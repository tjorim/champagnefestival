import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OrderQuestionsEditor from "./OrderQuestionsEditor";
import {
  ADMIN_CONTROL_CLASS,
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
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { isDraftDirty, useDirtyDismiss, useEditorSession } from "@/hooks/useDirtyDismiss";
import { m } from "@/paraglide/messages";
import type { Event } from "@/api-types";
import { type EventFormData } from "@/types/event";
import { categoryLabel, useEventCategories } from "@/hooks/useCategories";
import type { Edition } from "@/api-types";

/** Longest event text the draft endpoint translates; mirrors `EVENT_TEXT_LIMIT` in the backend. */
const EVENT_TRANSLATION_LIMIT = 2000;

const TEXT_LANGUAGES = [
  {
    language: "nl",
    title: "title_nl",
    description: "description_nl",
    label: m.admin_language_nl,
  },
  {
    language: "fr",
    title: "title_fr",
    description: "description_fr",
    label: m.admin_language_fr,
  },
  {
    language: "en",
    title: "title_en",
    description: "description_en",
    label: m.admin_language_en,
  },
] as const;

interface EventModalProps {
  show: boolean;
  edition: Edition;
  initial: Event | null;
  authHeaders: () => Record<string, string>;
  saving?: boolean;
  onSave: (formData: EventFormData) => void;
  onHide: () => void;
}

const EMPTY_FORM: EventFormData = {
  edition_id: "",
  title_nl: "",
  title_fr: "",
  title_en: "",
  description_nl: "",
  description_fr: "",
  description_en: "",
  date: "",
  start_time: "",
  end_time: "",
  category: "",
  volunteers_only: false,
  members_only: false,
  registration_required: false,
  registrations_open_from: "",
  registrations_close_at: "",

  active: true,
};

export default function EventModal({
  show,
  edition,
  initial,
  authHeaders,
  saving,
  onSave,
  onHide,
}: EventModalProps) {
  const isFestival = edition.edition_type === "festival";
  // The event as it was when the editor opened, so a background refresh neither
  // rewrites untouched fields nor moves the baseline for the discard prompt.
  const { record, sessionId } = useEditorSession(
    show,
    `${edition.id}/${initial?.id ?? ""}`,
    initial,
  );
  const derivedStandaloneDate = useMemo(
    () => edition.dates[0] ?? record?.date ?? "",
    [edition.dates, record?.date],
  );
  const { data: categories = [] } = useEventCategories();
  // A new event starts in the first category once they have loaded.
  const firstCategory = categories[0]?.key ?? "";

  // `useForm` re-applies its `defaultValues` on every render (a layout effect in
  // @tanstack/react-form with no dependency array). Feeding it a static template
  // while hydrating through `form.reset(record)` makes the two fight: the reset
  // rewrites the stored defaults, the next render sees them differ from the
  // template and wipes the record back out. Deriving the defaults from the session record
  // keeps both sides in agreement, so the record survives.
  const defaultValues = useMemo(
    (): EventFormData =>
      record
        ? {
            edition_id: record.edition_id,
            title_nl: record.title_nl ?? "",
            title_fr: record.title_fr ?? "",
            title_en: record.title_en ?? "",
            description_nl: record.description_nl ?? "",
            description_fr: record.description_fr ?? "",
            description_en: record.description_en ?? "",
            date: record.date,
            start_time: record.start_time,
            end_time: record.end_time ?? "",
            category: record.category,
            volunteers_only: record.volunteers_only ?? false,
            members_only: record.members_only ?? false,
            registration_required: record.registration_required,
            registrations_open_from: record.registrations_open_from ?? "",
            registrations_close_at: record.registrations_close_at ?? "",

            active: record.active,
          }
        : {
            ...EMPTY_FORM,
            category: firstCategory,
            edition_id: edition.id,
            date: isFestival ? (edition.dates[0] ?? "") : derivedStandaloneDate,
          },
    [derivedStandaloneDate, edition.id, edition.dates, firstCategory, record, isFestival],
  );

  const [textLanguage, setTextLanguage] = useState("nl");
  const [textErrorAttempt, setTextErrorAttempt] = useState(0);
  const [textError, setTextError] = useState<"title" | "description" | null>(null);

  useEffect(() => {
    if (textError) document.getElementById(`event-${textError}-nl`)?.focus();
  }, [textError, textErrorAttempt]);

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      if (!value.title_nl.trim()) {
        setTextLanguage("nl");
        setTextErrorAttempt((attempt) => attempt + 1);
        setTextError("title");
        return;
      }
      const hasTranslatedDescription = Boolean(
        value.description_fr.trim() || value.description_en.trim(),
      );
      if (hasTranslatedDescription && !value.description_nl.trim()) {
        setTextLanguage("nl");
        setTextErrorAttempt((attempt) => attempt + 1);
        setTextError("description");
        return;
      }
      setTextError(null);
      const submitDate = isFestival ? value.date : value.date || derivedStandaloneDate;
      onSave({ ...value, date: submitDate });
    },
  });

  // Every editing session starts from the record again, discarding edits that were
  // abandoned by closing the modal: `defaultValues` alone cannot do that because the
  // library keeps the fields a user has touched. Read through an effect event so
  // categories that arrive later (which refresh `defaultValues`) cannot re-seed a
  // draft in progress.
  const seedForm = useEffectEvent(() => form.reset(defaultValues));
  useLayoutEffect(() => {
    if (show) seedForm();
  }, [show, sessionId]);
  const [seenSession, setSeenSession] = useState(sessionId);
  if (sessionId !== seenSession) {
    setSeenSession(sessionId);
    setTextError(null);
    setTextLanguage("nl");
  }

  // Keep standalone date field in sync with derived date
  useEffect(() => {
    if (!isFestival && derivedStandaloneDate) {
      form.setFieldValue("date", derivedStandaloneDate);
    }
  }, [derivedStandaloneDate, isFestival, form]);

  const dateValue = useSelector(form.atom, (s) => s.values.date);
  const registration_required = useSelector(form.atom, (s) => s.values.registration_required);

  const effectiveDate = isFestival ? dateValue : dateValue || derivedStandaloneDate;

  const isEdit = !!record;
  const values = useSelector(form.atom, (s) => s.values);
  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty: isDraftDirty(values, defaultValues),
    busy: saving,
    onDismiss: onHide,
  });

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent admin size="lg" className="flex max-h-full min-h-0 flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEdit ? m.admin_content_edition_edit_event() : m.admin_content_edition_add_event()}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex min-h-0 flex-col"
          noValidate
        >
          <DialogBody className="min-h-0 overflow-y-auto">
            <h3 className="text-base font-medium mb-2">{m.admin_editor_schedule()}</h3>
            <div className="flex gap-2 flex-wrap mb-4">
              <AdminField controlId="event-category" className="min-w-40 grow-1 basis-40">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_content_event_category()}
                </AdminLabel>
                <form.Field
                  name="category"
                  validators={[
                    {
                      run: ({ value }) => (!value ? m.admin_event_category_required() : undefined),
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminSelect
                          size="sm"
                          className={ADMIN_CONTROL_CLASS}
                          aria-invalid={showErr}
                          value={field.value}
                          onValueChange={(value) => field.handleChange(value)}
                        >
                          {categories.map((category) => (
                            <AdminOption key={category.key} value={category.key}>
                              {categoryLabel(categories, category.key) ?? category.key}
                            </AdminOption>
                          ))}
                        </AdminSelect>
                        {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                      </>
                    );
                  }}
                </form.Field>
              </AdminField>
            </div>
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
                          className={ADMIN_CONTROL_CLASS}
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
              {!isFestival && (
                <p className="text-subtle text-sm basis-full">
                  {derivedStandaloneDate
                    ? m.admin_event_standalone_help()
                    : m.admin_event_first_date_help()}
                </p>
              )}
              <AdminField controlId="event-start-time" className="max-w-35">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_content_event_start_time()}
                </AdminLabel>
                <form.Field
                  name="start_time"
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
                          className={ADMIN_CONTROL_CLASS}
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
                <form.Field name="end_time">
                  {(field) => (
                    <AdminInput
                      type="time"
                      size="sm"
                      className={ADMIN_CONTROL_CLASS}
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
            </div>

            <h3 className="text-base font-medium mb-2">{m.admin_editor_access()}</h3>
            <form.Field name="volunteers_only">
              {(field) => (
                <AdminCheck
                  type="checkbox"
                  id="modal-event-volunteers-only"
                  label={m.event_volunteers_only()}
                  checked={field.value}
                  onCheckedChange={(value) => field.handleChange(value)}
                  className="text-content mb-2"
                />
              )}
            </form.Field>
            <form.Field name="members_only">
              {(field) => (
                <AdminCheck
                  type="checkbox"
                  id="modal-event-members-only"
                  label={m.event_members_only()}
                  checked={field.value}
                  onCheckedChange={(value) => field.handleChange(value)}
                  className="text-content mb-2"
                />
              )}
            </form.Field>
            <form.Field name="registration_required">
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
            {registration_required && (
              <div className="flex gap-2 flex-wrap mb-2">
                <AdminField className="max-w-70" controlId="event-registrations-open-from">
                  <AdminLabel className="text-subtle text-sm mb-1">
                    {m.admin_content_edition_registration_opens()}
                  </AdminLabel>
                  <form.Field name="registrations_open_from">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className={ADMIN_CONTROL_CLASS}
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
                  <form.Field name="registrations_close_at">
                    {(field) => (
                      <AdminInput
                        type="datetime-local"
                        size="sm"
                        className={ADMIN_CONTROL_CLASS}
                        value={field.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                </AdminField>
              </div>
            )}

            <p className="text-sm text-subtle mb-4">{m.admin_event_text_help()}</p>
            {textError && (
              <AdminError>
                {textError === "title"
                  ? m.admin_event_title_original_required()
                  : m.admin_event_description_original_required()}
              </AdminError>
            )}
            <Tabs value={textLanguage} onValueChange={(value) => setTextLanguage(String(value))}>
              <TabsList aria-label={m.admin_editor_text()}>
                {TEXT_LANGUAGES.map(({ language, label }) => (
                  <TabsTrigger key={language} value={language}>
                    {label()}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TEXT_LANGUAGES.map(({ language, title, description, label }) => (
                <TabsContent key={language} value={language} keepMounted>
                  <AdminField controlId={`event-title-${language}`} className="mb-4">
                    <AdminLabel className="text-subtle text-sm mb-1">
                      {m.admin_event_title_label({ language: label() })}
                    </AdminLabel>
                    <form.Field name={title}>
                      {(field) => (
                        <AdminInput
                          size="sm"
                          className={ADMIN_CONTROL_CLASS}
                          maxLength={200}
                          value={field.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                    <form.Subscribe selector={(state) => state.values}>
                      {(values) => (
                        <OrganizationTranslationSuggestion
                          key={`${show}-${initial?.id ?? "new"}-title-${language}`}
                          url="/api/events/translation"
                          headers={authHeaders}
                          maxLength={EVENT_TRANSLATION_LIMIT}
                          source="nl"
                          target={language}
                          text={values.title_nl}
                          targetText={values[title]}
                          onDraft={(text) => form.setFieldValue(title, text.slice(0, 200))}
                        />
                      )}
                    </form.Subscribe>
                  </AdminField>
                  <AdminField controlId={`event-description-${language}`} className="mb-4">
                    <AdminLabel className="text-subtle text-sm mb-1">
                      {m.admin_event_description_label({ language: label() })}
                    </AdminLabel>
                    <form.Field name={description}>
                      {(field) => (
                        <AdminTextarea
                          size="sm"
                          rows={2}
                          className={ADMIN_CONTROL_CLASS}
                          maxLength={10000}
                          value={field.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                      )}
                    </form.Field>
                    <form.Subscribe selector={(state) => state.values}>
                      {(values) => (
                        <OrganizationTranslationSuggestion
                          key={`${show}-${initial?.id ?? "new"}-description-${language}`}
                          url="/api/events/translation"
                          headers={authHeaders}
                          maxLength={EVENT_TRANSLATION_LIMIT}
                          source="nl"
                          target={language}
                          text={values.description_nl}
                          targetText={values[description]}
                          onDraft={(text) => form.setFieldValue(description, text)}
                        />
                      )}
                    </form.Subscribe>
                  </AdminField>
                </TabsContent>
              ))}
            </Tabs>
            <p className="text-sm text-subtle mb-4">{m.admin_event_translation_limit()}</p>
            {initial?.id && (
              // The editor saves through its own button; Enter must not submit the event form.
              <div
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                  }
                }}
              >
                <OrderQuestionsEditor
                  key={initial.id}
                  eventId={initial.id}
                  authHeaders={authHeaders}
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter className="shrink-0">
            <Button variant="outline" size="sm" onClick={() => void requestClose()}>
              {m.close()}
            </Button>
            <Button type="submit" variant="warning" size="sm" disabled={saving}>
              <Icon icon={SaveIcon} />
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
