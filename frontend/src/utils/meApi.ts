import { m } from "@/paraglide/messages";

/** Delete the signed-in visitor's portal account (DELETE /api/me). */
export async function deleteMyAccount(accessToken: string): Promise<void> {
  const response = await fetch("/api/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.my_account_delete_error());
  }
}
