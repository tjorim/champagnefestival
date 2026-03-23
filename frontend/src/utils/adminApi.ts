export async function requestApi(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, options);
}

export async function fetchJsonOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await requestApi(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? fallbackMessage);
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
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? fallbackMessage);
  }
}

export async function fetchArrayOrThrow<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
  mapper: (item: Record<string, unknown>) => T,
): Promise<T[]> {
  const response = await requestApi(url, options);
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? fallbackMessage);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload.map((item) => mapper(item as Record<string, unknown>)) : [];
}

export async function fetchJsonOrThrowWithUnauthorized<T>(
  url: string,
  options: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await requestApi(url, options);
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? fallbackMessage);
  }

  return (await response.json()) as T;
}

export async function fetchStatus(
  url: string,
  options: RequestInit,
): Promise<number> {
  const response = await requestApi(url, options);
  return response.status;
}
