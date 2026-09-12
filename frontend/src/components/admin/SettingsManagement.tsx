/**
 * SettingsManagement — site-wide toggles. Currently just maintenance mode.
 */

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";

interface SettingsManagementProps {
  authHeaders: () => Record<string, string>;
}

interface ApiAppSettings {
  maintenance_mode: boolean;
  public_email: string;
  public_phone: string;
  facebook_url: string;
}

export default function SettingsManagement({ authHeaders }: SettingsManagementProps) {
  const queryClient = useQueryClient();
  const settingsQueryKey = queryKeys.admin.settings;

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () =>
      fetchJsonOrThrowWithUnauthorized<ApiAppSettings>(
        "/api/settings",
        { headers: authHeaders() },
        m.admin_error_load_settings(),
      ),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<ApiAppSettings>) =>
      fetchJsonOrThrowWithUnauthorized<ApiAppSettings>(
        "/api/settings",
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(updates),
        },
        m.admin_error_update_settings(),
      ),
    onSettled: () =>
      void invalidateAdmin(queryClient, [settingsQueryKey, queryKeys.maintenanceMode]),
    retry: false,
  });

  const maintenanceMode = settingsQuery.data?.maintenance_mode;

  // Derived rather than a static template: `useForm` re-applies `defaultValues`
  // on every render, so a template that disagrees with what `form.reset(record)`
  // stored gets re-applied and blanks the form. See EditionModal for the details.
  const defaultValues = useMemo(
    () => ({
      publicEmail: settingsQuery.data?.public_email ?? "",
      publicPhone: settingsQuery.data?.public_phone ?? "",
      facebookUrl: settingsQuery.data?.facebook_url ?? "",
    }),
    [settingsQuery.data],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        public_email: value.publicEmail,
        public_phone: value.publicPhone,
        facebook_url: value.facebookUrl,
      });
    },
  });

  // Seed the editable fields once the settings load. Reset during render
  // (comparing against the previous query data) rather than in an effect,
  // since this only needs to react to that data actually changing.
  const [prevSettingsData, setPrevSettingsData] = useState(settingsQuery.data);
  if (settingsQuery.data !== prevSettingsData) {
    setPrevSettingsData(settingsQuery.data);
    if (settingsQuery.data) form.reset(defaultValues);
  }

  return (
    <Card bg="dark" text="white" border="secondary">
      <Card.Header className="fw-semibold">{m.admin_content_settings_section()}</Card.Header>
      <Card.Body>
        {updateMutation.isError && (
          <Alert variant="danger" className="py-1 mb-3 small">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : m.admin_error_update_settings()}
          </Alert>
        )}
        {settingsQuery.isError ? (
          <Alert variant="danger" className="py-1 mb-0 small">
            {m.admin_error_load_settings()}
          </Alert>
        ) : settingsQuery.isPending ? (
          <Spinner animation="border" size="sm" />
        ) : (
          <>
            <Form.Check
              type="switch"
              id="maintenance-mode-switch"
              label={m.admin_settings_maintenance_mode_label()}
              checked={maintenanceMode ?? false}
              disabled={updateMutation.isPending}
              onChange={(e) => updateMutation.mutate({ maintenance_mode: e.target.checked })}
            />
            <div className="text-secondary small mt-2">
              {m.admin_settings_maintenance_mode_help()}
            </div>
            <hr className="border-secondary my-4" />
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field name="publicEmail">
                {(field) => (
                  <Form.Group className="mb-3" controlId="public-email">
                    <Form.Label>{m.admin_settings_public_email_label()}</Form.Label>
                    <Form.Control
                      type="email"
                      value={field.state.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <Form.Text className="text-secondary">
                      {m.admin_settings_public_email_help()}
                    </Form.Text>
                  </Form.Group>
                )}
              </form.Field>
              <form.Field name="publicPhone">
                {(field) => (
                  <Form.Group className="mb-3" controlId="public-phone">
                    <Form.Label>{m.admin_settings_public_phone_label()}</Form.Label>
                    <Form.Control
                      type="tel"
                      value={field.state.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <Form.Text className="text-secondary">
                      {m.admin_settings_public_phone_help()}
                    </Form.Text>
                  </Form.Group>
                )}
              </form.Field>
              <form.Field name="facebookUrl">
                {(field) => (
                  <Form.Group className="mb-3" controlId="facebook-url">
                    <Form.Label>{m.admin_settings_facebook_url_label()}</Form.Label>
                    <Form.Control
                      type="url"
                      pattern="https://.*"
                      value={field.state.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <Form.Text className="text-secondary">
                      {m.admin_settings_facebook_url_help()}
                    </Form.Text>
                  </Form.Group>
                )}
              </form.Field>
              <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? m.admin_settings_saving()
                  : m.admin_settings_save_contact()}
              </Button>
            </Form>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
