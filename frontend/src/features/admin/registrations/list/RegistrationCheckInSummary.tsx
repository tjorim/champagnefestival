import { formatNumber } from "@/lib/format/numberUtils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, FileSpreadsheetIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Progress } from "@/components/ui/progress";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";

interface EventCheckInStats {
  event_id: string;
  event_title: string;
  checked_in: number;
  total: number;
}

interface RegistrationCheckInSummaryProps {
  eventCapacityStats: EventCheckInStats[];
  checkInSummary: string | undefined;
  exportingEventId: string | null;
  handleExportEventCsv: (eventId: string) => Promise<void>;
}

/** The collapsible per-event check-in progress with a guest-list CSV export per event. */
export function RegistrationCheckInSummary({
  eventCapacityStats,
  checkInSummary,
  exportingEventId,
  handleExportEventCsv,
}: RegistrationCheckInSummaryProps) {
  const locale = getLocale();
  return (
    <Collapsible className="mt-2 pt-2 border-t border-subtle">
      <CollapsibleTrigger
        render={<Button variant="ghost" size="sm" />}
        className="h-auto max-w-full whitespace-normal text-left"
      >
        {checkInSummary}
        <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <div className="flex flex-col gap-2">
          {[...eventCapacityStats]
            .sort((a, b) => a.event_title.localeCompare(b.event_title))
            .map((eventStats) => {
              const checkInPercent =
                eventStats.total > 0 ? (eventStats.checked_in / eventStats.total) * 100 : 0;

              return (
                <div key={eventStats.event_id}>
                  <div className="flex justify-between gap-2 text-sm mb-1 flex-wrap">
                    <span className="text-subtle truncate">
                      <span className="font-semibold text-content me-2">
                        {eventStats.event_title}
                      </span>
                      {m.admin_checked_in()}: {formatNumber(eventStats.checked_in, locale)}/
                      {formatNumber(eventStats.total, locale)} {m.admin_guests_count()}
                    </span>
                    <span className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="py-0 px-1"
                        disabled={exportingEventId === eventStats.event_id}
                        onClick={() => void handleExportEventCsv(eventStats.event_id)}
                        title={m.admin_registrations_export_event_csv()}
                        aria-label={m.admin_registrations_export_event_csv_for({
                          event: eventStats.event_title,
                        })}
                      >
                        <Icon icon={FileSpreadsheetIcon} />
                      </Button>
                    </span>
                  </div>
                  <Progress
                    value={checkInPercent}
                    aria-label={`${eventStats.event_title}: ${formatNumber(eventStats.checked_in, locale)}/${formatNumber(eventStats.total, locale)} ${m.admin_checked_in()}`}
                  />
                </div>
              );
            })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
