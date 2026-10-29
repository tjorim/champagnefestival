import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OrderQuestionsEditor from "@/components/admin/OrderQuestionsEditor";
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
import { type Event, type EventFormData } from "@/types/event";
import { categoryLabel, useEventCategories } from "@/hooks/useCategories";
import type { Edition } from "./editionTypes";

/** Longest event text the draft endpoint translates; mirrors `EVENT_TEXT_LIMIT` in the backend. */
const EVENT_TRANSLATION_LIMIT = 2000;

const TEXT_LANGUAGES = [
  {
    language: "nl",
    title: "titleNl",
    description: "descriptionNl",
    label: m.admin_language_nl,
  },
  {
    language: "fr",
    title: "titleFr",
    description: "descriptionFr",
    label: m.admin_language_fr,
  },
  {
    language: "en",
    title: "titleEn",
    description: "descriptionEn",
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
  editionId: "",
  titleNl: "",
  titleFr: "",
  titleEn: "",
  descriptionNl: "",
  descriptionFr: "",
  descriptionEn: "",
  date: "",
  startTime: "",
  endTime: "",
  category: "",
  volunteersOnly: false,
  membersOnly: false,
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
  saving,
  onSave,
  onHide,
}: EventModalProps) {
  const isFestival = edition.editionType === "festival";
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
            editionId: record.editionId,
            titleNl: record.titleNl ?? "",
            titleFr: record.titleFr ?? "",
            titleEn: record.titleEn ?? "",
            descriptionNl: record.descriptionNl ?? "",
            descriptionFr: record.descriptionFr ?? "",
            descriptionEn: record.descriptionEn ?? "",
            date: record.date,
            startTime: record.startTime,
            endTime: record.endTime ?? "",
            category: record.category,
            volunteersOnly: record.volunteersOnly ?? false,
            membersOnly: record.membersOnly ?? false,
            registrationRequired: record.registrationRequired,
            registrationsOpenFrom: record.registrationsOpenFrom ?? "",
            registrationsCloseAt: record.registrationsCloseAt ?? "",
            sortOrder: record.sortOrder != null ? String(record.sortOrder) : "",
            active: record.active,
          }
        : {
            ...EMPTY_FORM,
            category: firstCategory,
            editionId: edition.id,
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
      if (!value.titleNl.trim()) {
        setTextLanguage("nl");
        setTextErrorAttempt((attempt) => attempt + 1);
        setTextError("title");
        return;
      }
      const hasTranslatedDescription = Boolean(
        value.descriptionFr.trim() || value.descriptionEn.trim(),
      );
      if (hasTranslatedDescription && !value.descriptionNl.trim()) {
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
  const registrationRequired = useSelector(form.atom, (s) => s.values.registrationRequired);

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
                <form.Field name="endTime">
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
            <form.Field name="volunteersOnly">
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
            <form.Field name="membersOnly">
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
                  <form.Field name="registrationsCloseAt">
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
                          text={values.titleNl}
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
                          text={values.descriptionNl}
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
