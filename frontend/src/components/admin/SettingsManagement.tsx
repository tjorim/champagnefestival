import {
  AdminCheck,
  AdminField,
  AdminLabel,
  AdminInput,
  AdminDescription,
} from "@/components/admin/AdminFields";
/**
 * SettingsManagement — site-wide settings: the maintenance-mode switch and the public contact
 * details. Both live in one settings record, so they share their queries and mutation; the
 * `section` prop renders either half on its own (the dashboard files them under Settings and
 * Content respectively) or, by default, both together.
 */

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/utils/apiErrors";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface SettingsManagementProps {
  authHeaders: () => Record<string, string>;
  section?: "all" | "maintenance" | "contact";
}

interface ApiAppSettings {
  maintenance_mode: boolean;
  member_limit: number | null;
  member_inactivity_months: number | null;
  public_email: string;
  public_phone: string;
  facebook_url: string;
}

export default function SettingsManagement({
  authHeaders,
  section = "all",
}: SettingsManagementProps) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog({ admin: true });
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
      void invalidateAdmin(queryClient, [
        settingsQueryKey,
        queryKeys.maintenanceMode,
        queryKeys.admin.peopleLists,
      ]),
    retry: false,
  });

  const memberDefaults = useMemo(
    () => ({
      limit: settingsQuery.data?.member_limit?.toString() ?? "",
      months: settingsQuery.data?.member_inactivity_months?.toString() ?? "",
    }),
    [settingsQuery.data],
  );
  const memberForm = useForm({
    defaultValues: memberDefaults,
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        member_limit: value.limit === "" ? null : Number(value.limit),
        member_inactivity_months: value.months === "" ? null : Number(value.months),
      });
      if (
        memberForm.state.values.limit === value.limit &&
        memberForm.state.values.months === value.months
      )
        memberForm.reset(value);
    },
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
    if (settingsQuery.data && !memberForm.state.isDirty) memberForm.reset(memberDefaults);
  }

  return (
    <>
      <Card tone="secondary">
        <CardHeader className="font-semibold">
          {section === "contact"
            ? m.admin_contact_details_section()
            : m.admin_content_settings_section()}
        </CardHeader>
        <CardContent>
          {updateMutation.isError && (
            <Alert variant="danger" className="py-1 mb-4 text-sm">
              {apiErrorMessage(updateMutation.error, m.admin_error_update_settings())}
            </Alert>
          )}
          {settingsQuery.isError ? (
            <Alert variant="danger" className="py-1 mb-0 text-sm">
              {m.admin_error_load_settings()}
            </Alert>
          ) : settingsQuery.isPending ? (
            <Spinner label={m.admin_loading()} size="sm" />
          ) : (
            <>
              {section !== "contact" && (
                <>
                  <form
                    className="mb-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void memberForm.handleSubmit();
                    }}
                  >
                    <h3>{m.admin_members_settings()}</h3>
                    <p className="text-subtle text-sm">{m.admin_members_settings_help()}</p>
                    <memberForm.Field name="limit">
                      {(field) => (
                        <AdminField className="mb-4" controlId="member-limit">
                          <AdminLabel>{m.admin_members_limit_label()}</AdminLabel>
                          <AdminInput
                            type="number"
                            max={2147483647}
                            min={1}
                            step={1}
                            value={field.value}
                            disabled={updateMutation.isPending}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onBlur={field.handleBlur}
                          />
                        </AdminField>
                      )}
                    </memberForm.Field>
                    <memberForm.Field name="months">
                      {(field) => (
                        <AdminField className="mb-4" controlId="member-months">
                          <AdminLabel>{m.admin_members_months_label()}</AdminLabel>
                          <AdminInput
                            type="number"
                            max={1200}
                            min={1}
                            step={1}
                            value={field.value}
                            disabled={updateMutation.isPending}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onBlur={field.handleBlur}
                          />
                        </AdminField>
                      )}
                    </memberForm.Field>
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {m.admin_people_save()}
                    </Button>
                  </form>
                  <AdminCheck
                    type="switch"
                    id="maintenance-mode-switch"
                    label={m.admin_settings_maintenance_mode_label()}
                    checked={maintenanceMode ?? false}
                    disabled={updateMutation.isPending}
                    onCheckedChange={async (enabled) => {
                      // Switching it on takes the whole public site offline, so ask first;
                      // switching it off restores the site and needs no confirmation.
                      if (
                        enabled &&
                        !(await confirm({
                          title: m.admin_settings_maintenance_confirm_title(),
                          body: m.admin_settings_maintenance_confirm_body(),
                          confirmLabel: m.admin_settings_maintenance_confirm_action(),
                          errorFallback: m.admin_error_update_settings(),
                          variant: "warning",
                        }))
                      ) {
                        return;
                      }
                      updateMutation.mutate({ maintenance_mode: enabled });
                    }}
                  />
                  <div className="text-subtle text-sm mt-2">
                    {m.admin_settings_maintenance_mode_help()}
                  </div>
                </>
              )}
              {section === "all" && <hr className="border-subtle my-6" />}
              {section !== "maintenance" && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void form.handleSubmit();
                  }}
                >
                  <form.Field name="publicEmail">
                    {(field) => (
                      <AdminField className="mb-4" controlId="public-email">
                        <AdminLabel>{m.admin_settings_public_email_label()}</AdminLabel>
                        <AdminInput
                          type="email"
                          value={field.value}
                          disabled={updateMutation.isPending}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                        <AdminDescription className="text-subtle">
                          {m.admin_settings_public_email_help()}
                        </AdminDescription>
                      </AdminField>
                    )}
                  </form.Field>
                  <form.Field name="publicPhone">
                    {(field) => (
                      <AdminField className="mb-4" controlId="public-phone">
                        <AdminLabel>{m.admin_settings_public_phone_label()}</AdminLabel>
                        <AdminInput
                          type="tel"
                          value={field.value}
                          disabled={updateMutation.isPending}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                        <AdminDescription className="text-subtle">
                          {m.admin_settings_public_phone_help()}
                        </AdminDescription>
                      </AdminField>
                    )}
                  </form.Field>
                  <form.Field name="facebookUrl">
                    {(field) => (
                      <AdminField className="mb-4" controlId="facebook-url">
                        <AdminLabel>{m.admin_settings_facebook_url_label()}</AdminLabel>
                        <AdminInput
                          type="url"
                          pattern="https://.*"
                          value={field.value}
                          disabled={updateMutation.isPending}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                        />
                        <AdminDescription className="text-subtle">
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
              )}
            </>
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </>
  );
}
