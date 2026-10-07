import {
  AdminField,
  AdminLabel,
  AdminInput,
  AdminTextarea,
  AdminError,
  AdminSelect,
  AdminOption,
} from "@/components/admin/AdminFields";
import { LoaderCircleIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/utils/queryKeys";
import type { ItemDraft } from "./itemTypes";
import { fetchAdminPersonOptions, type PersonOption } from "@/utils/adminRegistrationApi";

interface ItemModalProps {
  show: boolean;
  initial: ItemDraft | null; // null = new item
  authHeaders: () => Record<string, string>;
  onSave: (item: ItemDraft) => void;
  onHide: () => void;
}

export default function ItemModal({ show, initial, authHeaders, onSave, onHide }: ItemModalProps) {
  const [descriptionError, setDescriptionError] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EventModal for the details.
  const defaultValues = useMemo(() => {
    const cp = initial?.contactPerson;
    return {
      name: initial?.name ?? "",
      image: initial?.image ?? "",
      website: initial?.website ?? "",
      description_language: initial?.description_language ?? "nl",
      description_nl: initial?.description_nl ?? "",
      description_fr: initial?.description_fr ?? "",
      description_en: initial?.description_en ?? "",
      type: initial?.type ?? "vendor",
      contactOption: (cp
        ? {
            value: cp.id,
            label: cp.name,
            sub: [cp.email, cp.phone].filter(Boolean).join(" · "),
            name: cp.name,
            email: cp.email ?? "",
            phone: cp.phone ?? "",
          }
        : null) as PersonOption | null,
    };
  }, [initial]);

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const hasDescription = [
        value.description_nl,
        value.description_fr,
        value.description_en,
      ].some((text) => text.trim());
      if (hasDescription && !value[`description_${value.description_language}`].trim()) {
        setDescriptionError(true);
        return;
      }
      setDescriptionError(false);
      onSave({
        // 0 marks the item as new. A client-minted positive id (e.g. Date.now())
        // reads as an existing record to saveContentSectionItem, which then sends
        // an update against an id the server has never seen.
        id: initial?.id ?? 0,
        name: value.name.trim(),
        image: value.image.trim(),
        website: value.website.trim(),
        description_language: hasDescription ? value.description_language : null,
        description_nl: value.description_nl.trim() || null,
        description_fr: value.description_fr.trim() || null,
        description_en: value.description_en.trim() || null,
        active: initial?.active ?? true,
        type: value.type,
        contactPersonId: value.contactOption?.value ?? null,
        contactPerson: value.contactOption
          ? {
              id: value.contactOption.value,
              name: value.contactOption.label,
              email: value.contactOption.email,
              phone: value.contactOption.phone,
            }
          : null,
      });
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
      setDescriptionError(false);
      setPersonQuery("");
      setDebouncedPersonQuery("");
    }
  }

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      setDebouncedPersonQuery(personQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [personQuery, show]);

  const personOptionsQuery = useQuery({
    queryKey: queryKeys.admin.itemModalPeople(debouncedPersonQuery),
    queryFn: ({ signal }) => fetchAdminPersonOptions(debouncedPersonQuery, authHeaders, signal),
    enabled: show && debouncedPersonQuery.length > 0,
    staleTime: 30 * 1000,
    retry: false,
  });

  const personOptions = personOptionsQuery.data ?? [];
  const loadingPersons = personOptionsQuery.isFetching;

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
            {initial ? m.admin_content_edit_item() : m.admin_content_add_item()}
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
            <AdminField className="mb-4" controlId="item-name">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_content_name_placeholder()}
              </AdminLabel>
              <form.Field
                name="name"
                validators={[
                  {
                    run: ({ value }) => (!value?.trim() ? m.admin_item_name_required() : undefined),
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
            <AdminField className="mb-4" controlId="item-image">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_content_image_url_placeholder()}
              </AdminLabel>
              <form.Field
                name="image"
                validators={[
                  {
                    run: ({ value }) =>
                      !value?.trim() ? m.admin_item_image_required() : undefined,
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
            <AdminField className="mb-4" controlId="item-website">
              <AdminLabel className="text-subtle text-sm">{m.admin_item_website_url()}</AdminLabel>
              <form.Field
                name="website"
                validators={[
                  {
                    run: ({ value }) =>
                      value && !/^https?:\/\/.+/.test(value)
                        ? m.admin_item_url_invalid()
                        : undefined,
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const showErr = field.meta.isTouched && field.errors.length > 0;
                  return (
                    <>
                      <AdminInput
                        type="url"
                        className="bg-muted text-content border-input"
                        placeholder="https://…"
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
            <AdminField className="mb-4" controlId="item-description-language">
              <AdminLabel>{m.admin_item_description_language()}</AdminLabel>
              <form.Field name="description_language">
                {(field) => (
                  <AdminSelect
                    value={field.value}
                    onValueChange={(value) => field.handleChange(value as "nl" | "fr" | "en")}
                  >
                    <AdminOption value="nl">{m.admin_item_description_nl()}</AdminOption>
                    <AdminOption value="fr">{m.admin_item_description_fr()}</AdminOption>
                    <AdminOption value="en">{m.admin_item_description_en()}</AdminOption>
                  </AdminSelect>
                )}
              </form.Field>
            </AdminField>
            <p className="text-sm text-subtle mb-4">{m.admin_item_description_help()}</p>
            {descriptionError && (
              <AdminError>{m.admin_item_description_original_required()}</AdminError>
            )}
            {(["nl", "fr", "en"] as const).map((language) => (
              <AdminField
                key={language}
                className="mb-4"
                controlId={`item-description-${language}`}
              >
                <AdminLabel>
                  {{
                    nl: m.admin_item_description_nl,
                    fr: m.admin_item_description_fr,
                    en: m.admin_item_description_en,
                  }[language]()}
                </AdminLabel>
                <form.Field name={`description_${language}`}>
                  {(field) => (
                    <AdminTextarea
                      maxLength={600}
                      value={field.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  )}
                </form.Field>
              </AdminField>
            ))}
            <AdminField className="mb-4" controlId="item-type">
              <AdminLabel className="text-subtle text-sm">{m.admin_item_type()}</AdminLabel>
              <form.Field name="type">
                {(field) => (
                  <AdminSelect
                    className="bg-muted text-content border-input"
                    value={field.value}
                    onValueChange={(e) => field.handleChange(e)}
                    onBlur={field.handleBlur}
                  >
                    <AdminOption value="vendor">{m.admin_item_vendor()}</AdminOption>
                    <AdminOption value="producer">{m.admin_item_producer()}</AdminOption>
                    <AdminOption value="sponsor">{m.admin_item_sponsor()}</AdminOption>
                  </AdminSelect>
                )}
              </form.Field>
            </AdminField>
            <AdminField controlId="item-contact-person">
              <AdminLabel className="text-subtle text-sm">
                {m.admin_item_contact_person()}
              </AdminLabel>
              <form.Field name="contactOption">
                {(field) => (
                  <Combobox
                    items={personOptions}
                    value={field.value}
                    onValueChange={(option) => field.handleChange(option)}
                    onInputValueChange={setPersonQuery}
                    filter={null}
                    itemToStringLabel={(option: PersonOption) => option.label}
                    isItemEqualToValue={(a: PersonOption, b: PersonOption) => a.value === b.value}
                  >
                    <ComboboxInput
                      id="item-contact-person"
                      aria-label={m.admin_item_contact_person()}
                      showClear
                      onBlur={field.handleBlur}
                      placeholder={m.admin_search_person_placeholder()}
                      aria-busy={loadingPersons}
                    >
                      {loadingPersons && (
                        <LoaderCircleIcon
                          className="size-4 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </ComboboxInput>
                    <ComboboxContent>
                      {!loadingPersons && (
                        <ComboboxEmpty>{m.admin_people_no_results()}</ComboboxEmpty>
                      )}
                      <ComboboxList>
                        {(opt: PersonOption) => (
                          <ComboboxItem key={opt.value} value={opt}>
                            <div>
                              <div>{opt.label}</div>
                              {opt.sub && (
                                <small className="text-muted-foreground">{opt.sub}</small>
                              )}
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )}
              </form.Field>
            </AdminField>
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
