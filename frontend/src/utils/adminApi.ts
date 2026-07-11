const NETWORK_ERROR_MESSAGE =
  "We could not reach the server. Check your internet connection and try again.";

export async function requestApi(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    console.error("Admin API network request failed", { url, error });
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const requestId = response.headers.get("X-Request-ID");
  const data = await response.json().catch(() => ({}));
  const detail = (data as { detail?: string }).detail ?? fallbackMessage;
  if (requestId) {
    console.error("Admin API request failed", {
      requestId,
      status: response.status,
      statusText: response.statusText,
      detail,
    });
  }
  return detail;
}

export async function fetchJsonOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await requestApi(url, options);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
}

export async function fetchVoidOrThrow(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  const response = await requestApi(url, options);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
}

export async function fetchArrayOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
  mapper: (item: Record<string, unknown>) => T,
): Promise<T[]> {
  const response = await requestApi(url, options);
  if (response.status === 401 || response.status === 403) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }

  const payload = await response.json();
  return Array.isArray(payload)
    ? payload.map((item) => mapper(item as Record<string, unknown>))
    : [];
}

export async function fetchJsonOrThrowWithUnauthorized<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await requestApi(url, options);
  if (response.status === 401 || response.status === 403) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
}

export async function fetchVoidOrThrowWithUnauthorized(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  const response = await requestApi(url, options);
  if (response.status === 401 || response.status === 403) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
}

export async function fetchStatus(url: string, options: RequestInit): Promise<number> {
  const response = await requestApi(url, options);
  return response.status;
}

/** Fetch a CSV (or other file) response and trigger a browser download. */
export async function downloadFileOrThrow(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
  fallbackFilename: string,
): Promise<void> {
  const response = await requestApi(url, options);
  if (response.status === 401 || response.status === 403) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }

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
