import type { Organization, OrganizationCreate, OrganizationUpdate } from "@/api-types";
import { m } from "@/paraglide/messages";
import { adminRequest, fetchArrayOrThrow } from "./adminApi";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchOrganizations(): Promise<Organization[]> {
  return fetchArrayOrThrow<Organization>(
    "/api/organizations",
    {},
    m.admin_api_load_organizations(),
  );
}

/**
 * Create (`id` null) or replace the editable fields of an organisation. The
 * server mints the id, so the id is never part of the body. Not retried: a
 * create is not retry safe (docs/retry-safety.md).
 */
export async function saveOrganization(
  id: number | null,
  body: OrganizationCreate,
): Promise<Organization> {
  const response =
    id === null
      ? await adminRequest(
          "/api/organizations",
          { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) },
          m.admin_api_create_organization(),
        )
      : await adminRequest(
          `/api/organizations/${id}`,
          { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(body) },
          m.admin_api_update_organization(),
        );
  return response.json();
}

/** Archive (`active` false) or restore an organisation without touching its other fields. */
export async function setOrganizationActive(id: number, active: boolean): Promise<Organization> {
  const response = await adminRequest(
    `/api/organizations/${id}`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ active } satisfies OrganizationUpdate),
    },
    m.admin_api_update_organization_status(),
  );
  return response.json();
}

export async function deleteOrganization(id: number): Promise<void> {
  await adminRequest(
    `/api/organizations/${id}`,
    { method: "DELETE" },
    m.admin_api_delete_organization(),
  );
}
