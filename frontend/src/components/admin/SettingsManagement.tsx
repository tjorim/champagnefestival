import {
  AdminCheck,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminDescription,
} from "@/components/admin/AdminFields";
/**
 * SettingsManagement — site-wide toggles. Currently just maintenance mode.
 */

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { Spinner } from "@/components/ui/spinner";
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
      const saved = await updateMutation.mutateAsync({
        public_email: value.publicEmail,
        public_phone: value.publicPhone,
        facebook_url: value.facebookUrl,
      });
      // A completed save establishes a new baseline only if no newer edits
      // were entered while the request was in flight.
      const current = form.state.values;
      if (
        current.publicEmail === value.publicEmail &&
        current.publicPhone === value.publicPhone &&
        current.facebookUrl === value.facebookUrl
      ) {
        form.reset({
          publicEmail: saved.public_email,
          publicPhone: saved.public_phone,
          facebookUrl: saved.facebook_url,
        });
      }
    },
  });

  // Refresh pristine forms after loading or syncing settings. Dirty contact
  // drafts survive unrelated maintenance-mode changes and background refetches.
  const [prevSettingsData, setPrevSettingsData] = useState(settingsQuery.data);
  if (settingsQuery.data !== prevSettingsData) {
    setPrevSettingsData(settingsQuery.data);
    if (settingsQuery.data && !form.state.isDirty) form.reset(defaultValues);
  }

  return (
    <Card tone="secondary">
      <CardHeader className="tw:font-semibold">{m.admin_content_settings_section()}</CardHeader>
      <CardContent>
        {updateMutation.isError && (
          <Alert variant="danger" className="tw:py-1 tw:mb-4 tw:text-sm">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : m.admin_error_update_settings()}
          </Alert>
        )}
        {settingsQuery.isError ? (
          <Alert variant="danger" className="tw:py-1 tw:mb-0 tw:text-sm">
            {m.admin_error_load_settings()}
          </Alert>
        ) : settingsQuery.isPending ? (
          <Spinner label={m.admin_loading()} size="sm" />
        ) : (
          <>
            <AdminCheck
              type="switch"
              id="maintenance-mode-switch"
              label={m.admin_settings_maintenance_mode_label()}
              checked={maintenanceMode ?? false}
              disabled={updateMutation.isPending}
              onCheckedChange={(e) => updateMutation.mutate({ maintenance_mode: e })}
            />
            <div className="tw:text-subtle tw:text-sm tw:mt-2">
              {m.admin_settings_maintenance_mode_help()}
            </div>
            <hr className="border-secondary tw:my-6" />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field name="publicEmail">
                {(field) => (
                  <AdminField className="tw:mb-4" controlId="public-email">
                    <AdminLabel>{m.admin_settings_public_email_label()}</AdminLabel>
                    <AdminInput
                      type="email"
                      value={field.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <AdminDescription className="tw:text-subtle">
                      {m.admin_settings_public_email_help()}
                    </AdminDescription>
                  </AdminField>
                )}
              </form.Field>
              <form.Field name="publicPhone">
                {(field) => (
                  <AdminField className="tw:mb-4" controlId="public-phone">
                    <AdminLabel>{m.admin_settings_public_phone_label()}</AdminLabel>
                    <AdminInput
                      type="tel"
                      value={field.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <AdminDescription className="tw:text-subtle">
                      {m.admin_settings_public_phone_help()}
                    </AdminDescription>
                  </AdminField>
                )}
              </form.Field>
              <form.Field name="facebookUrl">
                {(field) => (
                  <AdminField className="tw:mb-4" controlId="facebook-url">
                    <AdminLabel>{m.admin_settings_facebook_url_label()}</AdminLabel>
                    <AdminInput
                      type="url"
                      pattern="https://.*"
                      value={field.value}
                      disabled={updateMutation.isPending}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                    <AdminDescription className="tw:text-subtle">
                      {m.admin_settings_facebook_url_help()}
                    </AdminDescription>
                  </AdminField>
                )}
              </form.Field>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? m.admin_settings_saving()
                  : m.admin_settings_save_contact()}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
