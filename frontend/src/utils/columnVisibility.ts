import type { ColumnVisibilityState } from "@tanstack/react-table";

export function loadColVis(key: string): ColumnVisibilityState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    // Validate: every value must be boolean
    for (const val of Object.values(parsed)) {
      if (typeof val !== "boolean") return {};
    }
    return parsed as ColumnVisibilityState;
  } catch {
    return {};
  }
}

export function saveColVis(key: string, state: ColumnVisibilityState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}
