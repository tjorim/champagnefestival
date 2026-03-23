import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type GroupBase, type MultiValue, type StylesConfig } from "react-select";
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

type ItemSelectStyles = StylesConfig<ItemOption, true, GroupBase<ItemOption>>;

const darkSelectStyles: ItemSelectStyles = {
  control: (base) => ({
    ...base,
    backgroundColor: "#212529",
    borderColor: "#6c757d",
    color: "#f8f9fa",
    minHeight: "34px",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#212529",
    border: "1px solid #6c757d",
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#343a40" : "#212529",
    color: state.data.isArchived ? "#6c757d" : "#f8f9fa",
    cursor: "pointer",
  }),
  multiValue: (base, state) => ({
    ...base,
    backgroundColor: state.data.isArchived ? "#343a40" : "#495057",
  }),
  multiValueLabel: (base, state) => ({
    ...base,
    color: state.data.isArchived ? "#adb5bd" : "#f8f9fa",
    fontSize: "0.8rem",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#adb5bd",
    ":hover": { backgroundColor: "#dc3545", color: "white" },
  }),
  input: (base) => ({ ...base, color: "#f8f9fa" }),
  placeholder: (base) => ({ ...base, color: "#6c757d" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "#6c757d" }),
  dropdownIndicator: (base) => ({ ...base, color: "#6c757d" }),
  clearIndicator: (base) => ({ ...base, color: "#6c757d" }),
  groupHeading: (base) => ({ ...base, color: "#adb5bd", fontSize: "0.7rem" }),
  noOptionsMessage: (base) => ({ ...base, color: "#adb5bd" }),
};

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

interface EditionFormFields {
  id: string;
  year: number;
  month: string;
  editionType: EditionType;
  venueId: string;
  active: boolean;
  externalPartner: string;
  externalContactName: string;
  externalContactEmail: string;
  selectedExhibitors: MultiValue<ItemOption>;
}

export default function EditionModal({
  show,
  initial,
  venues,
  authHeaders,
  onSaved,
  onHide,
}: EditionModalProps) {
  const venuesRef = useRef(venues);
  venuesRef.current = venues;
  const hydratedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, setValue, control } =
    useForm<EditionFormFields>({
      defaultValues: {
        id: "",
        year: new Date().getFullYear(),
        month: "",
        editionType: "festival",
        venueId: "",
        active: true,
        externalPartner: "",
        externalContactName: "",
        externalContactEmail: "",
        selectedExhibitors: [],
      },
    });

  useEffect(() => {
    if (!show) return;
    hydratedRef.current = false;
    const preseeded: MultiValue<ItemOption> = initial
      ? [...(initial.producers ?? []), ...(initial.sponsors ?? [])].map((e) => ({
          value: e.id,
          label: e.name,
          isArchived: false,
        }))
      : [];
    reset({
      id: initial?.id ?? "",
      year: initial?.year ?? new Date().getFullYear(),
      month: initial?.month ?? "",
      editionType: initial?.editionType ?? "festival",
      venueId: initial?.venue?.id ?? venuesRef.current.find((v) => v.active)?.id ?? "",
      active: initial?.active ?? true,
      externalPartner: initial?.externalPartner ?? "",
      externalContactName: initial?.externalContactName ?? "",
      externalContactEmail: initial?.externalContactEmail ?? "",
      selectedExhibitors: preseeded,
    });
    setError(null);
  }, [show, initial, reset]);

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
      externalPartner?: string;
      externalContactName?: string;
      externalContactEmail?: string;
    }) => saveEdition(payload, authHeaders, initial?.id),
    retry: false,
  });

  const allExhibitors = useMemo(() => exhibitorsQuery.data ?? [], [exhibitorsQuery.data]);

  useEffect(() => {
    if (allExhibitors.length === 0 || hydratedRef.current) return;
    const ids = new Set(
      [...(initial?.producers ?? []), ...(initial?.sponsors ?? [])].map((e) => e.id),
    );
    const { active: act, archived: arch } = toOptions(allExhibitors);
    setValue("selectedExhibitors", [...act, ...arch].filter((o) => ids.has(o.value)));
    hydratedRef.current = true;
  }, [allExhibitors, initial, setValue]);

  const isEdit = !!initial;
  const editionType = watch("editionType");
  const isFestival = editionType === "festival";
  const programmableExhibitors = allExhibitors.filter(
    (exhibitor) => exhibitor.type === "producer" || exhibitor.type === "sponsor",
  );
  const exhibitorGroups = useMemo(() => {
    const { active: act, archived: arch } = toOptions(programmableExhibitors);
    const groups: GroupBase<ItemOption>[] = [];
    if (act.length) groups.push({ label: m.admin_edition_exhibitors(), options: act });
    if (arch.length) groups.push({ label: m.admin_content_archived_section(), options: arch });
    return groups;
  }, [programmableExhibitors]);

  const previewDates = useMemo(() => initial?.dates ?? [], [initial?.dates]);

  async function onSubmit(data: EditionFormFields) {
    if (!data.month.trim() || !data.venueId) return;
    if (!isEdit && data.id.trim() === "") {
      setError("ID cannot be empty or whitespace only");
      return;
    }

    try {
      const savedEdition = await saveEditionMutation.mutateAsync({
        id: data.id.trim(),
        year: data.year,
        month: data.month.trim(),
        editionType: data.editionType,
        venueId: data.venueId,
        active: data.active,
        exhibitorIds:
          data.editionType === "festival"
            ? data.selectedExhibitors.map((option: ItemOption) => option.value)
            : [],
        externalPartner: data.externalPartner,
        externalContactName: data.externalContactName,
        externalContactEmail: data.externalContactEmail,
      });
      onSaved(savedEdition);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : m.admin_content_error_save(),
      );
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {isEdit ? `Edit ${initial!.id}` : m.admin_content_edition_add()}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Modal.Body className="bg-dark">
          {error && (
            <Alert variant="danger" className="py-1 mb-3 small">
              {error}
            </Alert>
          )}

          {!isEdit && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">ID</Form.Label>
              <Form.Control
                className="bg-dark text-light border-secondary"
                placeholder="e.g. 2026-march"
                required
                autoFocus
                {...register("id", { required: true })}
              />
            </Form.Group>
          )}

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group style={{ maxWidth: "100px" }}>
              <Form.Label className="text-secondary small mb-1">Year</Form.Label>
              <Form.Control
                type="number"
                className="bg-dark text-light border-secondary"
                required
                {...register("year", { valueAsNumber: true, required: true })}
              />
            </Form.Group>
            <Form.Group style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">Month</Form.Label>
              <Form.Control
                className="bg-dark text-light border-secondary"
                placeholder="e.g. march"
                required
                {...register("month", { required: true })}
              />
            </Form.Group>
            <Form.Group style={{ minWidth: "180px", flex: "1 1 180px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_edition_type_label()}
              </Form.Label>
              <Controller
                name="editionType"
                control={control}
                render={({ field }) => (
                  <Form.Select
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (e.target.value !== "festival") setValue("selectedExhibitors", []);
                    }}
                    className="bg-dark text-light border-secondary"
                  >
                    <option value="festival">{m.admin_edition_type_festival()}</option>
                    <option value="bourse">{m.admin_edition_type_bourse()}</option>
                    <option value="capsule_exchange">
                      {m.admin_edition_type_capsule_exchange()}
                    </option>
                  </Form.Select>
                )}
              />
            </Form.Group>
            <Controller
              name="active"
              control={control}
              render={({ field: { value, onChange, ref } }) => (
                <Form.Check
                  type="checkbox"
                  id="modal-edition-active"
                  label={m.admin_content_edition_active()}
                  checked={value}
                  onChange={(e) => onChange(e.target.checked)}
                  ref={ref}
                  className="text-light align-self-end mb-1"
                />
              )}
            />
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_edition_venue_label()}
            </Form.Label>
            <Form.Select
              className="bg-dark text-light border-secondary"
              required
              {...register("venueId", { required: true })}
            >
              <option value="">{m.admin_edition_venue_placeholder()}</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                  {venue.active ? "" : " (archived)"}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="border border-secondary rounded p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="text-light small fw-semibold">
                {typeLabel(editionType)} {m.admin_edition_date_handling()}
              </div>
              <span className="text-secondary small">{m.admin_edition_dates_info()}</span>
            </div>
            {isFestival ? (
              <div className="row g-2">
                {["Friday", "Saturday", "Sunday"].map((label, index) => (
                  <div className="col-md-4" key={label}>
                    <Form.Label className="text-secondary small mb-1">{label}</Form.Label>
                    <Form.Control
                      type="date"
                      value={previewDates[index] ?? ""}
                      className="bg-dark text-light border-secondary"
                      readOnly
                      disabled={!previewDates[index]}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Form.Group>
                <Form.Label className="text-secondary small mb-1">Edition date</Form.Label>
                <Form.Control
                  type="date"
                  value={previewDates[0] ?? ""}
                  className="bg-dark text-light border-secondary"
                  readOnly
                  disabled={!previewDates[0]}
                />
              </Form.Group>
            )}
            <div className="text-secondary small mt-2">
              {isEdit
                ? m.admin_edition_update_event_dates()
                : m.admin_edition_create_first_then_events()}
            </div>
          </div>

          {!isFestival && (
            <div className="border border-secondary rounded p-3 mb-3">
              <div className="text-light small fw-semibold mb-2">
                {m.admin_edition_external_partner()}
              </div>
              <div className="row g-2">
                <div className="col-md-6">
                  <Form.Label className="text-secondary small mb-1">
                    {m.admin_edition_partner_label()}
                  </Form.Label>
                  <Form.Control
                    className="bg-dark text-light border-secondary"
                    placeholder="Partner organisation"
                    {...register("externalPartner")}
                  />
                </div>
                <div className="col-md-3">
                  <Form.Label className="text-secondary small mb-1">
                    {m.admin_edition_contact_name_label()}
                  </Form.Label>
                  <Form.Control
                    className="bg-dark text-light border-secondary"
                    placeholder="Jane Doe"
                    {...register("externalContactName")}
                  />
                </div>
                <div className="col-md-3">
                  <Form.Label className="text-secondary small mb-1">
                    {m.admin_edition_contact_email_label()}
                  </Form.Label>
                  <Form.Control
                    type="email"
                    className="bg-dark text-light border-secondary"
                    placeholder="jane@example.com"
                    {...register("externalContactEmail")}
                  />
                </div>
              </div>
            </div>
          )}

          {isFestival && (
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small mb-1">
                {m.admin_edition_festival_exhibitors()}
              </Form.Label>
              {exhibitorsQuery.isPending ? (
                <div className="text-secondary small">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.admin_edition_loading_exhibitors()}
                </div>
              ) : (
                <Controller
                  name="selectedExhibitors"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <Select<ItemOption, true>
                      isMulti
                      closeMenuOnSelect={false}
                      styles={darkSelectStyles}
                      options={exhibitorGroups}
                      value={value}
                      onChange={onChange}
                      classNamePrefix="rs"
                      placeholder={m.admin_edition_exhibitors()}
                    />
                  )}
                />
              )}
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
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
              <Spinner as="span" animation="border" size="sm" className="me-1" />
            ) : (
              <i className="bi bi-floppy me-1" aria-hidden="true" />
            )}
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
