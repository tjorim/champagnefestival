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
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { fetchEditionModalOrganizations, saveEdition } from "@/utils/adminContentApi";

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

const editionModalOrganizationsQueryKey = queryKeys.admin.editionModalOrganizations;

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
      selectedOrganizations: [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map(
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
          // on an edition outright ("Vendor-type organizations may not be linked to
          // editions"), so an edition showing vendors is in a state the backend
          // considers invalid — re-sending them would make it unsaveable. Leaving
          // them out lets the next save clear the invalid link.
          organizationIds:
            value.editionType === "festival"
              ? value.selectedOrganizations.map((option: ItemOption) => option.value)
              : [],
          // Any edition type may name one; it is not part of the lineup.
          coOrganizerOrganizationId: value.coOrganizerId ? Number(value.coOrganizerId) : null,
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
  // organization-hydration effect below as pending again for the fresh form.
  useEffect(() => {
    if (show) hydratedRef.current = false;
  }, [show]);

  const organizationsQuery = useQuery({
    queryKey: editionModalOrganizationsQueryKey,
    queryFn: () => fetchEditionModalOrganizations(authHeaders),
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
      organizationIds: number[];
      coOrganizerOrganizationId: number | null;
    }) => saveEdition(payload, authHeaders, initial?.id),
    retry: false,
  });

  const allOrganizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const isEdit = !!initial;
  const editionType = useSelector(form.atom, (s) => s.values.editionType as EditionType);
  const isFestival = editionType === "festival";
  const programmableOrganizations = useMemo(
    () => allOrganizations.filter((organization) => organization.type !== "vendor"),
    [allOrganizations],
  );

  // Once the organization list loads, re-derive the selected options from it so the
  // archived ones pick up their styling. Same ids as `defaultValues` seeded —
  // this only enriches them, so it must not run after the user starts editing.
  useEffect(() => {
    if (!show || allOrganizations.length === 0 || hydratedRef.current) return;
    const ids = new Set(
      [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map((e) => e.id),
    );
    const { active: act, archived: arch } = toOptions(programmableOrganizations);
    form.setFieldValue(
      "selectedOrganizations",
      [...act, ...arch].filter((o) => ids.has(o.value)),
    );
    hydratedRef.current = true;
  }, [allOrganizations, programmableOrganizations, initial, form, show]);
  const organizationGroups = useMemo(() => {
    const { active: act, archived: arch } = toOptions(programmableOrganizations);
    const groups: { label: string; items: ItemOption[] }[] = [];
    if (act.length) groups.push({ label: m.admin_edition_organizations(), items: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), items: arch });
    return groups;
  }, [programmableOrganizations]);

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
            {isEdit
              ? m.admin_edition_edit_title({ id: initial!.id })
              : m.admin_content_edition_add()}
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
              <Alert variant="danger" className="py-1 mb-4 text-sm">
                {error}
              </Alert>
            )}

            {!isEdit && (
              <AdminField className="mb-4" controlId="edition-id">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_edition_id_label()}
                </AdminLabel>
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
                          className="bg-muted text-content border-input"
                          placeholder={m.admin_edition_id_placeholder()}
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

            <div className="flex gap-2 flex-wrap mb-4">
              <AdminField className="max-w-25" controlId="edition-year">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_edition_year_label()}
                </AdminLabel>
                <form.Field name="year">
                  {(field) => (
                    <AdminInput
                      type="number"
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
              <AdminField className="min-w-35 grow-1 shrink-1 basis-35" controlId="edition-month">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_edition_month_label()}
                </AdminLabel>
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
                          className="bg-muted text-content border-input"
                          placeholder={m.admin_edition_month_placeholder()}
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
              <AdminField className="min-w-45 grow-1 shrink-1 basis-45" controlId="edition-type">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_edition_type_label()}
                </AdminLabel>
                <form.Field name="editionType">
                  {(field) => (
                    <AdminSelect
                      value={field.value}
                      onValueChange={(e) => {
                        field.handleChange(e as EditionType);
                        if (e !== "festival") {
                          form.setFieldValue("selectedOrganizations", [] as ItemOption[]);
                        }
                      }}
                      onBlur={field.handleBlur}
                      className="bg-muted text-content border-input"
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
                    className="text-content self-end mb-1"
                  />
                )}
              </form.Field>
            </div>

            <AdminField className="mb-4" controlId="edition-venue">
              <AdminLabel className="text-subtle text-sm mb-1">
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
                        className="bg-muted text-content border-input"
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

            <div className="rounded-md border border-subtle p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div className="text-content text-sm font-semibold">
                  {typeLabel(editionType)} {m.admin_edition_date_handling()}
                </div>
                <span className="text-subtle text-sm">{m.admin_edition_dates_info()}</span>
              </div>
              {isFestival ? (
                <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2">
                  {["Friday", "Saturday", "Sunday"].map((label, index) => (
                    <AdminField
                      className="site-md:w-4/12"
                      key={label}
                      controlId={`edition-date-${label.toLowerCase()}`}
                    >
                      <AdminLabel className="text-subtle text-sm mb-1">{label}</AdminLabel>
                      <AdminInput
                        type="date"
                        value={previewDates[index] ?? ""}
                        className="bg-muted text-content border-input"
                        readOnly
                        disabled={!previewDates[index]}
                      />
                    </AdminField>
                  ))}
                </div>
              ) : (
                <AdminField controlId="edition-standalone-date">
                  <AdminLabel className="text-subtle text-sm mb-1">
                    {m.admin_edition_date_label()}
                  </AdminLabel>
                  <AdminInput
                    type="date"
                    value={previewDates[0] ?? ""}
                    className="bg-muted text-content border-input"
                    readOnly
                    disabled={!previewDates[0]}
                  />
                </AdminField>
              )}
              <div className="text-subtle text-sm mt-2">
                {isEdit
                  ? m.admin_edition_update_event_dates()
                  : m.admin_edition_create_first_then_events()}
              </div>
            </div>

            <AdminField className="mb-4" controlId="edition-co-organizer">
              <AdminLabel className="text-subtle text-sm mb-1">
                {m.admin_edition_co_organizer_label()}
              </AdminLabel>
              <form.Field name="coOrganizerId">
                {(field) => (
                  <AdminSelect
                    className="bg-muted text-content border-input"
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e)}
                    onBlur={field.handleBlur}
                  >
                    <AdminOption value="">{m.admin_edition_co_organizer_none()}</AdminOption>
                    {allOrganizations
                      .filter((organization) => organization.active !== false)
                      .map((organization) => (
                        <AdminOption key={organization.id} value={String(organization.id)}>
                          {organization.name}
                        </AdminOption>
                      ))}
                  </AdminSelect>
                )}
              </form.Field>
              <div className="text-subtle text-sm mt-1">{m.admin_edition_co_organizer_help()}</div>
            </AdminField>

            {isFestival && (
              <AdminField className="mb-4" controlId="edition-organizations">
                <AdminLabel className="text-subtle text-sm mb-1">
                  {m.admin_edition_festival_organizations()}
                </AdminLabel>
                {organizationsQuery.isPending ? (
                  <div className="text-subtle text-sm">
                    <Spinner size="sm" className="me-2" />
                    {m.admin_edition_loading_organizations()}
                  </div>
                ) : (
                  <form.Field name="selectedOrganizations">
                    {(field) => (
                      <Combobox
                        multiple
                        items={organizationGroups}
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
                                      option.isArchived ? "text-muted-foreground" : undefined
                                    }
                                  >
                                    {option.label}
                                  </ComboboxChip>
                                ))}
                                <ComboboxChipsInput
                                  id="edition-organizations"
                                  aria-label={m.admin_edition_festival_organizations()}
                                  onBlur={field.handleBlur}
                                  placeholder={m.admin_edition_organizations()}
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
                                        option.isArchived ? "text-muted-foreground" : undefined
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
            <Button variant="outline" size="sm" onClick={onHide}>
              {m.close()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={saveEditionMutation.isPending}
            >
              {saveEditionMutation.isPending ? <Spinner size="sm" /> : <Icon icon={SaveIcon} />}
              {m.admin_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
