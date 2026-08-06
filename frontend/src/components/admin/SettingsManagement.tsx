/**
 * SettingsManagement — site-wide toggles. Currently just maintenance mode.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";

interface SettingsManagementProps {
  authHeaders: () => Record<string, string>;
}

interface ApiAppSettings {
  maintenance_mode: boolean;
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
    mutationFn: (maintenanceMode: boolean) =>
      fetchJsonOrThrowWithUnauthorized<ApiAppSettings>(
        "/api/settings",
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ maintenance_mode: maintenanceMode }),
        },
        m.admin_error_update_settings(),
      ),
    onSettled: () =>
      void invalidateAdmin(queryClient, [settingsQueryKey, queryKeys.maintenanceMode]),
    retry: false,
  });

  const maintenanceMode = settingsQuery.data?.maintenance_mode;

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
              onChange={(e) => updateMutation.mutate(e.target.checked)}
            />
            <div className="text-secondary small mt-2">
              {m.admin_settings_maintenance_mode_help()}
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
