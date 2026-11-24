import { AdminField, AdminLabel, AdminInput } from "@/components/admin/AdminFields";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/api-types";

// ---------------------------------------------------------------------------
// TableLocator — search state lives here so a keystroke does not re-render the canvas
// ---------------------------------------------------------------------------

export function TableLocator({
  tables,
  selectedTable,
  onSelect,
}: {
  tables: FloorTable[];
  selectedTable: string | null;
  onSelect: (tableId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.toLowerCase();
  const matches = tables.filter((table) => table.name.toLowerCase().includes(needle));
  return (
    <div className="mb-4">
      <AdminField controlId="plan-table-search">
        <AdminLabel className="text-content" htmlFor="plan-table-search">
          {m.admin_layout_find_table()}
        </AdminLabel>
        <AdminInput
          id="plan-table-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </AdminField>
      <div
        className="max-h-40 overflow-auto flex flex-col gap-1 mt-2"
        aria-label={m.admin_layout_find_table()}
      >
        {matches.map((table) => (
          <Button
            key={table.id}
            variant={selectedTable === table.id ? "secondary" : "outline"}
            className="justify-start whitespace-normal text-left"
            aria-pressed={selectedTable === table.id}
            onClick={() => {
              onSelect(table.id);
              document
                .querySelector(`[data-plan-table="${CSS.escape(table.id)}"]`)
                ?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            {table.name}
          </Button>
        ))}
        {matches.length === 0 && (
          <p className="text-subtle" role="status">
            {m.admin_layout_no_matching_tables()}
          </p>
        )}
      </div>
    </div>
  );
}
