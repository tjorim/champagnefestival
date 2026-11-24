import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SortingState } from "@tanstack/react-table";
import { m } from "@/paraglide/messages";
import type { RegistrationStatus } from "@/types/registration";
import { type RegistrationSortKey } from "@/lib/api/adminFetch";
import { toLocalDateKey } from "@/lib/format/dateUtils";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { useTodayKey } from "@/hooks/useTodayKey";
import {
  type EditionFilter,
  type DateFilter,
  type AllocationRef,
  DEFAULT_PAGE_SIZE,
  SORT_KEY_BY_COLUMN,
} from "./registrationListConfig";

interface RegistrationFiltersOptions {
  activeEdition: ActiveEdition;
  applyActiveEditionFilterRequest: number;
  countedPendingQueue: boolean;
  filter: "all" | RegistrationStatus;
  onFilterChange: (filter: "all" | RegistrationStatus) => void;
  organizations: AllocationRef[];
  sorting: SortingState;
  clearSelection: () => void;
}

/** The list's filter, search and paging state, and the backend query parameters derived from it. */
export function useRegistrationFilters({
  activeEdition,
  applyActiveEditionFilterRequest,
  countedPendingQueue,
  filter,
  onFilterChange,
  organizations,
  sorting,
  clearSelection,
}: RegistrationFiltersOptions) {
  const [allocationFilter, setAllocationFilter] = useState("");
  const [editionFilter, setEditionFilter] = useState<EditionFilter>("all");
  const [activeEditionOnly, setActiveEditionOnly] = useState(applyActiveEditionFilterRequest !== 0);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const todayKey = useTodayKey();
  const filterDefaultsAppliedRef = useRef<string | null>(null);

  // Guards against resetting `page` on the vacuous debounce firing 300ms after
  // every mount (q hasn't actually changed then) — only an actual change to
  // the debounced search term should knock the user back to page 1.
  const debouncedQRef = useRef(debouncedQ);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = q.trim();
      setDebouncedQ(next);
      if (next !== debouncedQRef.current) {
        debouncedQRef.current = next;
        setPage(1);
        clearSelection();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, clearSelection]);

  const allocationOptions: { key: string; label: string; personId: string }[] = useMemo(
    () =>
      organizations
        .filter((e) => e.contact_person_id)
        .map((e) => ({
          key: `e:${e.id}`,
          label: `${m.admin_allocation_organization_label()}: ${e.name}`,
          personId: e.contact_person_id!,
        })),
    [organizations],
  );

  const filterPersonId = allocationFilter
    ? (allocationOptions.find((o) => o.key === allocationFilter)?.personId ?? null)
    : null;

  const activeEditionDateKeys = useMemo(
    () => activeEdition.dates.map((date) => toLocalDateKey(date)),
    [activeEdition.dates],
  );
  const activeDayIndex = activeEditionDateKeys.indexOf(todayKey);
  const isActiveEditionDay = activeDayIndex >= 0;

  useEffect(() => {
    if (!isActiveEditionDay || countedPendingQueue) return;
    if (filterDefaultsAppliedRef.current === activeEdition.id) return;
    filterDefaultsAppliedRef.current = activeEdition.id;
    setActiveEditionOnly(true);
    setPage(1);
    clearSelection();
  }, [activeEdition.id, isActiveEditionDay, clearSelection, countedPendingQueue]);

  // The parent bumps this counter to imperatively request the filter. Adjust
  // during render (comparing against the previous value) rather than in an
  // effect, since this only needs to react to that one transition.
  const [appliedEditionFilterRequest, setAppliedEditionFilterRequest] = useState(
    applyActiveEditionFilterRequest,
  );
  if (applyActiveEditionFilterRequest !== appliedEditionFilterRequest) {
    setAppliedEditionFilterRequest(applyActiveEditionFilterRequest);
    if (applyActiveEditionFilterRequest !== 0) {
      setActiveEditionOnly(true);
      setPage(1);
      clearSelection();
    }
  }

  const changeStatusFilter = useCallback(
    (next: "all" | RegistrationStatus) => {
      onFilterChange(next);
      setPage(1);
      clearSelection();
    },
    [onFilterChange, clearSelection],
  );

  const changeAllocationFilter = useCallback(
    (value: string) => {
      setAllocationFilter(value);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const changeEditionFilter = useCallback(
    (value: EditionFilter) => {
      setEditionFilter(value);
      setActiveEditionOnly(false);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const toggleActiveEditionOnly = useCallback(() => {
    setActiveEditionOnly((current) => !current);
    setEditionFilter("all");
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const toggleDateFilter = useCallback(() => {
    setDateFilter((current) => (current === "today" ? "all" : "today"));
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const changePageSize = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  }, []);

  const activeSort = sorting[0];
  const backendSort: RegistrationSortKey | undefined = activeSort
    ? SORT_KEY_BY_COLUMN[activeSort.id]
    : undefined;
  const backendSortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";
  const backendStatus = filter === "all" ? "" : filter;
  const backendEditionId = activeEditionOnly ? activeEdition.id : "";
  const backendEventDate = dateFilter === "today" ? todayKey : "";
  const backendEditionCategory = editionFilter === "all" ? "" : editionFilter;

  // Shared with the "select all matching" bulk-selection fetch and the CSV
  // export below, so both act on exactly the same filter set the table is
  // currently showing — everything except page/limit, which each caller
  // supplies for itself.
  const currentFilterParams = useMemo(
    () => ({
      query: debouncedQ || undefined,
      status: backendStatus || undefined,
      personId: filterPersonId ?? undefined,
      editionId: backendEditionId || undefined,
      eventDate: backendEventDate || undefined,
      editionCategory: backendEditionCategory || undefined,
      sort: backendSort,
      sortDir: backendSort ? backendSortDir : undefined,
    }),
    [
      debouncedQ,
      backendStatus,
      filterPersonId,
      backendEditionId,
      backendEventDate,
      backendEditionCategory,
      backendSort,
      backendSortDir,
    ],
  );

  const hasActiveRegistrationFilters =
    q.trim().length > 0 ||
    filter !== "all" ||
    allocationFilter !== "" ||
    activeEditionOnly ||
    dateFilter !== "all" ||
    editionFilter !== "all";

  const handleClearRegistrationFilters = useCallback(() => {
    setQ("");
    setDebouncedQ("");
    debouncedQRef.current = "";
    onFilterChange("all");
    setAllocationFilter("");
    setActiveEditionOnly(false);
    setDateFilter("all");
    setEditionFilter("all");
    setPage(1);
    clearSelection();
  }, [onFilterChange, clearSelection]);

  return {
    todayKey,
    allocationFilter,
    editionFilter,
    activeEditionOnly,
    dateFilter,
    q,
    setQ,
    page,
    setPage,
    pageSize,
    allocationOptions,
    changeStatusFilter,
    changeAllocationFilter,
    changeEditionFilter,
    toggleActiveEditionOnly,
    toggleDateFilter,
    changePageSize,
    backendEditionId,
    currentFilterParams,
    hasActiveRegistrationFilters,
    handleClearRegistrationFilters,
  };
}

export type RegistrationFiltersState = ReturnType<typeof useRegistrationFilters>;
