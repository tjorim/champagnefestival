import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminError,
  AdminSelect,
  AdminOption,
  AdminCheck,
} from "@/components/admin/AdminFields";
import { SaveIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
import {
  Combobox,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { m } from "@/paraglide/messages";
import type { ItemDraft } from "./itemTypes";
import type { Edition, EditionType } from "./editionTypes";
import type { Venue } from "@/types/admin";
import { queryKeys } from "@/utils/queryKeys";
import { fetchEditionModalExhibitors, saveEdition } from "@/utils/adminContentApi";

interface EditionModalProps {
  show: boolean;
  initial: Edition | null;
  venues: Venue[];
  authHeaders: () => Record<string, string>;
  onSaved: (edition: Edition) => void;
  onHide: () => void;
}

interface ItemOption {
  value: number;
  label: string;
  isArchived: boolean;
}

const editionModalExhibitorsQueryKey = queryKeys.admin.editionModalExhibitors;

function toOptions(items: ItemDraft[]): { active: ItemOption[]; archived: ItemOption[] } {
  const active: ItemOption[] = [];
  const archived: ItemOption[] = [];
  for (const item of items) {
    const opt: ItemOption = { value: item.id, label: item.name, isArchived: item.active === false };
    if (item.active === false) archived.push(opt);
    else active.push(opt);
  }
  return { active, archived };
}

function typeLabel(type: EditionType) {
  switch (type) {
    case "bourse":
      return m.admin_edition_type_bourse();
    case "capsule_exchange":
      return m.admin_edition_type_capsule_exchange();
    default:
      return m.admin_edition_type_festival();
  }
}

export default function EditionModal({
  show,
  initial,
  venues,
  authHeaders,
  onSaved,
  onHide,
}: EditionModalProps) {
  const hydratedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on the resolved id rather than the `venues` array: callers pass
  // `query.data ?? []`, so a fresh empty array on every render would otherwise
  // give `defaultValues` a new identity each time and drive the reset effect
  // below into a loop. A string settles as soon as the venues load.
  const fallbackVenueId = useMemo(() => venues.find((v) => v.active)?.id ?? "", [venues]);

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(
    () => ({
      id: initial?.id ?? "",
      year: initial?.year ?? new Date().getFullYear(),
      month: initial?.month ?? "",
      editionType: (initial?.editionType ?? "festival") as EditionType,
      venueId: initial?.venue?.id ?? fallbackVenueId,
      active: initial?.active ?? true,
      coOrganizerId: initial?.coOrganizer?.id ? String(initial.coOrganizer.id) : "",
      // Producers and sponsors only — the API rejects vendor ids on an edition,
      // so vendors are deliberately not selectable and not submitted.
      selectedExhibitors: [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map(
        (e) => ({ value: e.id, label: e.name, isArchived: false }),
      ) as ItemOption[],
    }),
    [fallbackVenueId, initial],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      if (!initial && value.id.trim() === "") {
        setError(m.admin_edition_id_required());
        return;
      }
      try {
        const savedEdition = await saveEditionMutation.mutateAsync({
          id: value.id.trim(),
          year: value.year,
          month: value.month.trim(),
          editionType: value.editionType,
          venueId: value.venueId,
          active: value.active,
          // Producers and sponsors only, deliberately. The API rejects vendor ids
          // on an edition outright ("Vendor-type exhibitors may not be linked to
          // editions"), so an edition showing vendors is in a state the backend
          // considers invalid — re-sending them would make it unsaveable. Leaving
          // them out lets the next save clear the invalid link.
          exhibitorIds:
            value.editionType === "festival"
              ? value.selectedExhibitors.map((option: ItemOption) => option.value)
              : [],
          // Any edition type may name one; it is not part of the lineup.
          coOrganizerExhibitorId: value.coOrganizerId ? Number(value.coOrganizerId) : null,
        });
        onSaved(savedEdition);
      } catch (mutationError) {
        setError(
          mutationError instanceof Error ? mutationError.message : m.admin_content_error_save(),
        );
      }
    },
  });

  // Re-open should always start from the record again, discarding edits that were
  // abandoned by closing the modal — `defaultValues` alone can't do that, because
  // the library skips re-seeding a form the user has already touched. Reset during
  // render rather than in an effect (the "adjusting state when a prop changes"
  // pattern) since this only needs to react to the show=false->true transition.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      form.reset(defaultValues);
      setError(null);
    }
  }

  // Ref mutations belong in an effect, not render — this just marks the
  // exhibitor-hydration effect below as pending again for the fresh form.
  useEffect(() => {
    if (show) hydratedRef.current = false;
  }, [show]);

  const exhibitorsQuery = useQuery({
    queryKey: editionModalExhibitorsQueryKey,
    queryFn: () => fetchEditionModalExhibitors(authHeaders),
    enabled: show,
    staleTime: 60 * 1000,
    retry: false,
  });

  const saveEditionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      year: number;
      month: string;
      editionType: EditionType;
      venueId: string;
      active: boolean;
      exhibitorIds: number[];
      coOrganizerExhibitorId: number | null;
    }) => saveEdition(payload, authHeaders, initial?.id),
    retry: false,
  });

  const allExhibitors = useMemo(() => exhibitorsQuery.data ?? [], [exhibitorsQuery.data]);
  const isEdit = !!initial;
  const editionType = useSelector(form.atom, (s) => s.values.editionType as EditionType);
  const isFestival = editionType === "festival";
  const programmableExhibitors = useMemo(
    () => allExhibitors.filter((exhibitor) => exhibitor.type !== "vendor"),
    [allExhibitors],
  );

  // Once the exhibitor list loads, re-derive the selected options from it so the
  // archived ones pick up their styling. Same ids as `defaultValues` seeded —
  // this only enriches them, so it must not run after the user starts editing.
  useEffect(() => {
    if (!show || allExhibitors.length === 0 || hydratedRef.current) return;
    const ids = new Set(
      [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map((e) => e.id),
    );
    const { active: act, archived: arch } = toOptions(programmableExhibitors);
    form.setFieldValue(
      "selectedExhibitors",
      [...act, ...arch].filter((o) => ids.has(o.value)),
    );
    hydratedRef.current = true;
  }, [allExhibitors, programmableExhibitors, initial, form, show]);
  const exhibitorGroups = useMemo(() => {
    const { active: act, archived: arch } = toOptions(programmableExhibitors);
    const groups: { label: string; items: ItemOption[] }[] = [];
    if (act.length) groups.push({ label: m.admin_edition_exhibitors(), items: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), items: arch });
    return groups;
  }, [programmableExhibitors]);

  const comboboxAnchor = useComboboxAnchor();
  const previewDates = useMemo(() => initial?.dates ?? [], [initial?.dates]);

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
            {isEdit ? `Edit ${initial!.id}` : m.admin_content_edition_add()}
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
            {error && (
              <Alert variant="danger" className="tw:py-1 tw:mb-4 tw:text-sm">
                {error}
              </Alert>
            )}

            {!isEdit && (
              <AdminField className="tw:mb-4" controlId="edition-id">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">ID</AdminLabel>
                <form.Field
                  name="id"
                  validators={[
                    {
                      run: ({ value }) =>
                        !value?.trim() ? m.admin_edition_id_required() : undefined,
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminInput
                          className="tw:bg-muted tw:text-content tw:border-input"
                          placeholder="e.g. 2026-march"
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
            )}

            <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-4">
              <AdminField className="tw:max-w-25" controlId="edition-year">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">Year</AdminLabel>
                <form.Field name="year">
                  {(field) => (
                    <AdminInput
                      type="number"
                      className="tw:bg-muted tw:text-content tw:border-input"
                      value={field.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
              <AdminField
                className="tw:min-w-35 tw:grow-1 tw:shrink-1 tw:basis-35"
                controlId="edition-month"
              >
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">Month</AdminLabel>
                <form.Field
                  name="month"
                  validators={[
                    {
                      run: ({ value }) =>
                        !value?.trim() ? m.admin_edition_month_required() : undefined,
                      triggers: ["change"],
                    },
                  ]}
                >
                  {(field) => {
                    const showErr = field.meta.isTouched && field.errors.length > 0;
                    return (
                      <>
                        <AdminInput
                          className="tw:bg-muted tw:text-content tw:border-input"
                          placeholder="e.g. march"
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
                className="tw:min-w-45 tw:grow-1 tw:shrink-1 tw:basis-45"
                controlId="edition-type"
              >
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_edition_type_label()}
                </AdminLabel>
                <form.Field name="editionType">
                  {(field) => (
                    <AdminSelect
                      value={field.value}
                      onValueChange={(e) => {
                        field.handleChange(e as EditionType);
                        if (e !== "festival") {
                          form.setFieldValue("selectedExhibitors", [] as ItemOption[]);
                        }
                      }}
                      onBlur={field.handleBlur}
                      className="tw:bg-muted tw:text-content tw:border-input"
                    >
                      <AdminOption value="festival">{m.admin_edition_type_festival()}</AdminOption>
                      <AdminOption value="bourse">{m.admin_edition_type_bourse()}</AdminOption>
                      <AdminOption value="capsule_exchange">
                        {m.admin_edition_type_capsule_exchange()}
                      </AdminOption>
                    </AdminSelect>
                  )}
                </form.Field>
              </AdminField>
              <form.Field name="active">
                {(field) => (
                  <AdminCheck
                    type="checkbox"
                    id="modal-edition-active"
                    label={m.admin_content_edition_active()}
                    checked={field.value}
                    onCheckedChange={(e) => field.handleChange(e)}
                    className="tw:text-content tw:self-end tw:mb-1"
                  />
                )}
              </form.Field>
            </div>

            <AdminField className="tw:mb-4" controlId="edition-venue">
              <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                {m.admin_edition_venue_label()}
              </AdminLabel>
              <form.Field
                name="venueId"
                validators={[
                  {
                    run: ({ value }) => (!value ? m.admin_edition_venue_required() : undefined),
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <>
                      <AdminSelect
                        className="tw:bg-muted tw:text-content tw:border-input"
                        value={field.value}
                        onValueChange={(e) => field.handleChange(e)}
                        onBlur={field.handleBlur}
                        aria-invalid={showErr}
                      >
                        <AdminOption value="">{m.admin_edition_venue_placeholder()}</AdminOption>
                        {venues.map((venue) => (
                          <AdminOption key={venue.id} value={venue.id}>
                            {venue.name}
                            {venue.active ? "" : " (archived)"}
                          </AdminOption>
                        ))}
                      </AdminSelect>
                      {showErr && <AdminError>{field.errors[0]?.message}</AdminError>}
                    </>
                  );
                }}
              </form.Field>
            </AdminField>

            <div className="border border-secondary rounded tw:p-4 tw:mb-4">
              <div className="tw:flex tw:justify-between tw:items-center tw:mb-2">
                <div className="tw:text-content tw:text-sm tw:font-semibold">
                  {typeLabel(editionType)} {m.admin_edition_date_handling()}
                </div>
                <span className="tw:text-subtle tw:text-sm">{m.admin_edition_dates_info()}</span>
              </div>
              {isFestival ? (
                <div className="tw:flex tw:flex-wrap tw:-mx-1 tw:*:w-full tw:*:px-1 tw:gap-y-2">
                  {["Friday", "Saturday", "Sunday"].map((label, index) => (
                    <AdminField
                      className="tw:site-md:w-4/12"
                      key={label}
                      controlId={`edition-date-${label.toLowerCase()}`}
                    >
                      <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">{label}</AdminLabel>
                      <AdminInput
                        type="date"
                        value={previewDates[index] ?? ""}
                        className="tw:bg-muted tw:text-content tw:border-input"
                        readOnly
                        disabled={!previewDates[index]}
                      />
                    </AdminField>
                  ))}
                </div>
              ) : (
                <AdminField controlId="edition-standalone-date">
                  <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                    Edition date
                  </AdminLabel>
                  <AdminInput
                    type="date"
                    value={previewDates[0] ?? ""}
                    className="tw:bg-muted tw:text-content tw:border-input"
                    readOnly
                    disabled={!previewDates[0]}
                  />
                </AdminField>
              )}
              <div className="tw:text-subtle tw:text-sm tw:mt-2">
                {isEdit
                  ? m.admin_edition_update_event_dates()
                  : m.admin_edition_create_first_then_events()}
              </div>
            </div>

            <AdminField className="tw:mb-4" controlId="edition-co-organizer">
              <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                {m.admin_edition_co_organizer_label()}
              </AdminLabel>
              <form.Field name="coOrganizerId">
                {(field) => (
                  <AdminSelect
                    className="tw:bg-muted tw:text-content tw:border-input"
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e)}
                    onBlur={field.handleBlur}
                  >
                    <AdminOption value="">{m.admin_edition_co_organizer_none()}</AdminOption>
                    {allExhibitors
                      .filter((exhibitor) => exhibitor.active !== false)
                      .map((exhibitor) => (
                        <AdminOption key={exhibitor.id} value={String(exhibitor.id)}>
                          {exhibitor.name}
                        </AdminOption>
                      ))}
                  </AdminSelect>
                )}
              </form.Field>
              <div className="tw:text-subtle tw:text-sm tw:mt-1">
                {m.admin_edition_co_organizer_help()}
              </div>
            </AdminField>

            {isFestival && (
              <AdminField className="tw:mb-4" controlId="edition-exhibitors">
                <AdminLabel className="tw:text-subtle tw:text-sm tw:mb-1">
                  {m.admin_edition_festival_exhibitors()}
                </AdminLabel>
                {exhibitorsQuery.isPending ? (
                  <div className="tw:text-subtle tw:text-sm">
                    <Spinner animation="border" size="sm" className="tw:me-2" />
                    {m.admin_edition_loading_exhibitors()}
                  </div>
                ) : (
                  <form.Field name="selectedExhibitors">
                    {(field) => (
                      <Combobox
                        multiple
                        items={exhibitorGroups}
                        value={field.value}
                        onValueChange={(options) => field.handleChange(options)}
                        itemToStringLabel={(option: ItemOption) => option.label}
                        isItemEqualToValue={(a: ItemOption, b: ItemOption) => a.value === b.value}
                      >
                        <ComboboxChips ref={comboboxAnchor}>
                          <ComboboxValue>
                            {(options: ItemOption[]) => (
                              <>
                                {options.map((option) => (
                                  <ComboboxChip
                                    key={option.value}
                                    className={
                                      option.isArchived ? "tw:text-muted-foreground" : undefined
                                    }
                                  >
                                    {option.label}
                                  </ComboboxChip>
                                ))}
                                <ComboboxChipsInput
                                  id="edition-exhibitors"
                                  aria-label={m.admin_edition_festival_exhibitors()}
                                  onBlur={field.handleBlur}
                                  placeholder={m.admin_edition_exhibitors()}
                                />
                              </>
                            )}
                          </ComboboxValue>
                        </ComboboxChips>
                        <ComboboxContent anchor={comboboxAnchor}>
                          <ComboboxEmpty>{m.admin_content_no_results()}</ComboboxEmpty>
                          <ComboboxList>
                            {(group: { label: string; items: ItemOption[] }) => (
                              <ComboboxGroup key={group.label} items={group.items}>
                                <ComboboxLabel>{group.label}</ComboboxLabel>
                                <ComboboxCollection>
                                  {(option: ItemOption) => (
                                    <ComboboxItem
                                      key={option.value}
                                      value={option}
                                      className={
                                        option.isArchived ? "tw:text-muted-foreground" : undefined
                                      }
                                    >
                                      {option.label}
                                    </ComboboxItem>
                                  )}
                                </ComboboxCollection>
                              </ComboboxGroup>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    )}
                  </form.Field>
                )}
              </AdminField>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline-secondary" size="sm" onClick={onHide}>
              {m.close()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={saveEditionMutation.isPending}
            >
              {saveEditionMutation.isPending ? (
                <Spinner as="span" animation="border" size="sm" className="tw:me-1" />
              ) : (
                <Icon icon={SaveIcon} className="tw:me-1" />
              )}
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
