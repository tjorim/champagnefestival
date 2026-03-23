import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/utils/queryKeys";
import type { ItemDraft } from "./itemTypes";
import { fetchAdminPersonOptions, type PersonOption } from "@/utils/adminRegistrationApi";

const darkSelectStyles: StylesConfig<PersonOption, false> = {
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
    color: "#f8f9fa",
    cursor: "pointer",
  }),
  singleValue: (base) => ({ ...base, color: "#f8f9fa" }),
  input: (base) => ({ ...base, color: "#f8f9fa" }),
  placeholder: (base) => ({ ...base, color: "#6c757d" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "#6c757d" }),
  dropdownIndicator: (base) => ({ ...base, color: "#6c757d" }),
  clearIndicator: (base) => ({ ...base, color: "#6c757d" }),
  noOptionsMessage: (base) => ({ ...base, color: "#adb5bd" }),
};

interface ItemModalProps {
  show: boolean;
  initial: ItemDraft | null; // null = new item
  authHeaders: () => Record<string, string>;
  onSave: (item: ItemDraft) => void;
  onHide: () => void;
}

interface ItemFormFields {
  name: string;
  image: string;
  website: string;
  type: string;
  contactOption: SingleValue<PersonOption>;
}

export default function ItemModal({ show, initial, authHeaders, onSave, onHide }: ItemModalProps) {
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");

  const { register, handleSubmit, reset, control } = useForm<ItemFormFields>({
    defaultValues: {
      name: "",
      image: "",
      website: "",
      type: "vendor",
      contactOption: null,
    },
  });

  useEffect(() => {
    if (!show) return;
    const cp = initial?.contactPerson;
    reset({
      name: initial?.name ?? "",
      image: initial?.image ?? "",
      website: initial?.website ?? "",
      type: initial?.type ?? "vendor",
      contactOption: cp
        ? {
            value: cp.id,
            label: cp.name,
            sub: [cp.email, cp.phone].filter(Boolean).join(" · "),
            name: cp.name,
            email: cp.email ?? "",
            phone: cp.phone ?? "",
          }
        : null,
    });
    setPersonQuery("");
    setDebouncedPersonQuery("");
  }, [show, initial, reset]);

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

  function onSubmit(data: ItemFormFields) {
    if (!data.name.trim() || !data.image.trim()) return;
    onSave({
      id: initial?.id ?? Date.now(),
      name: data.name.trim(),
      image: data.image.trim(),
      website: data.website.trim(),
      active: initial?.active ?? true,
      type: data.type,
      contactPersonId: data.contactOption?.value ?? null,
      contactPerson: data.contactOption
        ? {
            id: data.contactOption.value,
            name: data.contactOption.label,
            email: data.contactOption.email,
            phone: data.contactOption.phone,
          }
        : null,
    });
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {initial ? m.admin_content_edit_item() : m.admin_content_add_item()}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Modal.Body className="bg-dark">
          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">
              {m.admin_content_name_placeholder()}
            </Form.Label>
            <Form.Control
              className="bg-dark text-light border-secondary"
              required
              autoFocus
              {...register("name", { required: true })}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">
              {m.admin_content_image_url_placeholder()}
            </Form.Label>
            <Form.Control
              className="bg-dark text-light border-secondary"
              required
              {...register("image", { required: true })}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_item_website_url()}</Form.Label>
            <Form.Control
              type="url"
              className="bg-dark text-light border-secondary"
              placeholder="https://…"
              {...register("website")}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_item_type()}</Form.Label>
            <Form.Select
              className="bg-dark text-light border-secondary"
              {...register("type")}
            >
              <option value="vendor">{m.admin_item_vendor()}</option>
              <option value="producer">{m.admin_item_producer()}</option>
              <option value="sponsor">{m.admin_item_sponsor()}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="text-secondary small">
              {m.admin_item_contact_person()}
            </Form.Label>
            <Controller
              name="contactOption"
              control={control}
              render={({ field: { value, onChange } }) => (
                <Select<PersonOption, false>
                  isClearable
                  options={personOptions}
                  value={value}
                  onChange={onChange}
                  onInputChange={(v) => setPersonQuery(v)}
                  inputValue={personQuery}
                  isLoading={loadingPersons}
                  filterOption={null}
                  styles={darkSelectStyles}
                  placeholder={m.admin_search_person_placeholder()}
                  classNamePrefix="rs"
                  formatOptionLabel={(opt) => (
                    <div>
                      <div>{opt.label}</div>
                      {opt.sub && <small className="text-secondary">{opt.sub}</small>}
                    </div>
                  )}
                />
              )}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.close()}
          </Button>
          <Button type="submit" variant="warning" size="sm">
            <i className="bi bi-floppy me-1" aria-hidden="true" />
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
