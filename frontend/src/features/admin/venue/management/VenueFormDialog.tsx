import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminLabel,
  AdminInput,
} from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { lazy, Suspense, useMemo, useState } from "react";
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
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { Venue, VenueUpdate } from "@/api-types";

const MapComponent = lazy(() => import("@/components/MapComponent"));

const emptyVenueForm = {
  name: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  lat: null as number | null,
  lng: null as number | null,
};

interface VenueFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save (the parent clears the edit target and closes the dialog). */
  onSaved: () => void;
  editingId: string | null;
  editingVenue: Venue | null;
  error: string | null;
  onError: (message: string | null) => void;
  onAdd: (
    name: string,
    address: string,
    city: string,
    postalCode: string,
    country: string,
    lat: number | null,
    lng: number | null,
  ) => Promise<void>;
  onUpdate: (id: string, data: VenueUpdate) => Promise<void>;
}

export function VenueFormDialog({
  open: showVenueModal,
  onClose,
  onSaved,
  editingId: editingVenueId,
  editingVenue,
  error: addVenueError,
  onError: setAddVenueError,
  onAdd,
  onUpdate,
}: VenueFormDialogProps) {
  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EditionModal for the details.
  const venueDefaultValues = useMemo(
    () =>
      editingVenue
        ? {
            name: editingVenue.name,
            address: editingVenue.address,
            city: editingVenue.city,
            postalCode: editingVenue.postal_code,
            country: editingVenue.country,
            lat: editingVenue.lat,
            lng: editingVenue.lng,
          }
        : emptyVenueForm,
    [editingVenue],
  );

  const venueForm = useForm({
    defaultValues: venueDefaultValues,
    onSubmit: async ({ value }) => {
      if (!venueFormIsValid) return;
      setAddVenueError(null);
      try {
        const data = {
          name: value.name.trim(),
          address: value.address.trim(),
          city: value.city.trim(),
          postal_code: value.postalCode.trim(),
          country: value.country.trim(),
          lat: value.lat,
          lng: value.lng,
        };
        if (editingVenueId) await onUpdate(editingVenueId, data);
        else
          await onAdd(
            data.name,
            data.address,
            data.city,
            data.postal_code,
            data.country,
            data.lat,
            data.lng,
          );
        onSaved();
      } catch (err) {
        setAddVenueError(apiErrorMessage(err, m.admin_error_add_venue()));
      }
    },
  });
  const venueValues = useSelector(venueForm.atom, (s) => s.values);

  const { lat, lng } = venueValues;
  const venueCoordinatesAreValid =
    (lat === null || (lat >= -90 && lat <= 90)) && (lng === null || (lng >= -180 && lng <= 180));
  const venueFormIsValid = venueValues.name.trim().length > 0 && venueCoordinatesAreValid;
  const previewCoordinates =
    venueCoordinatesAreValid && lat !== null && lng !== null ? { lat, lng } : null;

  // Seed the form when the modal opens. Reset during render rather than in an
  // effect (the "adjusting state when a prop changes" pattern) since this only
  // needs to react to the show=false->true transition — see VolunteerFormModal
  // for why the reset value must match `venueDefaultValues`.
  const [wasVenueModalShown, setWasVenueModalShown] = useState(showVenueModal);
  if (showVenueModal !== wasVenueModalShown) {
    setWasVenueModalShown(showVenueModal);
    if (showVenueModal) venueForm.reset(venueDefaultValues);
  }

  const handleSaveVenue = () => {
    void venueForm.handleSubmit();
  };

  return (
    <Dialog
      open={showVenueModal}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent admin size="default">
        <DialogHeader>
          <DialogTitle id="add-venue-modal-title">
            {editingVenueId ? `${m.admin_edit()} ${venueValues.name}` : m.admin_venue_add()}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {addVenueError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mb-4 text-sm"
            >
              {addVenueError}
            </Alert>
          )}
          <AdminField className="mb-4" controlId="venue-name">
            <AdminLabel>{m.admin_venue_name_label()}</AdminLabel>
            <venueForm.Field name="name">
              {(field) => (
                <AdminInput
                  type="text"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className={ADMIN_CONTROL_CLASS}
                  placeholder={m.admin_venue_name_placeholder()}
                />
              )}
            </venueForm.Field>
          </AdminField>
          <AdminField className="mb-4" controlId="venue-address">
            <AdminLabel>{m.admin_venue_address_label()}</AdminLabel>
            <venueForm.Field name="address">
              {(field) => (
                <AdminInput
                  type="text"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className={ADMIN_CONTROL_CLASS}
                />
              )}
            </venueForm.Field>
          </AdminField>
          <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2 mb-4">
            <div className="min-w-0 flex-1">
              <AdminField controlId="venue-city">
                <AdminLabel>{m.admin_venue_city_label()}</AdminLabel>
                <venueForm.Field name="city">
                  {(field) => (
                    <AdminInput
                      type="text"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </venueForm.Field>
              </AdminField>
            </div>
            <div className="w-auto flex-none">
              <AdminField controlId="venue-postal-code">
                <AdminLabel>{m.admin_venue_postal_code_label()}</AdminLabel>
                <venueForm.Field name="postalCode">
                  {(field) => (
                    <AdminInput
                      type="text"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="bg-muted text-content border-input w-28"
                    />
                  )}
                </venueForm.Field>
              </AdminField>
            </div>
          </div>
          <AdminField className="mb-4" controlId="venue-country">
            <AdminLabel>{m.admin_venue_country_label()}</AdminLabel>
            <venueForm.Field name="country">
              {(field) => (
                <AdminInput
                  type="text"
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className={ADMIN_CONTROL_CLASS}
                />
              )}
            </venueForm.Field>
          </AdminField>
          <div className="flex flex-wrap -mx-1 *:w-full *:px-1 gap-y-2">
            <div className="min-w-0 flex-1">
              <AdminField controlId="venue-latitude">
                <AdminLabel>{m.admin_venue_latitude_label()}</AdminLabel>
                <venueForm.Field name="lat">
                  {(field) => (
                    <AdminInput
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.handleChange(e.target.value === "" ? null : Number(e.target.value))
                      }
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </venueForm.Field>
              </AdminField>
            </div>
            <div className="min-w-0 flex-1">
              <AdminField controlId="venue-longitude">
                <AdminLabel>{m.admin_venue_longitude_label()}</AdminLabel>
                <venueForm.Field name="lng">
                  {(field) => (
                    <AdminInput
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.handleChange(e.target.value === "" ? null : Number(e.target.value))
                      }
                      onBlur={field.handleBlur}
                      className={ADMIN_CONTROL_CLASS}
                    />
                  )}
                </venueForm.Field>
              </AdminField>
            </div>
          </div>
          {previewCoordinates && (
            <div className="mt-4">
              <div className="text-subtle text-sm mb-1">{m.admin_venue_map_preview()}</div>
              <Suspense
                fallback={
                  <div className="flex aspect-video items-center justify-center rounded-md border border-subtle">
                    {m.loading()}
                  </div>
                }
              >
                <MapComponent
                  location={venueValues.name}
                  address={venueValues.address}
                  city={venueValues.city}
                  postalCode={venueValues.postalCode}
                  country={venueValues.country}
                  coordinates={previewCoordinates}
                />
              </Suspense>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose()}>
            {m.admin_action_cancel()}
          </Button>
          <Button variant="warning" onClick={handleSaveVenue} disabled={!venueFormIsValid}>
            {m.admin_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
