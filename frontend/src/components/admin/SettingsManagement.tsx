/**
 * SettingsManagement — site-wide toggles. Currently just maintenance mode.
 */

import { useEffect, useState } from "react";
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
  const [publicEmail, setPublicEmail] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");

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

  useEffect(() => {
    if (!settingsQuery.data) return;
    setPublicEmail(settingsQuery.data.public_email);
    setPublicPhone(settingsQuery.data.public_phone);
    setFacebookUrl(settingsQuery.data.facebook_url);
  }, [settingsQuery.data]);

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
                updateMutation.mutate({
                  public_email: publicEmail,
                  public_phone: publicPhone,
                  facebook_url: facebookUrl,
                });
              }}
            >
              <Form.Group className="mb-3" controlId="public-email">
                <Form.Label>{m.admin_settings_public_email_label()}</Form.Label>
                <Form.Control
                  type="email"
                  value={publicEmail}
                  disabled={updateMutation.isPending}
                  onChange={(event) => setPublicEmail(event.target.value)}
                />
                <Form.Text className="text-secondary">{m.admin_settings_public_email_help()}</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3" controlId="public-phone">
                <Form.Label>{m.admin_settings_public_phone_label()}</Form.Label>
                <Form.Control
                  type="tel"
                  value={publicPhone}
                  disabled={updateMutation.isPending}
                  onChange={(event) => setPublicPhone(event.target.value)}
                />
                <Form.Text className="text-secondary">{m.admin_settings_public_phone_help()}</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3" controlId="facebook-url">
                <Form.Label>{m.admin_settings_facebook_url_label()}</Form.Label>
                <Form.Control
                  type="url"
                  pattern="https://.*"
                  value={facebookUrl}
                  disabled={updateMutation.isPending}
                  onChange={(event) => setFacebookUrl(event.target.value)}
                />
                <Form.Text className="text-secondary">{m.admin_settings_facebook_url_help()}</Form.Text>
              </Form.Group>
              <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? m.admin_settings_saving() : m.admin_settings_save_contact()}
              </Button>
            </Form>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
