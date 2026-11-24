import { formatNumber } from "@/lib/format/numberUtils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { AdminSelect, AdminOption, AdminInput } from "@/components/admin/AdminFields";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import type { RegistrationStatus } from "@/types/registration";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { editionDisplayNameWithType } from "@/lib/editions/editionName";
import { statusLabel } from "./registrationDisplay";
import { type RegistrationFiltersState } from "./useRegistrationFilters";

interface RegistrationFiltersProps {
  filters: RegistrationFiltersState;
  /** The status filter, owned by the parent (the section keeps it across tabs). */
  filter: "all" | RegistrationStatus;
  statusCounts: { all: number; pending: number; confirmed: number };
  editionCounts: { all: number; festival: number; standalone: number; active: number };
  todayCount: number;
  activeEdition: ActiveEdition;
}

/** The search box and the collapsible edition, date, status and allocation filters. */
export function RegistrationFilters({
  filters,
  filter,
  statusCounts,
  editionCounts,
  todayCount,
  activeEdition,
}: RegistrationFiltersProps) {
  const locale = getLocale();
  const {
    q,
    setQ,
    activeEditionOnly,
    editionFilter,
    dateFilter,
    allocationOptions,
    allocationFilter,
    hasActiveRegistrationFilters,
    handleClearRegistrationFilters,
    changeEditionFilter,
    toggleActiveEditionOnly,
    changeAllocationFilter,
    toggleDateFilter,
    changeStatusFilter,
  } = filters;
  return (
    <>
      <AdminInput
        size="sm"
        type="search"
        placeholder={m.admin_search_person_placeholder()}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="bg-muted text-content border-input max-w-72"
      />
      <Collapsible>
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
            {m.admin_registration_filters()}
          </CollapsibleTrigger>
          <span className="text-sm" role="status">
            {[
              activeEditionOnly ? m.admin_filter_active_edition() : m.admin_filter_edition_all(),
              editionFilter !== "all"
                ? editionFilter === "festival"
                  ? m.admin_filter_edition_festivals()
                  : m.admin_filter_edition_standalone()
                : null,
              filter !== "all" ? statusLabel(filter) : null,
              dateFilter === "today" ? m.admin_filter_today() : null,
              allocationOptions.find((option) => option.key === allocationFilter)?.label,
              q || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {hasActiveRegistrationFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearRegistrationFilters}>
              {m.admin_content_clear_filters()}
            </Button>
          )}
        </div>
        <CollapsibleContent>
          {/* Row 2: filters + search */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                {m.admin_filter_edition_caption()}
              </span>
              <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
                <ToggleGroup
                  aria-label={m.admin_filter_edition_aria()}
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={[editionFilter]}
                  onValueChange={(values) => {
                    const value = values[0];
                    if (value === "all" || value === "festival" || value === "standalone")
                      changeEditionFilter(value);
                  }}
                >
                  <ToggleGroupItem value="all">
                    {m.admin_filter_edition_all()} ({formatNumber(editionCounts.all, locale)})
                  </ToggleGroupItem>
                  <ToggleGroupItem value="festival">
                    {m.admin_filter_edition_festivals()} (
                    {formatNumber(editionCounts.festival, locale)})
                  </ToggleGroupItem>
                  <ToggleGroupItem value="standalone">
                    {m.admin_filter_edition_standalone()} (
                    {formatNumber(editionCounts.standalone, locale)})
                  </ToggleGroupItem>
                </ToggleGroup>
                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={activeEditionOnly}
                  onPressedChange={toggleActiveEditionOnly}
                >
                  {m.admin_filter_active_edition()}: {editionDisplayNameWithType(activeEdition)} (
                  {formatNumber(editionCounts.active, locale)})
                </Toggle>
              </div>
              {allocationOptions.length > 0 && (
                <AdminSelect
                  size="sm"
                  className="bg-muted text-content border-input max-w-50"

                  value={allocationFilter}
                  onValueChange={(e) => changeAllocationFilter(e)}
                  aria-label={m.admin_filter_allocation_aria()}
                >
                  <AdminOption value="">{m.admin_all_allocations()}</AdminOption>
                  {allocationOptions.map((o) => (
                    <AdminOption key={o.key} value={o.key}>
                      {o.label}
                    </AdminOption>
                  ))}
                </AdminSelect>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                {m.admin_filter_date_caption()}
              </span>
              <ToggleGroup
                aria-label={m.admin_filter_date_aria()}
                variant="outline"
                size="sm"
                value={dateFilter === "today" ? ["today"] : []}
                onValueChange={toggleDateFilter}
              >
                <ToggleGroupItem value="today">
                  {m.admin_filter_today()} ({formatNumber(todayCount, locale)})
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                {m.admin_filter_status_caption()}
              </span>
              <ToggleGroup
                aria-label={m.admin_filter_status_aria()}
                variant="outline"
                size="sm"
                value={[filter]}
                onValueChange={(values) => {
                  const value = values[0];
                  if (value === "all" || value === "pending" || value === "confirmed")
                    changeStatusFilter(value);
                }}
              >
                <ToggleGroupItem value="all">
                  {m.admin_filter_all()} ({formatNumber(statusCounts.all, locale)})
                </ToggleGroupItem>
                <ToggleGroupItem value="pending">
                  {m.admin_filter_pending()} ({formatNumber(statusCounts.pending, locale)})
                </ToggleGroupItem>
                <ToggleGroupItem value="confirmed">
                  {m.admin_filter_confirmed()} ({formatNumber(statusCounts.confirmed, locale)})
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
