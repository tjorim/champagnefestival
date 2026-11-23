import { getStoredAccessToken } from "@/config/oidc";
import { m } from "@/paraglide/messages";
import { ApiError, apiErrorFromResponse, apiErrorMessage, hasApiErrorCode } from "./apiErrors";

export const SESSION_EXPIRED_ERROR = "session_expired";
export const UNAUTHORIZED_ERROR = "unauthorized";

function throwAuthError(response: Response): void {
  if (response.status === 401) {
    throw new Error(SESSION_EXPIRED_ERROR);
  }
  if (response.status === 403) {
    throw new Error(UNAUTHORIZED_ERROR);
  }
}

export async function adminRequest(
  url: string,
  options: RequestInit = {},
  fallbackMessage: string = m.admin_api_request_failed(),
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = url.startsWith("/api/") ? getStoredAccessToken() : null;
  if (token && !headers.has("Authorization")) headers.set("Authorization", "Bearer ".concat(token));
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers: Object.fromEntries(headers) });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    console.error("Admin API network request failed", { url, error });
    throw new ApiError(m.admin_error_network(), { status: 0, code: "network_error" });
  }
  throwAuthError(response);
  if (!response.ok) throw await extractError(response, fallbackMessage);
  return response;
}

async function extractError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const requestId = response.headers.get("X-Request-ID");
  const error = await apiErrorFromResponse(response, fallbackMessage);
  console.error("Admin API request failed", {
    requestId,
    status: response.status,
    statusText: response.statusText,
    detail: error.message,
    code: error.code,
  });
  return error;
}

export async function fetchJsonOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  return (await adminRequest(url, options, fallbackMessage)).json();
}

export async function fetchVoidOrThrow(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  await adminRequest(url, options, fallbackMessage);
}

export async function fetchArrayOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T[]> {
  const payload = await fetchJsonOrThrow<T[]>(url, options, fallbackMessage);
  return Array.isArray(payload) ? payload : [];
}

/** Fetch a CSV (or other file) response and trigger a browser download. */
export async function downloadFileOrThrow(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
  fallbackFilename: string,
): Promise<void> {
  const response = await adminRequest(url, options, fallbackMessage);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = /filename="?([^";]+)"?/.exec(disposition);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
}

/** Signage writes are explicit and never automatically retried (docs/retry-safety.md). */
export function signageRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return fetchJsonOrThrow<T>(
    `/api/signage/${path}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    },
    m.signage_channels_error(),
  );
}

/** An uncertain write may have succeeded: preserve the caller's reconciliation guidance. */
export function signageOperationErrorMessage(error: unknown, fallback: string): string {
  return hasApiErrorCode(error, "network_error") ? fallback : apiErrorMessage(error, fallback);
}
