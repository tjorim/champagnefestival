import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { m } from "@/paraglide/messages";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface AdminTablePaginationProps {
  /** Total row count after filtering/sorting, before pagination slices it. */
  total: number;
  /** 0-based current page index, as TanStack Table tracks it. */
  pageIndex: number;
  pageSize: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

/**
 * Client-side pagination controls for admin tables whose full dataset is
 * already in the browser (People/Volunteers/Members) — as opposed to
 * RegistrationList's server-side page controls, which fetch one page at a
 * time and so track their own page/limit state instead of using this.
 */
export function AdminTablePagination({
  total,
  pageIndex,
  pageSize,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: AdminTablePaginationProps) {
  if (total === 0) return null;

  const rangeFrom = pageIndex * pageSize + 1;
  const rangeTo = Math.min((pageIndex + 1) * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 border-top border-secondary">
      <span className="text-secondary small">
        {m.admin_table_page_summary({ from: rangeFrom, to: rangeTo, total })}
      </span>
      <div className="d-flex align-items-center gap-2">
        <Form.Select
          size="sm"
          className="bg-dark text-light border-secondary"
          style={{ width: "auto" }}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={m.admin_table_page_size_aria()}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Form.Select>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={!canPreviousPage}
          onClick={onPreviousPage}
        >
          {m.admin_table_page_previous()}
        </Button>
        <span className="text-secondary small">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button variant="outline-secondary" size="sm" disabled={!canNextPage} onClick={onNextPage}>
          {m.admin_table_page_next()}
        </Button>
      </div>
    </div>
  );
}
